"""Save an Instagram login session for the importer, without ever handling a password.

    uv run python -m instagram.session login     # opens Chrome; you log in yourself
    uv run python -m instagram.session status    # is the saved session still valid?
    uv run python -m instagram.session logout    # delete the saved session

A visible Chrome window opens on instagram.com. You log in there (2FA included);
when your feed loads, the window closes and only the session cookies are written to
.instagram-session.json (git-ignored). Anyone holding that file is logged in as that
account: keep it private, and revoke it from Instagram > Settings > Login activity.
"""

import argparse
import json
import sys
from pathlib import Path

from .importer import ROOT, USER_AGENT, _chrome

SESSION_FILE = ROOT / ".instagram-session.json"
LOGIN_TIMEOUT_S = 300


def _logged_in(context) -> bool:
    return any(c["name"] == "sessionid" and c["value"] for c in context.cookies())


def login() -> None:
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=False, executable_path=_chrome())
        context = browser.new_context(user_agent=USER_AGENT)
        page = context.new_page()
        page.goto("https://www.instagram.com/accounts/login/")
        print("Log in in the Chrome window (use a secondary account). Waiting up to 5 minutes...")
        for _ in range(LOGIN_TIMEOUT_S):
            if _logged_in(context):
                break
            page.wait_for_timeout(1000)
        else:
            browser.close()
            sys.exit("Timed out before login completed; nothing was saved.")
        page.wait_for_timeout(3000)  # let Instagram finish setting its cookies
        context.storage_state(path=str(SESSION_FILE))
        browser.close()
    SESSION_FILE.chmod(0o600)
    print(f"Saved session to {SESSION_FILE.name} (git-ignored). Run: python -m instagram.session status")


def status() -> None:
    if not SESSION_FILE.exists():
        sys.exit("No saved session. Run: uv run python -m instagram.session login")
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path=_chrome())
        context = browser.new_context(user_agent=USER_AGENT, storage_state=str(SESSION_FILE))
        resp = context.request.get(
            "https://www.instagram.com/api/v1/users/web_profile_info/?username=instagram",
            headers={"x-ig-app-id": "936619743392459"})
        browser.close()
    if resp.status == 429:
        sys.exit("Instagram is rate-limiting this network (HTTP 429). The session may be "
                 "fine: wait 10-15 minutes and check again. Don't log in again yet.")
    ok = resp.status == 200 and "require_login" not in resp.text()
    print("Session OK: logged-in requests work." if ok
          else f"Session not working (HTTP {resp.status}). Log in again.")
    sys.exit(0 if ok else 1)


def logout() -> None:
    SESSION_FILE.unlink(missing_ok=True)
    print("Deleted the local session. Also end it in Instagram > Settings > Login activity.")


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m instagram.session", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("action", choices=["login", "status", "logout"])
    {"login": login, "status": status, "logout": logout}[parser.parse_args().action]()


if __name__ == "__main__":
    main()
