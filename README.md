# GPT Team Auto Invite Service

A FastAPI-based service to manage multi-mother accounts for ChatGPT Teams, sell seats via redeem codes, and automate invitations. Implements a strict constraint: at most 7 seats per mother account (invite-as-seat). Admin dashboard is password-protected; public redeem page requires only code + email.

Key features
- Invite-as-seat: sending an invite immediately consumes a seat.
- Strict capacity: <= 7 seats per mother across all its teams.
- One code = one seat; a single email may hold seats across different teams but not multiple seats in the same team.
- Admin: import mother via Cookie (fetch accessToken), enable teams, generate codes in batch, resend/cancel invites, remove members, audit logs, basic stats.
- Security: access tokens encrypted at rest (AES-GCM), admin password hashed (bcrypt), logs redacted.

Quick start
1) Install deps: `pip install -r requirements.txt` (Windows/本地默认从 `gptautoinvite/requirements.backend.txt` 安装)
2) Set env vars (or `.env`):
   - `ENCRYPTION_KEY` (Base64 32 bytes, e.g. from `python - <<<'import os,base64;print(base64.b64encode(os.urandom(32)).decode())'`)
   - `ADMIN_INITIAL_PASSWORD` (optional; default is `admin` if missing)
   - `DATABASE_URL` (optional; defaults to `sqlite:///./data/app.db`)
   - `ENV=prod` and `SECRET_KEY` (required for production; app will refuse to start if missing)
   - `HTTP_PROXY` / `HTTPS_PROXY` (optional for outbound requests)
3) Run: `./run.ps1 -Port 8000` (Windows PowerShell)
4) Open admin: `http://localhost:8000/admin` (password = `ADMIN_INITIAL_PASSWORD` or `admin`)
5) Open redeem: `http://localhost:8000/redeem`

Local GUI (optional)
- Install browsers once: `python -m playwright install chromium`
- Run GUI: `python gui/main.py`
- Use it to log in mother accounts in an isolated window and send tokens to the backend without affecting your main browser session.

Notes
- To import a mother: copy your chatgpt.com Cookie string from your browser and paste it into Admin → Mothers → Import Cookie. The server will call `https://chatgpt.com/api/auth/session` to obtain `accessToken`. Then select teams and save the mother.
- Make sure you operate within the service terms of the provider.

Production checklist
- Set `ENV=prod` and configure `ENCRYPTION_KEY` (32B Base64) and a strong `SECRET_KEY`.
- Serve over HTTPS; behind a reverse proxy, preserve secure cookies.
- Admin cookie uses Secure+SameSite=Strict in prod; keep admin page non-public.
- Consider moving to PostgreSQL for stronger concurrency and row locking if traffic grows.
