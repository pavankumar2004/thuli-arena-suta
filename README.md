# Thuli Arena · Suta

Hackathon build on the catalogue of [Suta](https://suta.in), an Indian handloom and
attire brand. This repo currently holds **Task 1: the catalogue**.

## Run it

Needs [uv](https://docs.astral.sh/uv/getting-started/installation/) (it installs Python 3.11+ itself).

```bash
uv sync                                       # install dependencies
uv run python -m catalogue                    # scrape, export, report (~4 min cold)
```

No uv? Plain pip works too:

```bash
python -m venv .venv && .venv/Scripts/activate   # macOS/Linux: source .venv/bin/activate
pip install requests "psycopg[binary]" pillow pytest
python -m catalogue
```

That writes:

| File | What |
|---|---|
| `data/export/products.jsonl` | one product per line, variants nested |
| `data/export/REPORT.md` | coverage vs. suta.in's own category counts, field completeness, exclusions |

To also load Neon (or any Postgres), put the connection string in `.env`:

```bash
cp .env.example .env                          # then paste your Neon DATABASE_URL
uv run --env-file .env python -m catalogue
```

## Check it

```bash
uv run --env-file .env python -m catalogue.check   # export + Neon + 20 products vs. live site
uv run python -m catalogue.check --live 0          # offline, export only
uv run pytest                                      # unit tests
```

`catalogue.check` prints PASS/WARN/FAIL per check and exits 1 on any failure:

- **export:** unique ids, handles and variant ids; every product has title, URL, price,
  images and sizes; prices, sale prices and stock flags are consistent; every category
  matches suta.in's count; warns if the data is more than 2 hours old.
- **database** (when `DATABASE_URL` is set): exactly the export's product ids, every
  variant, no orphans, no coverage gaps, and the latest export is the one loaded.
- **live site:** 20 random products re-fetched from suta.in and compared on title,
  price, sizes, per-size stock and images, the way the judges will check them.

To refetch everything instead of reusing responses cached in the last hour:
`uv run python -m catalogue --refresh`.

## How it works

```
suta.in  ──>  fetch.py   robots.txt-aware, 1 req/s, retries with backoff, disk cache
              scrape.py  /products.json  +  /collections/<menu category>/products.json
              build.py   drop non-products, attach categories, measure coverage
              normalise.py  one clean record per product
              export.py / db.py  ──>  JSONL + REPORT.md  /  Postgres (Neon)
```

**Source.** Suta runs on Shopify, so the storefront's public JSON (`/products.json`,
`/collections/<handle>/products.json`) gives exact prices, every variant with its
stock flag, and full-size image URLs, without parsing HTML. robots.txt allows these
paths; the fetcher checks every URL against it before requesting it.

**Categories come from the site's menu, not `product_type`.** Judges compare against
the brand's own category counts, and Shopify's `product_type` is free text
(`garage_saree`, `Saree with blouse piece`). [`taxonomy.py`](catalogue/taxonomy.py)
lists the collections in suta.in's navigation menu. A product's `category` is the
first one it belongs to, and `categories` lists all of them. For each category the
scraper also reads the count suta.in displays, and `REPORT.md` puts the two side by side.

Two places the menu isn't enough, both handled by mapping Shopify's `product_type`
to a menu category (and recorded as `category_source = "product_type"`):

- About 400 products are published but sit in no menu collection. They still have a
  product page, so they are exported with a category from `product_type`.
- `/collections/suta-bags/products.json` comes back empty even though the page lists
  37 bags; its membership is rebuilt from `product_type = Bag` (also 37).

A product with no menu collection and no `product_type` at all is placed by a garment
measurement in its description ("Blouse Length" → Blouses), as
`category_source = "description"`. One product needs this today.

**Nothing is missed when the store changes mid-scrape.** Page-number pagination can
skip a product if the store is edited during the run. Every product returned by any
category feed is merged in too, deduplicated by Shopify id, keeping the newest copy.

**One product, many variants.** Sizes are Shopify variants grouped under their
product, each with its own price and stock flag (`sizes_in_stock`). Products with
no size option (sarees, fabric, jewellery) get `Free Size`; their `Size_5.5 Meters`
tag is stored as `attributes.length`.

**Extra fields for later tasks.** Structured facets from Suta's tags (`fabric`,
`pattern`, `style`, `technique`, `neckline`, `sleeves`, ...); `edits`, the brand's
own merchandising collections (bestsellers, new arrivals, named edits), for the
lookbook; and `pairs_with`, products the brand's own copy says are styled together
("the model is wearing a blouse called Dry Cherry"), for "what goes with this?".

**Colours, most reliable first.** Suta's `Colour_` tags (97% of products); a bare
colour tag (`Gold`); a colour word in the title, English or Hindi (`Gulabi` = pink);
the same in the URL handle; an explicit `Colour:` line in the description. Free
description text is never scanned (it says "Color may vary" and names other products).
For what is left, [`image_colour.py`](catalogue/image_colour.py) reads the dominant
shade of the garment from the centre of the first photo, ignoring skin, the backdrop
shade at the photo's edge, and neutrals when a real colour is present.
`colour_source` is `text` or `image`.

**Excluded:** free add-ons, services and test products (`Freebies`, `service`).
They are listed in `REPORT.md`.

## Checked, and known gaps

As of the last run (see `data/export/REPORT.md`):

- **Coverage:** all 37 menu categories match the count suta.in displays, and the
  7,250 exported products match the store's "all products" count.
- **Accuracy:** `catalogue.check` on 20 random products: 20/20 match the live site on
  title, price, sizes, per-size stock and images. Rendered product pages show the same
  sale and pre-sale prices.
- **Completeness: 100%** on all seven judged fields (title, price, images, colours,
  sizes, category, url).
- **Colours from photos are approximate.** 206 products (2.8%) name no colour anywhere
  in their text, so their colour is read from the first photo (`colour_source = image`).
  Checked by eye on 28 of them: right for about 3 in 4, reliably so for sarees, blouses
  and lehengas; wrong mostly for thin lace trims shot on dark backgrounds. Task 4 should
  prefer image embeddings over this field for these products.

## Data model

See [`catalogue/schema.sql`](catalogue/schema.sql): `products`, `product_variants`
(one row per size, with stock), and `category_counts` (site count vs. scraped).
Re-runs upsert products instead of truncating, so rows later tasks attach to a
product (embeddings, lookbooks) survive a refresh.
