"""One command: scrape suta.in, export JSONL + report, load Neon if DATABASE_URL is set.

    uv run python -m catalogue            # reuse responses cached in the last hour
    uv run python -m catalogue --refresh  # refetch everything
"""

import argparse
import logging
import os
import time
from pathlib import Path

from .build import build, completeness
from .export import iso_utc, write_coverage, write_jsonl, write_report
from .fetch import Fetcher
from .image_colour import ImageFetcher, fill_missing_colours
from .scrape import scrape

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m catalogue", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--refresh", action="store_true", help="ignore the HTTP cache")
    parser.add_argument("--max-age", type=float, default=60,
                        help="minutes a cached response stays fresh (default 60)")
    parser.add_argument("--skip-db", action="store_true", help="don't load into Postgres")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
    log = logging.getLogger("catalogue")

    started = time.monotonic()
    fetcher = Fetcher("https://suta.in", DATA / "cache",
                      max_age=0 if args.refresh else args.max_age * 60)
    raw = scrape(fetcher)
    cat = build(raw)
    filled = fill_missing_colours(cat.records, ImageFetcher(DATA / "cache" / "images"))
    cat.completeness = completeness(cat.records)
    log.info("colour read from the product photo for %d products", filled)
    # When the oldest response we used was fetched, so a rebuild from cache isn't
    # mistaken for fresh data.
    scraped_at = iso_utc(fetcher.oldest_response or time.time())

    write_jsonl(cat.records, DATA / "export" / "products.jsonl", scraped_at)
    write_coverage(cat, DATA / "export" / "coverage.json", scraped_at)
    write_report(cat, DATA / "export" / "REPORT.md", scraped_at)
    log.info("exported %d products (%d excluded) to data/export/  "
             "[%d requests, %d cache hits, %.0fs]", len(cat.records), len(cat.excluded),
             fetcher.network_requests, fetcher.cache_hits, time.monotonic() - started)
    gaps = [c for c in cat.coverage if not c["match"]]
    for c in gaps:
        log.warning("coverage gap: %s site=%s scraped=%s", c["handle"], c["site_count"],
                    c["scraped"])

    if args.skip_db:
        return
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        log.info("DATABASE_URL not set; skipping the database load")
        return
    from .db import load

    load(dsn, cat.records, cat.coverage, scraped_at)
    log.info("loaded %d products into Postgres", len(cat.records))


if __name__ == "__main__":
    main()
