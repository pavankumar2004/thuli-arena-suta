"""Load the catalogue for the lookbook: from Neon when DATABASE_URL is set, else the export."""

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXPORT = ROOT / "data" / "export" / "products.jsonl"

COLUMNS = ["id", "handle", "url", "title", "department", "category", "edits", "price",
           "compare_at_price", "available", "sizes", "sizes_in_stock", "colours",
           "attributes", "images", "pairs_with", "created_at", "scraped_at"]


def load_products() -> tuple[dict[str, dict], str]:
    """Return ({handle: product}, where the data came from)."""
    dsn = os.environ.get("DATABASE_URL")
    if dsn:
        import psycopg
        from psycopg.rows import dict_row

        with psycopg.connect(dsn, row_factory=dict_row) as conn:
            rows = conn.execute(f"SELECT {', '.join(COLUMNS)} FROM products").fetchall()
        for r in rows:
            r["price"] = float(r["price"])
            r["compare_at_price"] = float(r["compare_at_price"]) if r["compare_at_price"] else None
            # Same shapes as the JSONL export, so the rest of the code needn't care.
            r["scraped_at"] = r["scraped_at"].isoformat()
            r["created_at"] = r["created_at"].isoformat() if r["created_at"] else None
        source = "Neon"
    else:
        rows = [json.loads(line) for line in EXPORT.open()]
        source = str(EXPORT.relative_to(ROOT))
    return {r["handle"]: r for r in rows}, source
