"""Fetch Suta's catalogue through Shopify's public storefront JSON."""

import logging
import re
from dataclasses import dataclass, field

from .fetch import Fetcher
from .taxonomy import CATEGORIES, EDITS

log = logging.getLogger(__name__)

PAGE_SIZE = 250  # Shopify's maximum


@dataclass
class RawCatalogue:
    products: dict[int, dict] = field(default_factory=dict)
    members: dict[str, set[int]] = field(default_factory=dict)  # collection handle -> ids
    site_counts: dict[str, int | None] = field(default_factory=dict)  # as shown on suta.in

    def absorb(self, batch: list[dict]) -> None:
        # The same product can come back from several endpoints; keep the newest copy.
        for p in batch:
            known = self.products.get(p["id"])
            if known is None or p["updated_at"] > known["updated_at"]:
                self.products[p["id"]] = p


def _paginate(fetcher: Fetcher, path: str) -> list[dict]:
    out, page = [], 1
    while True:
        batch = fetcher.get_json(f"{path}?limit={PAGE_SIZE}&page={page}")["products"]
        if not batch:
            return out
        out.extend(batch)
        page += 1


def _shown_count(collection_html: str) -> int | None:
    match = re.search(r"(\d[\d,]*)\s+Products?\b", collection_html)
    return int(match.group(1).replace(",", "")) if match else None


def scrape(fetcher: Fetcher) -> RawCatalogue:
    raw = RawCatalogue()

    all_products = _paginate(fetcher, "/products.json")
    raw.absorb(all_products)
    log.info("/products.json: %d products", len(all_products))

    # Collection feeds give category membership, and also catch any product that
    # slipped between /products.json pages while the store was being edited mid-scrape.
    for handle in [h for h, _, _ in CATEGORIES] + EDITS:
        batch = _paginate(fetcher, f"/collections/{handle}/products.json")
        raw.absorb(batch)
        raw.members[handle] = {p["id"] for p in batch}

    for handle, _, _ in CATEGORIES:
        raw.site_counts[handle] = _shown_count(fetcher.get_text(f"/collections/{handle}"))
        log.info("%-32s scraped %5d  site shows %s", handle, len(raw.members[handle]),
                 raw.site_counts[handle])

    late = len(raw.products) - len({p["id"] for p in all_products})
    if late:
        log.info("%d products found only via collection feeds", late)
    return raw
