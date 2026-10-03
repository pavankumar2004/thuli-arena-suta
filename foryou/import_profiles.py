"""Load scraped Instagram profiles into Neon for the web app (ig_profiles + ig_photos).

    uv run --env-file .env python -m foryou.import_profiles balanvidya masabagupta
    uv run --env-file .env python -m foryou.import_profiles --source organiser <handle>
    uv run --env-file .env python -m foryou.import_profiles --fetch <handle>   # scrape first

--fetch is the day-of fallback when the web app's own Instagram fetch is blocked: it reads the
profile with the browser-based importer (python -m instagram, using the saved login session),
then loads it, so the next "Made for you" run for that handle starts from the saved copy.

Reads data/instagram/<handle>/profile.json and its images (from `python -m instagram`, or the
organisers' cached copy dropped into the same folder), shrinks each image to a 640px JPEG and
replaces that handle's rows. The web app then treats the handle as cached and skips Instagram.
"""

import argparse
import io
import json
import os
from datetime import datetime, timezone

import psycopg
from PIL import Image

from instagram.importer import CACHE, ROOT, ImportError_, import_profile, normalise_handle

MAX_SIDE = 640
MAX_PHOTOS = 60


def _jpeg(path) -> bytes:
    im = Image.open(path).convert("RGB")
    im.thumbnail((MAX_SIDE, MAX_SIDE))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=82)
    return buf.getvalue()


def load(conn, handle: str, source: str) -> int:
    profile = json.loads((CACHE / handle / "profile.json").read_text(encoding="utf-8"))
    posts = [p for p in profile["posts"] if p.get("image_file")][:MAX_PHOTOS]
    fetched = datetime.fromtimestamp(profile.get("fetched_at") or 0, timezone.utc)
    conn.execute("""
        INSERT INTO ig_profiles (handle, full_name, verified, followers, post_count, source, fetched_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (handle) DO UPDATE SET full_name = excluded.full_name,
          verified = excluded.verified, followers = excluded.followers,
          post_count = excluded.post_count, source = excluded.source,
          fetched_at = excluded.fetched_at""",
        (handle, profile.get("full_name"), bool(profile.get("verified")),
         profile.get("followers"), profile.get("post_count"), source, fetched))
    conn.execute("DELETE FROM ig_photos WHERE handle = %s", (handle,))
    conn.execute("DELETE FROM wardrobes WHERE handle = %s", (handle,))  # re-read with new photos
    with conn.cursor() as cur:
        cur.executemany("""
            INSERT INTO ig_photos (handle, position, post_url, caption, taken_at, is_video, image)
            VALUES (%s, %s, %s, %s, %s, %s, %s)""",
            [(handle, i, f"https://www.instagram.com/p/{p['code']}/" if p.get("code") else None,
              p.get("caption") or "",
              datetime.fromtimestamp(p["taken_at"], timezone.utc) if p.get("taken_at") else None,
              bool(p.get("is_video")), _jpeg(ROOT / p["image_file"]))
             for i, p in enumerate(posts)])
    return len(posts)


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m foryou.import_profiles", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("handles", nargs="+")
    parser.add_argument("--source", default="cache", choices=["cache", "organiser"])
    parser.add_argument("--fetch", action="store_true", help="scrape the profile from Instagram first")
    args = parser.parse_args()
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        for raw in args.handles:
            handle = normalise_handle(raw)
            if args.fetch:
                try:
                    import_profile(handle, max_age_s=0)
                except ImportError_ as exc:
                    print(f"@{handle}: {exc.status}: {exc.message}")
                    continue
            n = load(conn, handle, args.source)
            conn.commit()
            print(f"@{handle}: {n} photos loaded ({args.source})")


if __name__ == "__main__":
    main()
