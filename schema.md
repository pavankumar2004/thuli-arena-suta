# Data schema

Everything the project stores, where it lives, and what is in it. Figures are from the
last full scrape (2026-10-03 12:58 IST); re-run the commands below for current numbers.

```
suta.in (Shopify JSON) ──python -m catalogue──> data/export/products.jsonl ──> Neon: products
                                                data/export/coverage.json           product_variants
                                                data/export/REPORT.md               category_counts

instagram.com ──python -m instagram──> data/instagram/<handle>/profile.json + images/
              ──python -m instagram.curate──> data/instagram/<handle>/kb.json + kb_vectors.npy
```

| Store | What | In git? |
|---|---|---|
| Neon Postgres | `products`, `product_variants`, `category_counts` | schema only ([catalogue/schema.sql](catalogue/schema.sql)) |
| `data/export/` | the same catalogue as JSONL, plus coverage and a report | yes (submission artefact) |
| `data/cache/` | raw HTTP responses from suta.in, reused for an hour | no |
| `data/instagram/` | scraped public profiles and their curated knowledge base | no (not ours to redistribute) |
| `.instagram-session.json` | Instagram login cookies | **never** (equivalent to being logged in) |

## The catalogue at a glance

| | |
|---|---|
| Products | **7,249** (9 non-products excluded: freebies, services, a test product) |
| In stock | 3,348 (46%) |
| Sizes (variants) | 19,246 |
| Images | 49,288 (about 6.8 per product) |
| Price | ₹32 to ₹46,075, median ₹2,470; 7,201 products currently carry a sale price |
| Categories | 37 menu categories, all matching suta.in's own counts |

By department:

| Department | Products | | Department | Products |
|---|---:|---|---|---:|
| Sarees | 3,778 | | Accessories | 340 |
| Blouses | 1,733 | | Men | 166 |
| Women (dresses, kurta sets, lehengas …) | 637 | | Home | 105 |
| Fabric | 385 | | Gifting | 58 |
| | | | Kids | 47 |

Where values come from:

| Field | Source | Share |
|---|---|---|
| `category` | suta.in navigation menu | 6,852 (94.5%) |
| | Shopify `product_type` fallback | 396 |
| | garment measurement in the description | 1 |
| `colours` | tags, title, handle or description text | 7,043 (97.2%) |
| | dominant shade of the first photo | 198 (approximate) |
| | none | 8 |
| `attributes` | Suta's structured tags | fabric 5,786 · length 3,617 · style 3,125 · pattern 2,963 · type 2,484 · technique 2,215 · neckline 2,143 · sleeves 1,863 · blouse_type 1,395 · back 477 |
| `pairs_with` | "the model is wearing …" links in product copy | 3,590 products |
| `edits` | Suta's merchandising collections | 1,266 products |

Most common sizes: Free Size (4,579 products: sarees, fabric, jewellery), then M, L, S, XL,
XS, XXL (about 2,000 each). Top colours: White, Multicolour, Blue, Pink, Green, Black, Red.

## Postgres (Neon)

Defined in [catalogue/schema.sql](catalogue/schema.sql), created and loaded by
`uv run --env-file .env python -m catalogue`. Re-runs upsert products by `id` rather than
truncating, so rows other tables attach to a product survive a refresh; products that
disappear from the store are deleted, and their variants with them.

### `products`: one row per product (7,249)

| Column | Type | Meaning | Example |
|---|---|---|---|
| `id` | bigint PK | Shopify product id | `1400532959344` |
| `handle` | text, unique | URL slug | `sarah` |
| `url` | text | product page | `https://suta.in/products/sarah` |
| `title` | text | | `Sarah` |
| `brand` | text | always `Suta` | |
| `department` | text | top-level menu group | `Blouses` |
| `category` | text | primary category | `Blouses` |
| `categories` | text[] | every category it appears under | `{"Sarees / Sarees","Sarees / Ready To Wear Sarees"}` |
| `category_source` | text | `menu`, `product_type` or `description` | `menu` |
| `edits` | text[] | Suta collections it belongs to | `{bestseller-sarees,agomoni-puja-collection}` |
| `product_type` | text | Shopify's raw type, unchanged | `Blouse` |
| `price` | numeric(10,2) | lowest variant price, INR | `950.00` |
| `compare_at_price` | numeric(10,2) | pre-sale price, null when not on sale | `1900.00` |
| `currency` | char(3) | `INR` | |
| `available` | boolean | any size in stock | `true` |
| `sizes` | text[] | all sizes in display order | `{XS,S,M,L,XL,XXL}` / `{Free Size}` |
| `sizes_in_stock` | text[] | subset of `sizes` in stock now | `{XL,XXL}` |
| `colours` | text[] | | `{Maroon,Red}` |
| `colour_source` | text | `text` or `image` | `text` |
| `attributes` | jsonb | structured facets from tags | `{"fabric":["Rayon"],"neckline":["V Neck"],"style":["Casual Wear"]}` |
| `images` | text[] | full-size Shopify CDN URLs in display order; append `&width=800` to resize | |
| `pairs_with` | text[] | handles of pieces Suta styles it with | `{thankam}` |
| `description` | text | plain text, HTML removed | |
| `tags` | text[] | raw Shopify tags | |
| `created_at`, `updated_at`, `published_at` | timestamptz | from Shopify | |
| `scraped_at` | timestamptz | when the data was fetched | |

Indexes: `category`, `price`, and GIN on `colours` and `attributes`.

### `product_variants`: one row per size (19,246)

| Column | Type | Meaning |
|---|---|---|
| `id` | bigint PK | Shopify variant id |
| `product_id` | bigint → `products.id` | cascades on delete |
| `position` | int | display order |
| `sku` | text | |
| `size` | text | `M`, `Free Size`, or an age group for kidswear |
| `options` | jsonb | every option value, e.g. `{"Size": "M"}` |
| `price`, `compare_at_price` | numeric(10,2) | per size |
| `available` | boolean | stock for this size |

### `category_counts`: coverage check (37 rows)

| Column | Type | Meaning |
|---|---|---|
| `handle` | text PK | suta.in collection, e.g. `saree` |
| `category` | text | `Sarees / Sarees` |
| `site_count` | int | count suta.in displays |
| `scraped` | int | count we hold |
| `scraped_at` | timestamptz | |

