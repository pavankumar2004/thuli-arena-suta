"""Build a personal lookbook ("Made for one") from a curated Instagram profile.

    uv run --env-file .env python -m foryou balanvidya masabagupta

Needs data/instagram/<handle>/kb.json (python -m instagram, then python -m instagram.curate)
and OPENROUTER_API_KEY. Writes data/foryou/<handle>.json.
"""

import argparse
import json
import time

from instagram.importer import ROOT, normalise_handle
from lookbook.data import load_products

from . import llm
from .pick import pick_looks
from .shortlist import shortlist
from .taste import read_taste

OUT = ROOT / "data" / "foryou"


def _product(p: dict) -> dict:
    return {k: p[k] for k in ("handle", "title", "url", "category", "price", "compare_at_price",
                              "colours", "sizes_in_stock")} | {"image": p["images"][0]}


def build(handle: str, products: dict) -> dict:
    started = time.monotonic()
    taste, images, taste_usage = read_taste(handle)
    t_taste = time.monotonic() - started
    per_moment, accessories = shortlist(handle, taste, products)
    looks, pick_usage, fallback = pick_looks(taste, images, per_moment, accessories)

    out_looks = []
    for look in looks:
        m = taste["moments"][look["moment"] - 1]
        post = images[m["evidence_image"] - 1]
        cand = look["candidate"]
        pieces = [cand["anchor"], *cand["partners"]] + ([look["accessory"]] if look["accessory"] else [])
        out_looks.append({
            "moment": m["name"], "style": m["style"], "headline": look["headline"],
            "reason": look["reason"],
            "because_of_post": {"post_url": post["post_url"], "image_file": post["image_file"],
                                "caption": post["caption"][:300]},
            "pieces": [_product(p) for p in pieces],
            "total": sum(p["price"] for p in pieces),
        })
    usages = [u for u in (taste_usage, pick_usage) if u]
    return {
        "handle": handle, "model": llm.MODEL, "taste": taste, "looks": out_looks,
        "shortlist_sizes": [len(c) for c in per_moment], "used_fallback": fallback,
        "seconds": {"taste": round(t_taste, 1), "total": round(time.monotonic() - started, 1)},
        "tokens": sum(u.get("total_tokens", 0) for u in usages),
        "cost_usd": round(sum(u.get("cost", 0) or 0 for u in usages), 4),
    }


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m foryou", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("handles", nargs="+")
    args = parser.parse_args()
    products, source = load_products()
    OUT.mkdir(parents=True, exist_ok=True)
    for raw in args.handles:
        handle = normalise_handle(raw)
        result = build(handle, products)
        (OUT / f"{handle}.json").write_text(json.dumps(result, ensure_ascii=False, indent=1),
                                            encoding="utf-8")
        t = result["taste"]
        print(f"\n@{handle}  [{t['wardrobe']}]  {result['seconds']['total']}s, "
              f"{result['tokens']} tokens, ${result['cost_usd']}"
              + ("  (FALLBACK picks)" if result["used_fallback"] else ""))
        print(f"  {t['summary']}")
        print(f"  palette: {', '.join(p['colour'] for p in t['palette'])} | "
              f"avoid: {', '.join(t['avoid']['colours'] + t['avoid']['categories']) or '-'}")
        for look in result["looks"]:
            print(f"  ◆ {look['moment']} ({look['style']}): {look['headline']}")
            for p in look["pieces"]:
                print(f"      {p['title']} · {p['category']} · ₹{p['price']:,.0f}")
            print(f"      {look['reason']}")


if __name__ == "__main__":
    main()
