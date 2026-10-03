"""Read a public Instagram profile without logging in, and cache it.

Instagram's JSON endpoints refuse anonymous requests ("require_login"), but the
profile *embed* widget (instagram.com/<handle>/embed/, the one websites use) still
renders for anyone. In a real browser it shows the name, follower and post counts,
and the latest posts, each as an image whose alt text is the full caption. That is
everything Task 3 needs: images and captions.

Safety (Task 5 will probe this): the only thing taken from the user is a handle. It
is validated against Instagram's own username rules and placed into a fixed URL, so
the importer can never be pointed at another host or an internal address.
"""

import json
import re
import shutil
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from urllib.parse import urlsplit

import requests

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "instagram"
CHROME_CANDIDATES = ["/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/snap/bin/chromium",
                     "C:/Program Files/Google/Chrome/Application/chrome.exe",
                     "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
USER_AGENT = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/129.0 Safari/537.36")
# Instagram usernames: letters, digits, "." and "_", at most 30, no leading/trailing
# or doubled dots.
_HANDLE_RE = re.compile(r"(?!\.)(?!.*\.\.)[a-z0-9._]{1,30}(?<!\.)")
# Only these hosts serve the images we download.
_IMAGE_HOSTS = (".cdninstagram.com", ".fbcdn.net")


class ImportError_(Exception):
    """A profile we can't build a lookbook from. `status` is shown to the shopper."""

    def __init__(self, status: str, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


@dataclass
class Post:
    caption: str
    image_url: str
    is_video: bool
    image_file: str | None = None  # local copy; Instagram's image URLs expire
    code: str | None = None        # post shortcode: instagram.com/p/<code>/ (session only)
    frame: int = 0                 # position within a carousel post
    taken_at: int | None = None    # unix time
    likes: int | None = None


@dataclass
class Profile:
    handle: str
    full_name: str
    verified: bool
    followers: int | None
    post_count: int | None
    avatar_url: str | None
    posts: list[Post] = field(default_factory=list)
    fetched_at: float = 0.0
    source: str = "live"  # "live" (embed, 6 posts), "live-session" (50+), or "cache"


def normalise_handle(raw: str) -> str:
    """'@Vidya.Balan', 'instagram.com/vidya.balan/' -> 'vidya.balan'; else ImportError_."""
    text = (raw or "").strip()
    if "/" in text:  # a pasted profile link: only Instagram's own hosts count
        parts = urlsplit(text if "//" in text else "https://" + text)
        if (parts.hostname or "").lower() not in ("instagram.com", "www.instagram.com",
                                                  "m.instagram.com"):
            text = ""
        else:
            text = parts.path.strip("/").split("/")[0]
    text = text.lstrip("@").strip().lower()
    if not _HANDLE_RE.fullmatch(text):
        raise ImportError_("invalid", "That doesn't look like an Instagram handle. "
                                      "Try something like @balanvidya.")
    return text


# Runs inside the embed page. Tiles are <a href="#"> holding one <img> (alt = caption)
# and, for reels, an svg labelled "Video".
_EXTRACT_JS = """
() => {
  const text = document.body.innerText;
  const imgs = [...document.querySelectorAll('img')];
  const avatar = imgs.find(i => /profile picture/i.test(i.alt || ''));
  const followersTitle = [...document.querySelectorAll('span[title]')]
      .map(s => s.title).find(t => /^[\\d,]+$/.test(t));
  const posts = imgs.filter(i => i !== avatar && i.closest('a')).map(i => ({
    caption: i.alt || '',
    image_url: i.currentSrc || i.src,
    is_video: !!i.closest('a').querySelector('[aria-label="Video"]'),
  }));
  return {text, avatar: avatar ? avatar.src : null, followersTitle: followersTitle || null,
          verified: !!document.querySelector('[aria-label="Verified"]'), posts};
}
"""


def _chrome() -> str | None:
    return next((p for p in CHROME_CANDIDATES if Path(p).exists()), None)


def _number(text: str, label: str) -> int | None:
    m = re.search(r"([\d.,]+)\s*([KMB]?)\s+" + label, text, re.I)
    if not m:
        return None
    value = float(m.group(1).replace(",", ""))
    return int(value * {"": 1, "K": 1e3, "M": 1e6, "B": 1e9}[m.group(2).upper()])


def fetch_live(handle: str, timeout_s: float = 30) -> Profile:
    from playwright.sync_api import Error as PlaywrightError, sync_playwright

    url = f"https://www.instagram.com/{handle}/embed/"
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path=_chrome())
        try:
            page = browser.new_page(user_agent=USER_AGENT, viewport={"width": 540, "height": 900})
            response = page.goto(url, wait_until="domcontentloaded", timeout=timeout_s * 1000)
            if response and response.status == 404:
                raise ImportError_("not_found", f"@{handle} doesn't exist on Instagram.")
            # Wait for either post tiles or Instagram's "private / not available" notice.
            notice = page.get_by_text(re.compile(r"private|isn't available|not available", re.I))
            try:
                page.locator("a img").or_(notice).first.wait_for(timeout=timeout_s * 1000)
            except PlaywrightError:
                pass  # fall through; the text checks below decide
            data = page.evaluate(_EXTRACT_JS)
        finally:
            browser.close()

    text = data["text"]
    if re.search(r"this account is private", text, re.I):
        raise ImportError_("private", f"@{handle} is private, so we can't see their posts.")
    if re.search(r"isn't available|not available|page not found", text, re.I) or (
            handle not in text.lower() and not data["posts"]):
        raise ImportError_("not_found", f"We couldn't find @{handle}. Check the spelling?")

    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    full_name = next((lines[i + 1] for i, ln in enumerate(lines[:-1])
                      if ln.lower() == handle and lines[i + 1] not in ("Verified",)), "")
    if not full_name and "Verified" in lines:
        idx = lines.index("Verified")
        full_name = lines[idx + 1] if idx + 1 < len(lines) else ""
    followers = (int(data["followersTitle"].replace(",", "")) if data["followersTitle"]
                 else _number(text, "followers"))
    profile = Profile(handle=handle, full_name=full_name, verified=data["verified"],
                      followers=followers, post_count=_number(text, "posts"),
                      avatar_url=data["avatar"],
                      posts=[Post(**p) for p in data["posts"]], fetched_at=time.time())
    if not profile.posts:
        raise ImportError_("empty", f"@{handle} hasn't posted anything we can read yet.")
    return profile


def _download_images(profile: Profile, folder: Path) -> None:
    if folder.exists():
        shutil.rmtree(folder)  # never mix in images from an older fetch
    folder.mkdir(parents=True)
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    for i, post in enumerate(profile.posts):
        parts = urlsplit(post.image_url)
        if parts.scheme != "https" or not (parts.hostname or "").endswith(_IMAGE_HOSTS):
            continue
        target = folder / f"{i:03d}.jpg"
        try:
            # No redirects: a CDN URL must not be able to bounce us to another host.
            resp = session.get(post.image_url, timeout=20, allow_redirects=False)
            resp.raise_for_status()
            if resp.status_code != 200:
                continue
        except requests.RequestException:
            continue
        target.write_bytes(resp.content)
        post.image_file = str(target.relative_to(ROOT))


def _load_cached(handle: str) -> Profile | None:
    path = CACHE / handle / "profile.json"
    if not path.exists():
        return None
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw["posts"] = [Post(**p) for p in raw["posts"]]
    return Profile(**{**raw, "source": "cache"})


def import_profile(raw_handle: str, max_age_s: float = 24 * 3600,
                   allow_live: bool = True) -> Profile:
    """Cached copy if fresh enough; else the live embed; else any cached copy.

    The organisers also hand out cached copies of the judging profiles, in case
    Instagram blocks fetchers on the day: drop them in data/instagram/<handle>/.
    """
    from .session import SESSION_FILE

    handle = normalise_handle(raw_handle)
    cached = _load_cached(handle)
    with_session = SESSION_FILE.exists()
    # A 6-post embed copy isn't good enough once a session can fetch 50+.
    cache_ok = cached and not (with_session and len(cached.posts) < 20)
    if cache_ok and time.time() - cached.fetched_at < max_age_s:
        return cached
    if allow_live:
        try:
            if with_session:
                from .feed import fetch_logged_in
                profile = fetch_logged_in(handle)
            else:
                profile = fetch_live(handle)
            profile.fetched_at = time.time()
        except ImportError_:
            raise
        except Exception:  # Instagram blocked us, timed out, or changed its page
            if cached:
                return cached
            raise ImportError_("unavailable", "Instagram isn't answering right now. "
                                              "Please try again in a minute.")
        folder = CACHE / handle
        _download_images(profile, folder / "images")
        (folder / "profile.json").write_text(
            json.dumps(asdict(profile), ensure_ascii=False, indent=1), encoding="utf-8")
        return profile
    if cached:
        return cached
    raise ImportError_("unavailable", f"No copy of @{handle} is available offline.")
