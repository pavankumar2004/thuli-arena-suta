"""Is the catalogue fine? One command; exits 1 if any check fails.

    uv run python -m catalogue.check                    # export + 20 products vs. live site
    uv run --env-file .env python -m catalogue.check    # ...and the Neon tables
    uv run python -m catalogue.check --live 0           # offline: skip the live site

Three layers:
  export    data/export/products.jsonl is internally consistent and covers every category
  database  Postgres holds exactly the export (only if DATABASE_URL is set)
  live      random products re-fetched from suta.in, the way the judges check them
"""

import argparse
import json
import os
import random
import sys
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from .fetch import Fetcher
from .normalise import FREE_SIZE, SIZE_OPTION_NAMES, product_url

ROOT = Path(__file__).resolve().parent.parent
EXPORT = ROOT / "data" / "export"
STALE_AFTER_HOURS = 2


class Results:
    def __init__(self):
        self.failed = 0

    def __call__(self, ok: bool, name: str, detail: str = "", warn_only: bool = False) -> None:
        status = "PASS" if ok else ("WARN" if warn_only else "FAIL")
        self.failed += status == "FAIL"
        # Details explain a failure; a passing check prints its name only.
        print(f"  {status}  {name}" + (f"  ({detail})" if detail and not ok else ""))


def _examples(records: list[dict]) -> str:
    return f"{len(records)} bad, e.g. " + ", ".join(r["handle"] for r in records[:3])


def check_export(records: list[dict], coverage: dict, check: Results) -> None:
    n = len(records)
    check(n > 0, f"{n} products in products.jsonl")
    for what, ids in [("product ids", [r["id"] for r in records]),
                      ("handles", [r["handle"] for r in records]),
                      ("variant ids", [v["id"] for r in records for v in r["variants"]])]:
        dupes = len(ids) - len(set(ids))
        check(dupes == 0, f"{what} unique", f"{dupes} duplicates" if dupes else "")

    for field in ["title", "url", "price", "images", "sizes", "variants"]:
        bad = [r for r in records if not r[field]]
        check(not bad, f"every product has {field}", _examples(bad) if bad else "")
    for field, floor in [("category", 0.99), ("colours", 0.95)]:
        share = sum(1 for r in records if r[field]) / n
        check(share >= floor, f"{field} present on {share:.1%} (need {floor:.0%})")

    rules = {
        "url is suta.in/products/<handle>": lambda r: r["url"] == product_url(r["handle"]),
        "price is the lowest variant price":
            lambda r: r["price"] == min(v["price"] for v in r["variants"]),
        "compare-at price above price, or empty":
            lambda r: r["compare_at_price"] is None or r["compare_at_price"] > r["price"],
        "sizes_in_stock is a subset of sizes":
            lambda r: set(r["sizes_in_stock"]) <= set(r["sizes"]),
        "available matches per-size stock": lambda r: r["available"] == bool(r["sizes_in_stock"]),
    }
    for name, rule in rules.items():
        bad = [r for r in records if not rule(r)]
        check(not bad, name, _examples(bad) if bad else "")

    gaps = [c for c in coverage["categories"] if not c["match"]]
    check(not gaps, f"all {len(coverage['categories'])} categories match suta.in's counts",
          ", ".join(f"{c['handle']} {c['scraped']}/{c['site_count']}" for c in gaps))

    age = datetime.now(timezone.utc) - datetime.fromisoformat(coverage["scraped_at"])
    hours = age.total_seconds() / 3600
    check(hours < STALE_AFTER_HOURS, f"scraped {hours:.1f}h ago",
          "prices and stock drift; run `python -m catalogue --refresh` before judging",
          warn_only=True)


def check_database(dsn: str, records: list[dict], scraped_at: str, check: Results) -> None:
    import psycopg

    try:
        conn = psycopg.connect(dsn, connect_timeout=15)
    except psycopg.Error as exc:
        check(False, "connect to DATABASE_URL", str(exc).splitlines()[0])
        return
    with conn:
        one = lambda sql, *params: conn.execute(sql, params).fetchone()[0]  # noqa: E731
        check(True, "connect to DATABASE_URL")

        tables = {"products", "product_variants", "category_counts"}
        missing = tables - {row[0] for row in conn.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")}
        check(not missing, "catalogue tables exist",
              f"missing {', '.join(sorted(missing))}; load first with: "
              "uv run --env-file .env python -m catalogue")
        if missing:
            return

        export_ids = {r["id"] for r in records}
        db_ids = {row[0] for row in conn.execute("SELECT id FROM products")}
        check(db_ids == export_ids, f"products table has the same {len(export_ids)} ids as the export",
              f"{len(export_ids - db_ids)} missing, {len(db_ids - export_ids)} extra")
        n_variants = sum(len(r["variants"]) for r in records)
        check(one("SELECT count(*) FROM product_variants") == n_variants,
              f"product_variants has {n_variants} rows")
        check(one("SELECT count(*) FROM product_variants v LEFT JOIN products p "
                  "ON p.id = v.product_id WHERE p.id IS NULL") == 0, "no orphaned variants")
        check(one("SELECT count(*) FROM category_counts WHERE site_count IS NULL "
                  "OR scraped < site_count") == 0, "category_counts shows no coverage gaps")
        db_scraped = one("SELECT max(scraped_at) FROM products")
        check(db_scraped == datetime.fromisoformat(scraped_at),
              "database holds the latest export",
              f"db scraped_at {db_scraped}, export {scraped_at}; re-run the loader")

        # Compare every row, not a sample: one wrong price is exactly what a judge finds.
        money = lambda x: None if x is None else Decimal(str(x)).quantize(Decimal("0.01"))  # noqa: E731
        expected = {r["id"]: (r["title"], money(r["price"]), money(r["compare_at_price"]),
                              r["available"], r["sizes_in_stock"], r["category"])
                    for r in records}
        actual = {row[0]: row[1:] for row in conn.execute(
            "SELECT id, title, price, compare_at_price, available, sizes_in_stock, category "
            "FROM products")}
        bad = [r for r in records if r["id"] in actual and actual[r["id"]] != expected[r["id"]]]
        check(not bad, "every row's title, prices, stock and category equal the export",
              _examples(bad) if bad else "")


def _image_key(src: str) -> str:
    return src.split("?")[0].rsplit("/", 1)[-1]


def compare_live(record: dict, live: dict) -> list[str]:
    """Differences between an exported record and suta.in/products/<handle>.js."""
    problems = []

    def same(field, ours, theirs):
        if ours != theirs:
            problems.append(f"{field}: ours={ours!r} live={theirs!r}")

    size_idx = next((i for i, o in enumerate(live["options"])
                     if o["name"].strip().lower() in SIZE_OPTION_NAMES), None)
    live_sizes = {(v["options"][size_idx] if size_idx is not None else FREE_SIZE): v["available"]
                  for v in live["variants"]}
    same("title", record["title"], live["title"].strip())
    same("price", Decimal(str(record["price"])),
         min(Decimal(v["price"]) for v in live["variants"]) / 100)
    same("sizes", record["sizes"], list(live_sizes))
    same("sizes_in_stock", record["sizes_in_stock"], [s for s, ok in live_sizes.items() if ok])
    same("images", [_image_key(i) for i in record["images"]],
         [_image_key(i) for i in live["images"]])
    return problems


def check_live(records: list[dict], n: int, seed: int | None, check: Results) -> None:
    fetcher = Fetcher("https://suta.in", ROOT / "data" / "cache", max_age=0)
    sample = random.Random(seed).sample(records, n)
    failures = 0
    for r in sample:
        try:
            problems = compare_live(r, fetcher.get_json(f"/products/{r['handle']}.js"))
        except Exception as exc:  # e.g. unpublished since the scrape
            problems = [f"live fetch failed: {exc}"]
        failures += bool(problems)
        for p in problems:
            print(f"        {r['url']}  {p}")
    check(failures == 0, f"{n - failures}/{n} random products match suta.in exactly",
          "the store changed since the scrape? re-run with --refresh" if failures else "")


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m catalogue.check", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--live", type=int, default=20, metavar="N",
                        help="products to re-check against suta.in (0 = offline)")
    parser.add_argument("--seed", type=int, help="fix the live sample")
    args = parser.parse_args()

    records = [json.loads(line) for line in (EXPORT / "products.jsonl").open(encoding="utf-8")]
    coverage = json.loads((EXPORT / "coverage.json").read_text(encoding="utf-8"))
    check = Results()

    print("export")
    check_export(records, coverage, check)

    print("database")
    dsn = os.environ.get("DATABASE_URL")
    if dsn:
        check_database(dsn, records, coverage["scraped_at"], check)
    else:
        print("  SKIP  DATABASE_URL not set (use: uv run --env-file .env ...)")

    print("live site")
    if args.live:
        check_live(records, args.live, args.seed, check)
    else:
        print("  SKIP  --live 0")

    print("\nall good" if not check.failed else f"\n{check.failed} check(s) failed")
    sys.exit(1 if check.failed else 0)


if __name__ == "__main__":
    main()
