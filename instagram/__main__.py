"""Import public Instagram profiles into data/instagram/<handle>/.

    uv run python -m instagram balanvidya masabagupta
    uv run python -m instagram --refresh balanvidya     # ignore the cache
"""

import argparse
import time

from .importer import ImportError_, import_profile


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m instagram", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("handles", nargs="+")
    parser.add_argument("--refresh", action="store_true", help="ignore cached copies")
    args = parser.parse_args()

    for i, raw in enumerate(args.handles):
        if i:
            time.sleep(15)  # be gentle: logged-in accounts get flagged for bursts
        started = time.monotonic()
        try:
            p = import_profile(raw, max_age_s=0 if args.refresh else 24 * 3600)
        except ImportError_ as exc:
            print(f"{raw:24s} {exc.status.upper():11s} {exc.message}")
            continue
        saved = sum(1 for post in p.posts if post.image_file)
        print(f"@{p.handle:23s} OK ({p.source}, {time.monotonic() - started:.1f}s)  "
              f"{p.full_name!r}{' ✓' if p.verified else ''}  "
              f"{f'{p.followers:,}' if p.followers else '?'} followers · {p.post_count or '?'} posts · "
              f"{len(p.posts)} read, {saved} images saved")
        posts = len({post.code or i for i, post in enumerate(p.posts)})
        print(f"    {posts} posts, {len(p.posts)} images "
              f"({sum(post.is_video for post in p.posts)} video covers)")
        for post in p.posts[:5]:
            caption = " ".join(post.caption.split())[:90] or "(no caption)"
            print(f"    {'▶' if post.is_video else '▢'} {caption}")


if __name__ == "__main__":
    main()
