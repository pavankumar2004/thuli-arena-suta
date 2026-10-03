"""Assemble clean records from a raw scrape, and measure coverage and completeness."""

from dataclasses import dataclass

from .normalise import normalise
from .scrape import RawCatalogue
from .taxonomy import (CATEGORIES, DESCRIPTION_HINTS, EDITS, EXCLUDED_PRODUCT_TYPES,
                       PRODUCT_TYPE_CATEGORIES)

# The fields judges check on 20 random items.
REQUIRED_FIELDS = ["title", "price", "images", "colours", "sizes", "category", "url"]


@dataclass
class Catalogue:
    records: list[dict]
    excluded: list[dict]
    coverage: list[dict]
    completeness: dict[str, float]


def completeness(records: list[dict]) -> dict[str, float]:
    return {f: sum(1 for r in records if r[f]) / len(records) for f in REQUIRED_FIELDS}


def exclusion_reason(raw: dict) -> str | None:
    if raw["product_type"].strip().lower() in EXCLUDED_PRODUCT_TYPES:
        return f"product_type={raw['product_type']}"
    if raw["title"].strip().lower().startswith("test product"):
        return "test product"
    if not raw["variants"]:
        return "no variants"
    return None


def type_category(raw: dict) -> tuple[str, str] | None:
    return PRODUCT_TYPE_CATEGORIES.get(raw["product_type"].strip().lower())


def description_category(raw: dict) -> tuple[str, str] | None:
    """Only for products with no product_type at all."""
    if raw["product_type"].strip():
        return None
    text = (raw.get("body_html") or "").lower()
    return next((cat for hint, cat in DESCRIPTION_HINTS if hint in text), None)


def build(raw: RawCatalogue) -> Catalogue:
    members = dict(raw.members)
    # Some menu collections return an empty JSON feed although their page lists
    # products; rebuild those memberships from product_type.
    rebuilt = set()
    for handle, dept, label in CATEGORIES:
        if not members.get(handle) and raw.site_counts.get(handle):
            members[handle] = {pid for pid, p in raw.products.items()
                               if type_category(p) == (dept, label)}
            rebuilt.add(handle)

    records, excluded = [], []
    for pid in sorted(raw.products):
        p = raw.products[pid]
        reason = exclusion_reason(p)
        if reason:
            excluded.append({"id": pid, "title": p["title"], "reason": reason})
            continue
        cats = [(dept, label) for handle, dept, label in CATEGORIES
                if pid in members.get(handle, ())]
        source = "menu" if cats else None
        if not cats and type_category(p):
            cats, source = [type_category(p)], "product_type"
        elif not cats and description_category(p):
            cats, source = [description_category(p)], "description"
        edits = [h for h in EDITS if pid in members.get(h, ())]
        records.append(normalise(p, cats, edits, category_source=source))

    kept = {r["id"] for r in records}
    coverage = []
    for handle, dept, label in CATEGORIES:
        scraped = len(members.get(handle, set()) & kept)
        shown = raw.site_counts.get(handle)
        coverage.append({"handle": handle, "category": f"{dept} / {label}",
                         "site_count": shown, "scraped": scraped,
                         "via": "product_type" if handle in rebuilt else "collection feed",
                         "match": shown is not None and scraped >= shown})

    return Catalogue(records, excluded, coverage, completeness(records))
