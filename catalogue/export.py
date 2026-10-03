"""Write the catalogue as JSONL plus a human-readable coverage report."""

import json
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from .build import Catalogue


def _json_default(value):
    if isinstance(value, Decimal):
        return float(value)
    raise TypeError(f"not JSON serialisable: {type(value).__name__}")


def write_jsonl(records: list[dict], path: Path, scraped_at: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps({**r, "scraped_at": scraped_at}, ensure_ascii=False,
                               default=_json_default) + "\n")


def write_coverage(cat: Catalogue, path: Path, scraped_at: str) -> None:
    path.write_text(json.dumps({"scraped_at": scraped_at, "categories": cat.coverage}, indent=1),
                    encoding="utf-8")


def write_report(cat: Catalogue, path: Path, scraped_at: str) -> None:
    lines = [
        "# Suta catalogue: scrape report",
        "",
        f"Scraped at {scraped_at}. {len(cat.records)} products exported, "
        f"{len(cat.excluded)} excluded, "
        f"{sum(len(r['variants']) for r in cat.records)} variants, "
        f"{sum(len(r['images']) for r in cat.records)} images.",
        "",
        "## Coverage against suta.in's own category counts",
        "",
        "| Category | Collection | Site shows | Scraped | Membership from | |",
        "|---|---|---:|---:|---|---|",
    ]
    for c in cat.coverage:
        mark = "ok" if c["match"] else "**check**"
        lines.append(f"| {c['category']} | `{c['handle']}` | {c['site_count']} "
                     f"| {c['scraped']} | {c['via']} | {mark} |")

    uncategorised = [r for r in cat.records if not r["category"]]
    by_type = [r for r in cat.records if r["category_source"] == "product_type"]
    by_menu = sum(1 for r in cat.records if r["category_source"] == "menu")
    by_desc = [r for r in cat.records if r["category_source"] == "description"]
    lines += ["", "## Field completeness", "", "| Field | Present |", "|---|---:|"]
    lines += [f"| {f} | {share:.1%} |" for f, share in cat.completeness.items()]
    from_image = sum(1 for r in cat.records if r["colour_source"] == "image")
    lines += ["", f"{from_image} products name no colour in their tags, title, URL or "
              "description; their colour is the dominant shade of the garment in the first "
              "product photo (`colour_source = image`)."]
    lines += ["", "## Category source", "",
              f"{by_menu} products are placed "
              f"by suta.in's menu. {len(by_type)} are published but sit in no menu "
              f"collection ({sum(r['available'] for r in by_type)} of them in stock); "
              "their category comes from Shopify's "
              "`product_type` (`category_source = product_type`). "
              f"{len(by_desc)} more have no product_type and are placed by a garment "
              "measurement in their description, such as \"Blouse Length\" "
              "(`category_source = description`).",
              "", f"## Uncategorised ({len(uncategorised)})", "",
              "Products with no menu category, known product_type or description hint.", ""]
    lines += [f"- {r['title']} (`{r['product_type']}`) {r['url']}" for r in uncategorised[:50]]
    if len(uncategorised) > 50:
        lines.append(f"- ...and {len(uncategorised) - 50} more")
    lines += ["", f"## Excluded ({len(cat.excluded)})", ""]
    lines += [f"- {e['title']} ({e['reason']})" for e in cat.excluded]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def iso_utc(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, timezone.utc).replace(microsecond=0).isoformat()
