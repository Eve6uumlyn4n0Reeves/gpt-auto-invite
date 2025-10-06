import json
import threading
import time
from typing import Optional

import PySimpleGUI as sg
import requests
from playwright.sync_api import sync_playwright


class BackendClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()

    def admin_login(self, password: str) -> bool:
        r = self.session.post(f"{self.base_url}/api/admin/login", json={"password": password})
        return r.ok

    def admin_me(self) -> Optional[dict]:
        try:
            r = self.session.get(f"{self.base_url}/api/admin/me", timeout=10)
            return r.json() if r.ok else None
        except Exception:
            return None

    def health(self) -> bool:
        try:
            r = self.session.get(f"{self.base_url}/health", timeout=10)
            return r.ok
        except Exception:
            return False

    def import_cookie(self, cookie: str) -> requests.Response:
        return self.session.post(f"{self.base_url}/api/admin/import-cookie", json={"cookie": cookie})

    def save_mother(self, name: str, access_token: str, token_expires_at: Optional[str], teams: list[dict], notes: Optional[str] = None) -> requests.Response:
        payload = {
            "name": name,
            "access_token": access_token,
            "token_expires_at": token_expires_at,
            "teams": teams,
            "notes": notes,
        }
        return self.session.post(f"{self.base_url}/api/admin/mothers", json=payload)


def fetch_session_in_page(page) -> dict:
    # Execute in page context; ensure credentials include cookies
    js = """
    (async () => {
        const r = await fetch('https://chatgpt.com/api/auth/session', { credentials: 'include' });
        if (!r.ok) throw new Error('session http ' + r.status);
        const j = await r.json();
        return { access_token: j.accessToken, token_expires_at: j.expires, user_email: (j.user && j.user.email) || null, account_id: (j.account && j.account.id) || null };
    })();
    """
    return page.evaluate(js)


def run_gui():
    sg.theme('SystemDefaultForReal')

    layout = [
        [sg.Text('后端地址', size=(10,1)), sg.Input('http://localhost:8000', key='-BASE-URL-', size=(40,1)), sg.Button('检查后端', key='-CHECK-HEALTH-')],
        [sg.Text('云端地址', size=(10,1)), sg.Input('http://localhost:3000', key='-FRONT-URL-', size=(40,1)), sg.Button('打开云端后台', key='-OPEN-FRONT-')],
        [sg.Frame('母号信息', [
            [sg.Text('母号名称', size=(14,1)), sg.Input(key='-MOTHER-NAME-', size=(40,1))],
            [sg.Text('团队ID（逗号或换行）', size=(14,1)), sg.Multiline(key='-TEAMS-', size=(40,3)), sg.Text('默认取第一项')],
            [sg.Text('备注', size=(14,1)), sg.Input(key='-NOTES-', size=(40,1))],
        ])],
        [sg.Frame('Token', [
            [sg.Multiline('', key='-TOKEN-JSON-', size=(70,8))],
            [
                sg.Button('登录并获取Token'),
                sg.Button('我已登录，获取Token'),
                sg.Button('从Cookie导入Token', key='-IMPORT-COOKIE-'),
                sg.Button('发送到后端'),
                sg.Button('重置浏览器'),
                sg.Button('退出')
            ],
        ])],
        [sg.Frame('批量', [
            [
                sg.Text('当前条目：', size=(10,1)), sg.Text('0', key='-BATCH-COUNT-', size=(6,1)),
                sg.Button('加入批量'), sg.Button('导出批量'), sg.Button('清空批量'), sg.Button('上传到云端')
            ]
        ])],
        [sg.StatusBar('就绪', key='-STATUS-')]
    ]

    window = sg.Window('GPT Team 母号录入工具', layout, finalize=True)

    browser = None
    context = None
    page = None
    pw = None

    def ensure_browser():
        nonlocal pw, browser, context, page
        if pw is None:
            pw = sync_playwright().start()
        if browser is None:
            # Use Chromium headful so you can log in
            browser = pw.chromium.launch(headless=False)
        if context is None:
            context = browser.new_context()
        if page is None:
            page = context.new_page()
        return page

    batch_entries: list[dict] = []

    try:
        while True:
            event, values = window.read()
            if event in (sg.WINDOW_CLOSED, '退出'):
                break

            if event == '检查后端' or event == '-CHECK-HEALTH-':
                try:
                    base = values['-BASE-URL-'].strip()
                    client = BackendClient(base)
                    ok = client.health()
                    window['-STATUS-'].update('后端正常' if ok else '后端不可用')
                except Exception as e:
                    window['-STATUS-'].update(f'检查失败: {e}')

            if event == '打开云端后台' or event == '-OPEN-FRONT-':
                try:
                    import webbrowser
                    front = values['-FRONT-URL-'].strip()
                    url = front.rstrip('/') + '/admin'
                    webbrowser.open(url)
                    window['-STATUS-'].update(f'已打开：{url}')
                except Exception as e:
                    window['-STATUS-'].update(f'打开失败: {e}')

            if event == '登录并获取Token':
                try:
                    page = ensure_browser()
                    window['-STATUS-'].update('正在打开 chatgpt.com ...')
                    page.goto('https://chatgpt.com/', wait_until='domcontentloaded')
                    window['-STATUS-'].update('请在打开窗口中完成登录，然后点击“我已登录，获取Token”')
                except Exception as e:
                    window['-STATUS-'].update(f'打开浏览器失败: {e}')

            if event == '我已登录，获取Token':
                try:
                    if page is None:
                        window['-STATUS-'].update('未打开浏览器/页面，请先点击“登录并获取Token”。')
                        continue
                    window['-STATUS-'].update('正在获取会话 ...')
                    data = fetch_session_in_page(page)
                    window['-TOKEN-JSON-'].update(json.dumps(data, ensure_ascii=False, indent=2))
                    # 自动填充母号名称（优先邮箱）
                    try:
                        if data.get('user_email') and not values['-MOTHER-NAME-'].strip():
                            window['-MOTHER-NAME-'].update(data['user_email'])
                    except Exception:
                        pass
                    window['-STATUS-'].update('会话获取成功。')
                except Exception as e:
                    window['-STATUS-'].update(f'获取失败: {e}')

            if event == '-IMPORT-COOKIE-':
                try:
                    base = values['-BASE-URL-'].strip()
                    client = BackendClient(base)
                    pwd = sg.popup_get_text('管理员密码', password_char='*')
                    if not pwd:
                        window['-STATUS-'].update('已取消。')
                        continue
                    if not client.admin_login(pwd):
                        window['-STATUS-'].update('管理员登录失败。')
                        continue
                    cookie = sg.popup_get_text('粘贴从浏览器复制的 Cookie 字符串', password_char=None)
                    if not cookie:
                        window['-STATUS-'].update('已取消。')
                        continue
                    window['-STATUS-'].update('通过 Cookie 导入中 ...')
                    r = client.import_cookie(cookie)
                    if not r.ok:
                        try:
                            detail = r.json().get('detail')
                        except Exception:
                            detail = r.text
                        window['-STATUS-'].update(f'导入失败：{detail}')
                        continue
                    data = r.json()
                    token_obj = {
                        'access_token': data.get('access_token'),
                        'token_expires_at': data.get('token_expires_at'),
                        'user_email': data.get('user_email'),
                        'account_id': data.get('account_id'),
                    }
                    window['-TOKEN-JSON-'].update(json.dumps(token_obj, ensure_ascii=False, indent=2))
                    # 自动填充母号名称
                    if data.get('user_email'):
                        window['-MOTHER-NAME-'].update(data['user_email'])
                    elif data.get('account_id'):
                        window['-MOTHER-NAME-'].update(str(data['account_id']))
                    window['-STATUS-'].update('导入成功。')
                except Exception as e:
                    window['-STATUS-'].update(f'导入失败: {e}')

            if event == '发送到后端':
                try:
                    base = values['-BASE-URL-'].strip()
                    name = values['-MOTHER-NAME-'].strip()
                    notes = values['-NOTES-'].strip() or None
                    teams_txt = values['-TEAMS-']
                    raw = values['-TOKEN-JSON-'].strip()
                    if not name:
                        window['-STATUS-'].update('请输入母号名称')
                        continue
                    if not raw:
                        window['-STATUS-'].update('Token JSON 为空')
                        continue
                    try:
                        token_obj = json.loads(raw)
                    except Exception as e:
                        window['-STATUS-'].update(f'无效的 Token JSON: {e}')
                        continue
                    access_token = token_obj.get('access_token')
                    token_expires_at = token_obj.get('token_expires_at')
                    if not access_token:
                        window['-STATUS-'].update('JSON 中缺少 access_token')
                        continue
                    teams = []
                    if teams_txt:
                        # 支持逗号或换行分隔
                        raw_items = [s.strip() for s in teams_txt.replace('\r', '\n').replace(',', '\n').split('\n')]
                        arr = [s for s in raw_items if s]
                        for i, team_id in enumerate(arr):
                            teams.append({
                                'team_id': team_id,
                                'team_name': team_id,
                                'is_enabled': True,
                                'is_default': i == 0,
                            })
                    pwd = sg.popup_get_text('管理员密码', password_char='*')
                    if not pwd:
                        window['-STATUS-'].update('已取消。')
                        continue
                    window['-STATUS-'].update('正在发送到后端 ...')

                    def _worker_send(base_url, password, name, access_token, token_expires_at, teams, notes):
                        try:
                            client = BackendClient(base_url)
                            if not client.admin_login(password):
                                window.write_event_value('-SEND-DONE-', {'ok': False, 'error': '管理员登录失败'})
                                return
                            r = client.save_mother(name=name, access_token=access_token, token_expires_at=token_expires_at, teams=teams, notes=notes)
                            try:
                                payload = r.json()
                            except Exception:
                                payload = r.text
                            window.write_event_value('-SEND-DONE-', {'ok': r.ok, 'status': r.status_code, 'payload': payload})
                        except Exception as e:
                            window.write_event_value('-SEND-DONE-', {'ok': False, 'error': str(e)})

                    threading.Thread(target=_worker_send, args=(base, pwd, name, access_token, token_expires_at, teams, notes), daemon=True).start()
                except Exception as e:
                    window['-STATUS-'].update(f'发送失败: {e}')

            if event == '加入批量':
                try:
                    name = values['-MOTHER-NAME-'].strip()
                    teams_txt = values['-TEAMS-']
                    notes = values['-NOTES-'].strip() or None
                    raw = values['-TOKEN-JSON-'].strip()
                    if not name:
                        window['-STATUS-'].update('请输入母号名称')
                        continue
                    if not raw:
                        window['-STATUS-'].update('Token JSON 为空')
                        continue
                    token_obj = json.loads(raw)
                    access_token = token_obj.get('access_token')
                    token_expires_at = token_obj.get('token_expires_at')
                    if not access_token:
                        window['-STATUS-'].update('JSON 中缺少 access_token')
                        continue
                    teams = []
                    if teams_txt:
                        raw_items = [s.strip() for s in teams_txt.replace('\r', '\n').replace(',', '\n').split('\n')]
                        arr = [s for s in raw_items if s]
                        for i, team_id in enumerate(arr):
                            teams.append({
                                'team_id': team_id,
                                'team_name': team_id,
                                'is_enabled': True,
                                'is_default': i == 0,
                            })
                    entry = {
                        'name': name,
                        'access_token': access_token,
                        'token_expires_at': token_expires_at,
                        'notes': notes,
                        'teams': teams,
                        'email': token_obj.get('user_email') or (name if ('@' in name) else None),
                    }
                    batch_entries.append(entry)
                    window['-BATCH-COUNT-'].update(str(len(batch_entries)))
                    window['-STATUS-'].update('已加入批量。')
                except Exception as e:
                    window['-STATUS-'].update(f'加入失败: {e}')

            if event == '导出批量':
                try:
                    if not batch_entries:
                        window['-STATUS-'].update('批量为空。')
                        continue
                    path = sg.popup_get_file('保存为 TXT（邮箱---accessToken，每行一条）', save_as=True, default_extension='.txt', file_types=(('Text', '*.txt'), ('All', '*.*')))
                    if not path:
                        window['-STATUS-'].update('已取消。')
                        continue
                    skipped = 0
                    lines = []
                    for item in batch_entries:
                        email = item.get('email') or (item.get('name') if ('@' in str(item.get('name') or '')) else None)
                        token = item.get('access_token')
                        if email and token:
                            lines.append(f"{email}---{token}")
                        else:
                            skipped += 1
                    if not lines:
                        window['-STATUS-'].update('没有可导出的有效条目（缺少邮箱或Token）。')
                        continue
                    with open(path, 'w', encoding='utf-8') as f:
                        f.write('\n'.join(lines))
                    if skipped:
                        window['-STATUS-'].update(f'已导出：{path}（跳过 {skipped} 条无邮箱/Token 的记录）')
                    else:
                        window['-STATUS-'].update(f'已导出：{path}')
                except Exception as e:
                    window['-STATUS-'].update(f'导出失败: {e}')

            if event == '上传到云端':
                try:
                    if not batch_entries:
                        window['-STATUS-'].update('批量为空。请先“加入批量”。')
                        continue
                    lines = []
                    skipped = 0
                    for item in batch_entries:
                        email = item.get('email') or (item.get('name') if ('@' in str(item.get('name') or '')) else None)
                        token = item.get('access_token')
                        if email and token:
                            lines.append(f"{email}---{token}")
                        else:
                            skipped += 1
                    if not lines:
                        window['-STATUS-'].update('没有可上传的有效条目（缺少邮箱或Token）。')
                        continue
                    base = values['-BASE-URL-'].strip()
                    pwd = sg.popup_get_text('管理员密码', password_char='*')
                    if not pwd:
                        window['-STATUS-'].update('已取消。')
                        continue
                    client = BackendClient(base)
                    if not client.admin_login(pwd):
                        window['-STATUS-'].update('管理员登录失败。')
                        continue
                    url = f"{base.rstrip('/')}/api/admin/mothers/batch/import-text"
                    r = client.session.post(url, data='\n'.join(lines).encode('utf-8'), headers={'Content-Type': 'text/plain; charset=utf-8'})
                    if not r.ok:
                        try:
                            detail = r.json().get('detail')
                        except Exception:
                            detail = r.text
                        window['-STATUS-'].update(f'上传失败：{detail}')
                        continue
                    res = r.json()
                    ok_count = len([x for x in res if x.get('success')])
                    window['-STATUS-'].update(f'上传完成：成功 {ok_count} / {len(res)}（跳过 {skipped}）')
                except Exception as e:
                    window['-STATUS-'].update(f'上传失败: {e}')

            if event == '清空批量':
                batch_entries.clear()
                window['-BATCH-COUNT-'].update('0')
                window['-STATUS-'].update('已清空。')

            if event == '-SEND-DONE-':
                data = values.get('-SEND-DONE-')
                if not data:
                    window['-STATUS-'].update('无响应数据')
                elif data.get('ok'):
                    window['-STATUS-'].update(f"保存成功: {data.get('payload')}")
                else:
                    if 'error' in data:
                        window['-STATUS-'].update(f"失败: {data['error']}")
                    else:
                        window['-STATUS-'].update(f"失败: {data.get('status')} {data.get('payload')}")

            if event == '重置浏览器':
                try:
                    if context:
                        context.close()
                        context = None
                    if page:
                        page.close()
                        page = None
                    window['-STATUS-'].update('浏览器已重置，请点击“登录并获取Token”。')
                except Exception as e:
                    window['-STATUS-'].update(f'重置失败: {e}')
    finally:
        try:
            if context:
                context.close()
            if browser:
                browser.close()
            if pw:
                pw.stop()
        except Exception:
            pass


if __name__ == '__main__':
    run_gui()
