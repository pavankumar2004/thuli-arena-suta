"""Polite HTTP client: obeys robots.txt, ~1 request/s, caches every response on disk."""

import hashlib
import json
import logging
import re
import time
from pathlib import Path
from urllib.parse import urlsplit

import requests

log = logging.getLogger(__name__)

USER_AGENT = "ThuliArenaCatalogueBot/0.1 (hiring hackathon; 1 req/s)"
_DEFAULT = object()  # "use the fetcher's max_age"


class RobotsRules:
    """robots.txt rules for `User-agent: *`, with Google-style `*`/`$` wildcards.

    The stdlib robotparser treats `*` inside a path literally, which would ignore
    most of Shopify's Disallow lines, so we match them ourselves.
    The longest matching rule wins; Allow wins a tie.
    """

    def __init__(self, text: str):
        self.rules: list[tuple[bool, str, re.Pattern]] = []
        in_star_group = False
        prev_was_agent = False
        for raw in text.splitlines():
            line = raw.split("#", 1)[0].strip()
            if ":" not in line:
                continue
            key, value = (part.strip() for part in line.split(":", 1))
            key = key.lower()
            if key == "user-agent":
                in_star_group = (value == "*") or (prev_was_agent and in_star_group)
                prev_was_agent = True
                continue
            prev_was_agent = False
            if in_star_group and key in ("allow", "disallow") and value:
                self.rules.append((key == "allow", value, self._compile(value)))

    @staticmethod
    def _compile(pattern: str) -> re.Pattern:
        anchored = pattern.endswith("$")
        body = re.escape(pattern.rstrip("$")).replace(r"\*", ".*")
        return re.compile(body + ("$" if anchored else ""))

    def allowed(self, path: str) -> bool:
        best: tuple[int, bool] | None = None
        for allow, pattern, regex in self.rules:
            if regex.match(path):
                candidate = (len(pattern), allow)
                if best is None or candidate > best:
                    best = candidate
        return True if best is None else best[1]


class Fetcher:
    def __init__(self, base_url: str, cache_dir: Path, delay: float = 1.0,
                 max_age: float | None = 3600, timeout: float = 60):
        self.base_url = base_url.rstrip("/")
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.delay = delay
        self.max_age = max_age  # seconds; None = always reuse cache, 0 = always refetch
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT
        self._last_request = 0.0
        self.network_requests = 0
        self.cache_hits = 0
        self.oldest_response: float | None = None  # epoch seconds; how stale the data is
        self.robots = RobotsRules(self._get("/robots.txt", check_robots=False))

    def get_json(self, path: str, max_age=_DEFAULT) -> dict:
        return json.loads(self._get(path, max_age=max_age))

    def get_text(self, path: str, max_age=_DEFAULT) -> str:
        return self._get(path, max_age=max_age)

    def _get(self, path: str, check_robots: bool = True, max_age=_DEFAULT) -> str:
        if max_age is _DEFAULT:
            max_age = self.max_age
        url = self.base_url + path
        parts = urlsplit(url)
        target = parts.path + (f"?{parts.query}" if parts.query else "")
        if check_robots and not self.robots.allowed(target):
            raise PermissionError(f"robots.txt disallows {path}")

        cache_file = self.cache_dir / (hashlib.sha1(url.encode()).hexdigest()[:20] + ".json")
        if cache_file.exists():
            cached = json.loads(cache_file.read_text(encoding="utf-8"))
            if max_age is None or time.time() - cached["fetched_at"] < max_age:
                self.cache_hits += 1
                self._saw(cached["fetched_at"])
                return cached["body"]

        body = self._download(url)
        fetched_at = time.time()
        cache_file.write_text(json.dumps({"url": url, "fetched_at": fetched_at, "body": body}),
                              encoding="utf-8")
        self._saw(fetched_at)
        return body

    def _saw(self, fetched_at: float) -> None:
        if self.oldest_response is None or fetched_at < self.oldest_response:
            self.oldest_response = fetched_at

    def _download(self, url: str, attempts: int = 5) -> str:
        for attempt in range(attempts):
            wait = self.delay - (time.monotonic() - self._last_request)
            if wait > 0:
                time.sleep(wait)
            self._last_request = time.monotonic()
            self.network_requests += 1
            try:
                resp = self.session.get(url, timeout=self.timeout)
            except requests.RequestException as exc:
                backoff = 2 ** attempt * 5
                log.warning("%s on %s, retrying in %ss", exc.__class__.__name__, url, backoff)
                time.sleep(backoff)
                continue
            if resp.status_code == 200:
                return resp.text
            if resp.status_code in (429, 500, 502, 503, 504):
                retry_after = resp.headers.get("Retry-After", "")
                backoff = float(retry_after) if retry_after.isdigit() else 2 ** attempt * 5
                log.warning("HTTP %s on %s, backing off %ss", resp.status_code, url, backoff)
                time.sleep(backoff)
                continue
            resp.raise_for_status()
        raise RuntimeError(f"gave up on {url} after {attempts} attempts")
