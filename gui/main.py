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
        [sg.Text('Backend URL', size=(14,1)), sg.Input('http://localhost:8000', key='-BASE-URL-', size=(40,1))],
        [sg.Frame('Mother Info', [
            [sg.Text('Mother Name', size=(14,1)), sg.Input(key='-MOTHER-NAME-', size=(40,1))],
            [sg.Text('Teams (comma)', size=(14,1)), sg.Input(key='-TEAMS-', size=(40,1)), sg.Text('Default is first')],
            [sg.Text('Notes', size=(14,1)), sg.Input(key='-NOTES-', size=(40,1))],
        ])],
        [sg.Frame('Token', [
            [sg.Multiline('', key='-TOKEN-JSON-', size=(70,8))],
            [sg.Button('Login & Fetch Token'), sg.Button("I'm Logged In, Fetch Token"), sg.Button('Send to Backend'), sg.Button('Quit')],
        ])],
        [sg.StatusBar('Ready', key='-STATUS-')]
    ]

    window = sg.Window('GPT Team Mother Intake', layout, finalize=True)

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

    try:
        while True:
            event, values = window.read()
            if event in (sg.WINDOW_CLOSED, 'Quit'):
                break

            if event == 'Login & Fetch Token':
                try:
                    page = ensure_browser()
                    window['-STATUS-'].update('Opening chatgpt.com ...')
                    page.goto('https://chatgpt.com/', wait_until='domcontentloaded')
                    window['-STATUS-'].update('Please login in the opened window, then click "I\'m Logged In, Fetch Token"')
                except Exception as e:
                    window['-STATUS-'].update(f'Error opening browser: {e}')

            if event == "I'm Logged In, Fetch Token":
                try:
                    if page is None:
                        window['-STATUS-'].update('Browser/page not open. Click Login & Fetch Token first.')
                        continue
                    window['-STATUS-'].update('Fetching session ...')
                    data = fetch_session_in_page(page)
                    window['-TOKEN-JSON-'].update(json.dumps(data, ensure_ascii=False, indent=2))
                    window['-STATUS-'].update('Fetched session successfully.')
                except Exception as e:
                    window['-STATUS-'].update(f'Fetch failed: {e}')

            if event == 'Send to Backend':
                try:
                    base = values['-BASE-URL-'].strip()
                    name = values['-MOTHER-NAME-'].strip()
                    notes = values['-NOTES-'].strip() or None
                    teams_txt = values['-TEAMS-'].strip()
                    raw = values['-TOKEN-JSON-'].strip()
                    if not name:
                        window['-STATUS-'].update('Mother Name is required')
                        continue
                    if not raw:
                        window['-STATUS-'].update('Token JSON is empty')
                        continue
                    try:
                        token_obj = json.loads(raw)
                    except Exception as e:
                        window['-STATUS-'].update(f'Invalid token JSON: {e}')
                        continue
                    access_token = token_obj.get('access_token')
                    token_expires_at = token_obj.get('token_expires_at')
                    if not access_token:
                        window['-STATUS-'].update('access_token missing in JSON')
                        continue
                    teams = []
                    if teams_txt:
                        arr = [s.strip() for s in teams_txt.split(',') if s.strip()]
                        for i, team_id in enumerate(arr):
                            teams.append({
                                'team_id': team_id,
                                'team_name': team_id,
                                'is_enabled': True,
                                'is_default': i == 0,
                            })
                    client = BackendClient(base)
                    pwd = sg.popup_get_text('Admin Password', password_char='*')
                    if not pwd:
                        window['-STATUS-'].update('Cancelled.')
                        continue
                    if not client.admin_login(pwd):
                        window['-STATUS-'].update('Admin login failed')
                        continue
                    r = client.save_mother(name=name, access_token=access_token, token_expires_at=token_expires_at, teams=teams, notes=notes)
                    if r.ok:
                        window['-STATUS-'].update(f'Saved mother OK: {r.json()}')
                    else:
                        try:
                            window['-STATUS-'].update(f'Failed: {r.status_code} {r.json()}')
                        except Exception:
                            window['-STATUS-'].update(f'Failed: {r.status_code} {r.text}')
                except Exception as e:
                    window['-STATUS-'].update(f'Send failed: {e}')
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

