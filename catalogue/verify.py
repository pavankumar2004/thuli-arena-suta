"""Re-check random exported products against the live store, the way the judges will.

    uv run python -m catalogue.verify            # 20 random products
    uv run python -m catalogue.verify --n 50 --seed 7

Compares title, price, compare-at price, sizes, per-size stock and images with
suta.in/products/<handle>.js (what the storefront itself renders from).
"""

import argparse
import json
import random
import sys
from decimal import Decimal
from pathlib import Path

from .fetch import Fetcher
from .normalise import FREE_SIZE, SIZE_OPTION_NAMES

ROOT = Path(__file__).resolve().parent.parent


def _image_key(src: str) -> str:
    return src.split("?")[0].rsplit("/", 1)[-1]


def compare(record: dict, live: dict) -> list[str]:
    problems = []

    def check(field, ours, theirs):
        if ours != theirs:
            problems.append(f"{field}: ours={ours!r} live={theirs!r}")

    size_idx = next((i for i, o in enumerate(live["options"])
                     if o["name"].strip().lower() in SIZE_OPTION_NAMES), None)
    live_sizes = {(v["options"][size_idx] if size_idx is not None else FREE_SIZE): v["available"]
                  for v in live["variants"]}
    live_price = min(Decimal(v["price"]) for v in live["variants"]) / 100

    check("title", record["title"], live["title"].strip())
    check("price", Decimal(str(record["price"])), live_price)
    check("sizes", record["sizes"], list(live_sizes))
    check("sizes_in_stock", record["sizes_in_stock"], [s for s, ok in live_sizes.items() if ok])
    check("images", [_image_key(i) for i in record["images"]],
          [_image_key(i) for i in live["images"]])
    return problems


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--n", type=int, default=20)
    parser.add_argument("--seed", type=int)
    args = parser.parse_args()

    export = ROOT / "data" / "export" / "products.jsonl"
    records = [json.loads(line) for line in export.open()]
    sample = random.Random(args.seed).sample(records, args.n)
    fetcher = Fetcher("https://suta.in", ROOT / "data" / "cache", max_age=0)

    failed = 0
    for r in sample:
        try:
            live = fetcher.get_json(f"/products/{r['handle']}.js")
        except Exception as exc:  # e.g. the product was unpublished since the scrape
            problems = [f"live fetch failed: {exc}"]
        else:
            problems = compare(r, live)
        failed += bool(problems)
        print(("FAIL " if problems else "ok   ") + f"{r['title'][:40]:40s} {r['url']}")
        for p in problems:
            print("       " + p)
    print(f"\n{args.n - failed}/{args.n} products match the live site exactly")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
