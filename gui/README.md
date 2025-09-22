# Local GUI for Mother Account Intake

This lightweight GUI helps you:
- Open an isolated login window for `chatgpt.com` (so it won’t touch your main browser session)
- Log in a mother account
- Fetch its `accessToken` (via session API inside that window)
- Send the token directly to your backend admin API to save as a mother account

Requirements
- Python 3.10+
- Install deps: `pip install -r requirements.txt`
- Install Playwright browsers once: `python -m playwright install chromium`

Run
- `python gui/main.py`

Usage
- Set Backend URL (default `http://localhost:8000`)
- Click `Login & Fetch Token` → a Chromium window opens at `https://chatgpt.com`
- Log in the mother account in that window
- Click `I’m Logged In, Fetch Token` in the GUI to retrieve the session and parse `accessToken`
- Fill `Mother Name` and `Teams (comma)` or leave Teams blank to only save the mother for now
- Click `Send to Backend` → the GUI will prompt for Admin Password, log into `/api/admin/login`, and call `/api/admin/mothers`

Notes
- This uses a temporary Playwright browser context independent from your main browser.
- If fetch fails, ensure you fully completed login and can open `chatgpt.com`.
- Teams are optional at this step; you can edit teams later in the admin dashboard.

