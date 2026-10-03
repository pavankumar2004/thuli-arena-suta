"""Job A: describe every in-stock catalogue photo with a cheap vision model, once.

    uv run --env-file .env python -m foryou.tag_catalogue            # tag what's missing
    uv run --env-file .env python -m foryou.tag_catalogue --limit 16 # quick sample

Tags use the shared vocabulary in lookbook/src/lib/foryou/vocab.json, the same words the
web app uses for a person's Instagram photos, so the two sides can be matched directly.
Resumable: products already in product_tags are skipped.
"""

import argparse
import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

import psycopg

from instagram.importer import ROOT

from .llm import LLMError, complete_json, url_part

MODEL = "google/gemini-2.5-flash-lite"
BATCH = 8
WORKERS = 6
VOCAB = json.loads((ROOT / "lookbook/src/lib/foryou/vocab.json").read_text(encoding="utf-8"))
# What a person could wear, from the catalogue's own departments.
WEARABLE = """p.available AND p.price > 0 AND (
    p.department IN ('Sarees', 'Blouses', 'Women', 'Men')
    OR p.category IN ('Jewellery', 'Bags', 'Shoes'))"""

SYSTEM = f"""You tag product photos for a fashion catalogue. For each numbered photo,
describe ONLY the product being sold (ignore the model's other clothes and the backdrop).
Return ONE JSON object: {{"items": [{{"n": 1,
  "garment": <one of {VOCAB['garments']}>,
  "colours": [<1-3 of {VOCAB['colours']}, most visible first>],
  "fabric_look": "2-4 words, e.g. 'crisp handloom cotton', 'sheer organza'",
  "silhouette": "2-5 words, e.g. 'draped six-yard saree', 'boxy short kurta'",
  "occasion": <one of {VOCAB['occasions']}>,
  "vibe": [<2-3 single words, e.g. 'earthy', 'playful', 'regal', 'minimal'>]}}]}}
One item per photo, in order. No prose."""


def _image(url: str) -> str:
    return f"{url}{'&' if '?' in url else '?'}width=384"


def _clean(item: dict) -> dict | None:
    if item.get("garment") not in VOCAB["garments"] or item.get("occasion") not in VOCAB["occasions"]:
        return None
    colours = [c for c in item.get("colours") or [] if c in VOCAB["colours"]][:3]
    if not colours:
        return None
    return {"garment": item["garment"], "colours": colours,
            "fabric_look": str(item.get("fabric_look", ""))[:60] or None,
            "silhouette": str(item.get("silhouette", ""))[:80] or None,
            "occasion": item["occasion"],
            "vibe": [str(v)[:20] for v in item.get("vibe") or []][:3]}


def tag_batch(batch: list[tuple]) -> tuple[list[tuple], float]:
    content = []
    for n, (_, title, category, image) in enumerate(batch, 1):
        content.append({"type": "text", "text": f"Photo {n}: {title} ({category})"})
        content.append(url_part(_image(image)))
    raw, usage = complete_json(SYSTEM, content, max_tokens=1600, model=MODEL)
    by_n = {it.get("n"): it for it in raw.get("items") or [] if isinstance(it, dict)}
    rows = []
    for n, (pid, *_rest) in enumerate(batch, 1):
        tags = _clean(by_n.get(n) or {})
        if tags:
            rows.append((pid, tags["garment"], tags["colours"], tags["fabric_look"],
                         tags["silhouette"], tags["occasion"], tags["vibe"], MODEL))
    return rows, float(usage.get("cost") or 0)


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m foryou.tag_catalogue", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--limit", type=int, help="tag at most this many products")
    args = parser.parse_args()

    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        todo = conn.execute(f"""
            SELECT p.id, p.title, p.category, p.images[1] FROM products p
            LEFT JOIN product_tags t ON t.product_id = p.id
            WHERE t.product_id IS NULL AND cardinality(p.images) > 0 AND {WEARABLE}
            ORDER BY p.id""").fetchall()
        if args.limit:
            todo = todo[:args.limit]
        batches = [todo[i:i + BATCH] for i in range(0, len(todo), BATCH)]
        print(f"{len(todo)} products to tag in {len(batches)} calls ({MODEL})")
        tagged, failed, cost = 0, 0, 0.0
        with ThreadPoolExecutor(WORKERS) as pool:
            futures = {pool.submit(tag_batch, b): b for b in batches}
            for i, fut in enumerate(as_completed(futures), 1):
                try:
                    rows, c = fut.result()
                except (LLMError, OSError, ValueError) as exc:
                    failed += len(futures[fut])
                    print(f"  batch failed: {str(exc)[:120]}")
                    continue
                cost += c
                failed += len(futures[fut]) - len(rows)
                with conn.cursor() as cur:
                    cur.executemany("""
                        INSERT INTO product_tags (product_id, garment, colours, fabric_look,
                            silhouette, occasion, vibe, model)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (product_id) DO NOTHING""", rows)
                conn.commit()
                tagged += len(rows)
                if i % 20 == 0 or i == len(batches):
                    print(f"  {i}/{len(batches)} calls · {tagged} tagged · {failed} skipped · ${cost:.3f}")
        print(f"done: {tagged} tagged, {failed} skipped (re-run to retry), ${cost:.3f}")


if __name__ == "__main__":
    main()
