from typing import Optional, Tuple
import requests
from datetime import datetime, timedelta
from app.config import settings
import time
from app.metrics import provider_metrics
import threading

# 简易熔断与退避实现（进程内）
_cb_lock = threading.Lock()
_cb_state: dict[tuple[str, Optional[str]], dict] = {}

CB_FAIL_THRESHOLD = 3
CB_RESET_SECONDS = 60
RETRY_STATUSES = {429, 500, 502, 503, 504}

class ProviderError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(f"ProviderError {status} {code}: {message}")
        self.status = status
        self.code = code
        self.message = message

def _proxies():
    proxies = {}
    if settings.http_proxy:
        proxies["http"] = settings.http_proxy
    if settings.https_proxy:
        proxies["https"] = settings.https_proxy
    return proxies or None


def _circuit_open(endpoint: str, team_id: Optional[str]) -> bool:
    key = (endpoint, team_id)
    with _cb_lock:
        st = _cb_state.get(key)
        if not st:
            return False
        if st.get('state') == 'open':
            opened_at = st.get('opened_at', 0.0)
            if (time.monotonic() - opened_at) < CB_RESET_SECONDS:
                return True
            # 半开
            st['state'] = 'half'
            return False
    return False


def _record_success(endpoint: str, team_id: Optional[str]):
    key = (endpoint, team_id)
    with _cb_lock:
        _cb_state[key] = {'state': 'closed', 'fail': 0, 'opened_at': 0.0}


def _record_failure(endpoint: str, team_id: Optional[str]):
    key = (endpoint, team_id)
    with _cb_lock:
        st = _cb_state.get(key) or {'state': 'closed', 'fail': 0, 'opened_at': 0.0}
        st['fail'] = st.get('fail', 0) + 1
        if st['fail'] >= CB_FAIL_THRESHOLD:
            st['state'] = 'open'
            st['opened_at'] = time.monotonic()
        _cb_state[key] = st


def _with_resilience(do_request, endpoint: str, team_id: Optional[str]):
    if _circuit_open(endpoint, team_id):
        raise ProviderError(503, 'circuit_open', f'Circuit open for {endpoint}:{team_id or "-"}')
    last_exc: Optional[Exception] = None
    for attempt in range(3):
        try:
            return do_request()
        except ProviderError as e:
            last_exc = e
            if e.status in RETRY_STATUSES and attempt < 2:
                time.sleep(0.5 * (2 ** attempt))
                continue
            _record_failure(endpoint, team_id)
            raise
        except Exception as e:
            last_exc = e
            if attempt < 2:
                time.sleep(0.5 * (2 ** attempt))
                continue
            _record_failure(endpoint, team_id)
            raise
    if last_exc:
        raise last_exc

def fetch_session_via_cookie(cookie: str) -> Tuple[str, Optional[datetime], Optional[str], Optional[str]]:
    url = "https://chatgpt.com/api/auth/session"
    headers = {
        "cookie": cookie,
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "accept": "application/json, */*",
    }
    r = requests.get(url, headers=headers, timeout=30, proxies=_proxies())
    if r.status_code != 200:
        raise ProviderError(r.status_code, "session_fetch_failed", r.text[:500])
    
    data = r.json()
    token = data.get("accessToken")
    user = data.get("user", {}) or {}
    email = user.get("email")
    account = data.get("account", {}) or {}
    account_id = account.get("id")
    
    # Some responses may include expires; if not, leave None
    exp = data.get("expires")
    token_expires_at = None
    if exp:
        try:
            token_expires_at = datetime.fromisoformat(exp.replace("Z", "+00:00"))
        except Exception:
            token_expires_at = None
    # 回退逻辑：若未提供 expires，则按配置默认 +N 天
    if token_expires_at is None:
        try:
            token_expires_at = datetime.utcnow() + timedelta(days=settings.token_default_ttl_days)
        except Exception:
            token_expires_at = None
    
    if not token:
        raise ProviderError(500, "no_access_token", "No accessToken in session response")
    
    return token, token_expires_at, email, account_id

BASE = "https://chatgpt.com/backend-api"

def _headers(access_token: str, team_id: Optional[str] = None) -> dict:
    h = {
        "authorization": f"Bearer {access_token}",
        "content-type": "application/json",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "accept": "application/json, */*",
    }
    if team_id:
        h["chatgpt-account-id"] = team_id
    return h

def send_invite(access_token: str, team_id: str, email: str, role: str = "standard-user", resend: bool = True) -> dict:
    def _do():
        url = f"{BASE}/accounts/{team_id}/invites"
        payload = {
            "email_addresses": [email],
            "role": role,
            "resend_emails": resend,
        }
        t0 = time.time()
        r = requests.post(url, headers=_headers(access_token, team_id), json=payload, timeout=30, proxies=_proxies())
        provider_metrics.record("send_invite", team_id, r.status_code, (time.time()-t0)*1000)
        if r.status_code not in (200, 201):
            raise ProviderError(r.status_code, "invite_failed", r.text[:1000])
        try:
            return r.json()
        except Exception:
            return {"raw": r.text}
    resp = _with_resilience(_do, 'send_invite', team_id)
    _record_success('send_invite', team_id)
    return resp

def delete_member(access_token: str, team_id: str, member_id: str) -> dict:
    def _do():
        url = f"{BASE}/accounts/{team_id}/users/{member_id}"
        t0 = time.time()
        r = requests.delete(url, headers=_headers(access_token, team_id), timeout=30, proxies=_proxies())
        provider_metrics.record("delete_member", team_id, r.status_code, (time.time()-t0)*1000)
        if r.status_code not in (200, 204):
            raise ProviderError(r.status_code, "remove_member_failed", r.text[:1000])
        try:
            return r.json() if r.text else {"ok": True}
        except Exception:
            return {"ok": True}
    resp = _with_resilience(_do, 'delete_member', team_id)
    _record_success('delete_member', team_id)
    return resp

def list_members(access_token: str, team_id: str) -> dict:
    def _do():
        url = f"{BASE}/accounts/{team_id}/users"
        t0 = time.time()
        r = requests.get(url, headers=_headers(access_token, team_id), timeout=30, proxies=_proxies())
        provider_metrics.record("list_members", team_id, r.status_code, (time.time()-t0)*1000)
        if r.status_code != 200:
            raise ProviderError(r.status_code, "list_members_failed", r.text[:1000])
        return r.json()
    resp = _with_resilience(_do, 'list_members', team_id)
    _record_success('list_members', team_id)
    return resp

def list_invites(access_token: str, team_id: str) -> dict:
    def _do():
        url = f"{BASE}/accounts/{team_id}/invites"
        t0 = time.time()
        r = requests.get(url, headers=_headers(access_token, team_id), timeout=30, proxies=_proxies())
        provider_metrics.record("list_invites", team_id, r.status_code, (time.time()-t0)*1000)
        if r.status_code != 200:
            raise ProviderError(r.status_code, "list_invites_failed", r.text[:1000])
        return r.json()
    resp = _with_resilience(_do, 'list_invites', team_id)
    _record_success('list_invites', team_id)
    return resp

def cancel_invite(access_token: str, team_id: str, invite_id: str) -> dict:
    def _do():
        url = f"{BASE}/accounts/{team_id}/invites/{invite_id}"
        t0 = time.time()
        r = requests.delete(url, headers=_headers(access_token, team_id), timeout=30, proxies=_proxies())
        provider_metrics.record("cancel_invite", team_id, r.status_code, (time.time()-t0)*1000)
        if r.status_code not in (200, 204):
            raise ProviderError(r.status_code, "cancel_invite_failed", r.text[:1000])
        try:
            return r.json() if r.text else {"ok": True}
        except Exception:
            return {"ok": True}
    resp = _with_resilience(_do, 'cancel_invite', team_id)
    _record_success('cancel_invite', team_id)
    return resp
