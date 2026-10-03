"""Read 50+ posts from a profile using the saved login session (see session.py).

Instead of calling Instagram's private API directly (quick to get rate-limited), this
opens the profile like a person would, scrolls slowly, and reads the post data out of
the page's own JSON: the first posts are inlined in the HTML, later ones arrive in the
GraphQL responses the page fetches as it scrolls.
"""

import json
import random
import re

from .importer import USER_AGENT, ImportError_, Post, Profile, _chrome, _number
from .session import SESSION_FILE

MAX_IMAGES_PER_POST = 4   # first frames of a carousel are the outfit; later ones repeat
MAX_SCROLLS = 25


def _walk(obj):
    """Yield every dict nested anywhere in a JSON value."""
    stack = [obj]
    while stack:
        cur = stack.pop()
        if isinstance(cur, dict):
            yield cur
            stack.extend(cur.values())
        elif isinstance(cur, list):
            stack.extend(cur)


def _best_image(media: dict) -> str | None:
    candidates = (media.get("image_versions2") or {}).get("candidates") or []
    if not candidates:
        return None
    # The largest rendition up to 1440px wide: sharp enough, not wasteful.
    fitting = [c for c in candidates if c.get("width", 0) <= 1440] or candidates
    return max(fitting, key=lambda c: c.get("width", 0))["url"]


def _posts_from(blob, handle: str, seen: dict) -> None:
    for d in _walk(blob):
        code = d.get("code")
        if not code or code in seen or not ("image_versions2" in d or "carousel_media" in d):
            continue
        owner = ((d.get("user") or d.get("owner") or {}).get("username") or "").lower()
        if owner and owner != handle:
            continue  # suggested posts from other accounts
        caption = (d.get("caption") or {}).get("text") or ""
        frames = d.get("carousel_media") or [d]
        images = []
        for frame in frames[:MAX_IMAGES_PER_POST]:
            url = _best_image(frame)
            if url:
                images.append((url, frame.get("media_type") == 2))
        if images:
            seen[code] = {"code": code, "caption": caption, "taken_at": d.get("taken_at"),
                          "likes": d.get("like_count"), "images": images}


def _profile_info(blob, handle: str) -> dict | None:
    for d in _walk(blob):
        if (d.get("username") or "").lower() == handle and (
                "follower_count" in d or "edge_followed_by" in d or "is_private" in d):
            return d
    return None


def fetch_logged_in(handle: str, want_images: int = 60) -> Profile:
    from playwright.sync_api import sync_playwright

    if not SESSION_FILE.exists():
        raise ImportError_("unavailable", "No Instagram session saved.")
    posts: dict[str, dict] = {}
    info: dict | None = None
    responses = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path=_chrome())
        try:
            context = browser.new_context(user_agent=USER_AGENT, storage_state=str(SESSION_FILE),
                                          viewport={"width": 1280, "height": 1000})
            page = context.new_page()
            page.on("response", lambda r: responses.append(r)
                    if ("graphql" in r.url or "/api/v1/" in r.url) else None)
            resp = page.goto(f"https://www.instagram.com/{handle}/", wait_until="domcontentloaded",
                             timeout=45_000)
            page.wait_for_timeout(4000)
            if "accounts/login" in page.url or "challenge" in page.url:
                raise ImportError_("unavailable", "The saved Instagram session has expired. "
                                                  "Run: python -m instagram.session login")
            if resp and resp.status == 429:
                raise ImportError_("unavailable", "Instagram is rate-limiting us; try later.")
            body = page.inner_text("body")
            if re.search(r"Sorry, this page isn't available", body):
                raise ImportError_("not_found", f"We couldn't find @{handle}. Check the spelling?")

            def harvest() -> None:
                nonlocal info
                blobs = page.eval_on_selector_all(
                    'script[type="application/json"]', "els => els.map(e => e.textContent)")
                for text in blobs:
                    try:
                        blob = json.loads(text)
                    except ValueError:
                        continue
                    info = info or _profile_info(blob, handle)
                    _posts_from(blob, handle, posts)
                while responses:
                    r = responses.pop()
                    try:
                        blob = r.json()
                    except Exception:
                        continue
                    info = info or _profile_info(blob, handle)
                    _posts_from(blob, handle, posts)

            harvest()
            if re.search(r"This account is private", body) or (info or {}).get("is_private"):
                raise ImportError_("private", f"@{handle} is private, so we can't see their posts.")

            stalls = 0
            for _ in range(MAX_SCROLLS):
                if sum(len(p["images"]) for p in posts.values()) >= want_images:
                    break
                before = len(posts)
                page.mouse.wheel(0, random.randint(2200, 3200))
                page.wait_for_timeout(random.randint(1800, 3200))  # read like a person
                harvest()
                stalls = stalls + 1 if len(posts) == before else 0
                if stalls >= 3:
                    break  # end of the profile, or Instagram stopped serving more
        finally:
            browser.close()

    if not posts:
        raise ImportError_("empty", f"@{handle} hasn't posted anything we can read yet.")
    info = info or {}
    followers = (info.get("follower_count") or (info.get("edge_followed_by") or {}).get("count")
                 or _number(body, "followers"))
    ordered = sorted(posts.values(), key=lambda p: p["taken_at"] or 0, reverse=True)
    flat = [Post(caption=p["caption"], image_url=url, is_video=is_video, code=p["code"],
                 frame=i, taken_at=p["taken_at"], likes=p["likes"])
            for p in ordered for i, (url, is_video) in enumerate(p["images"])]
    return Profile(handle=handle, full_name=info.get("full_name") or "",
                   verified=bool(info.get("is_verified")), followers=followers,
                   post_count=info.get("media_count")
                   or (info.get("edge_owner_to_timeline_media") or {}).get("count")
                   or _number(body, "posts"),
                   avatar_url=info.get("profile_pic_url"), posts=flat, source="live-session")
