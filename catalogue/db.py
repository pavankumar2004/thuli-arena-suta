"""Load the catalogue into Postgres (Neon) in a single transaction.

Products are upserted rather than truncated and reloaded, so rows that later tasks
attach to a product (embeddings, lookbooks) survive a re-scrape. Products that have
disappeared from the store are deleted, and their variants with them.
"""

from pathlib import Path

import psycopg
from psycopg.types.json import Jsonb

SCHEMA = (Path(__file__).parent / "schema.sql").read_text(encoding="utf-8")

PRODUCT_COLUMNS = [
    "id", "handle", "url", "title", "brand", "department", "category", "categories",
    "category_source", "edits", "product_type", "price", "compare_at_price", "currency",
    "available", "sizes", "sizes_in_stock", "colours", "colour_source", "attributes", "images",
    "pairs_with", "description", "tags",
    "created_at", "updated_at", "published_at", "scraped_at",
]
VARIANT_COLUMNS = ["id", "product_id", "position", "sku", "size", "options", "price",
                   "compare_at_price", "available"]


def _product_row(r: dict, scraped_at: str) -> list:
    row = {**r, "attributes": Jsonb(r["attributes"]), "scraped_at": scraped_at}
    return [row[c] for c in PRODUCT_COLUMNS]


def load(dsn: str, records: list[dict], coverage: list[dict], scraped_at: str) -> None:
    cols = ", ".join(PRODUCT_COLUMNS)
    updates = ", ".join(f"{c} = excluded.{c}" for c in PRODUCT_COLUMNS if c != "id")
    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute(SCHEMA)
        cur.execute("CREATE TEMP TABLE stage (LIKE products) ON COMMIT DROP")
        with cur.copy(f"COPY stage ({cols}) FROM STDIN") as copy:
            for r in records:
                copy.write_row(_product_row(r, scraped_at))

        # Delete stale rows first, so a handle reused by a new product id can't collide.
        cur.execute("DELETE FROM products p WHERE NOT EXISTS "
                    "(SELECT 1 FROM stage s WHERE s.id = p.id)")
        cur.execute(f"INSERT INTO products ({cols}) SELECT {cols} FROM stage "
                    f"ON CONFLICT (id) DO UPDATE SET {updates}")

        cur.execute("DELETE FROM product_variants")
        with cur.copy(f"COPY product_variants ({', '.join(VARIANT_COLUMNS)}) FROM STDIN") as copy:
            for r in records:
                for pos, v in enumerate(r["variants"], 1):
                    copy.write_row([v["id"], r["id"], pos, v["sku"], v["size"],
                                    Jsonb(v["options"]), v["price"], v["compare_at_price"],
                                    v["available"]])

        cur.execute("DELETE FROM category_counts")
        cur.executemany(
            "INSERT INTO category_counts (handle, category, site_count, scraped, scraped_at) "
            "VALUES (%s, %s, %s, %s, %s)",
            [(c["handle"], c["category"], c["site_count"], c["scraped"], scraped_at)
             for c in coverage])
