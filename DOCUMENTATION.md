# SUTA Interactive Lookbook & AI Stylist — Technical Architecture

## 1. Project Overview

An editorial lookbook, a personal "made for one" lookbook and an AI stylist with a virtual
fitting room for [Suta](https://suta.in), the Indian handloom label, built for the Thuli Arena
hackathon. Everything runs on one catalogue: every product scraped from suta.in into Neon
Postgres, verified against the live site.

**Core rule: separate truth from creativity.** Code and SQL decide *which* products appear,
at what price, in which sizes. Models only decide *what the shopper meant* and *how to talk
about* rows already fetched. No model ever writes SQL, names a product of its own, or states
a price that wasn't fetched.

## 2. Tech Stack: What We Used & Why

| Layer | What | Why |
|---|---|---|
| Scraper | Python, `requests`, `psycopg` | Suta runs on Shopify, so the public storefront JSON gives exact prices, variants and stock without parsing HTML. |
| Database | Neon serverless Postgres, `pg_trgm`, GIN indexes | One source of truth for every task. Search is parameterised SQL over real columns, not embeddings, so every match is explainable and nothing can be invented. |
| DB access | `@neondatabase/serverless` WebSocket pool | A warm pool, a hedged second read at 1.2 s, a 5 s ceiling and a 5-minute result cache keep the stylist inside its latency budget. |
| App | Next.js 16 (App Router, Turbopack), React 19 | Pre-rendered lookbook pages plus Node API routes for the AI features, in one codebase. Secrets stay in route handlers. |
| UI | Tailwind CSS v4, shadcn/ui (Radix) | Brand colour tokens and accessible dialogs, sheets and focus handling out of the box. |
| Motion | Framer Motion (`LazyMotion`), Lenis | Editorial pacing without a heavy bundle. Lenis smooth scroll loads only for mouse and trackpad users. |
| Models | OpenRouter, one shared client (`lookbook/scripts/lib/openrouter.mjs`) | The right model per job, a fallback model per call, retries, and cost logged per run. |
| Deployment | Local Node server (`npm run build && npm start`) | The AI routes need Node. To share it publicly, put `cloudflared tunnel --url http://localhost:3000` in front. |

Models in use (exact OpenRouter ids):

| Job | Model |
|---|---|
| Stylist planner and reply writer, photo search, try-on fit check | `openai/gpt-4.1-mini` |
| Virtual try-on | `google/gemini-3.1-flash-image` |
| Made for one: tagging photos | `google/gemini-2.5-flash` (fallback `google/gemini-2.5-flash-lite`) |
| Made for one: taste and styling | `anthropic/claude-sonnet-5.5` (fallback `anthropic/claude-sonnet-4.6`) |
| Catalogue photo tagging (offline, once) | `google/gemini-2.5-flash-lite` |
| Lookbook editorial images (offline) | `google/gemini-3-pro-image` |

## 3. Task Breakdown (What, How, Why)

### Task 1: Scraped Catalogue

**What.** The full Suta catalogue: 7,249 products, 19,246 variants and 49,288 images. All 37
menu categories match the counts suta.in itself displays (`data/export/REPORT.md`).

**How.** `python -m catalogue` runs this pipeline:

```
fetch.py      robots.txt-aware, 1 req/s, retries with backoff, 1-hour disk cache
scrape.py     /products.json + /collections/<menu category>/products.json
build.py      drop add-ons and test items, attach categories, measure coverage
normalise.py  one clean record per product
export.py     data/export/products.jsonl + REPORT.md
db.py         Neon: products, product_variants, category_counts
```

Key `products` columns: `id` (the Shopify id), `handle`, `url`, `title`, `price`,
`compare_at_price`, `available`, `sizes`, `sizes_in_stock`, `colours`, `colour_source`,
`department`, `category`, `categories`, `attributes` (jsonb: fabric, pattern, style, technique,
...), `tags`, `edits`, `pairs_with`, `images` and `description`.

Decisions that matter:
- **Categories come from the site menu, not Shopify's free-text `product_type`**, because
  judges compare against the brand's own counts.
- **Products are merged across every feed and de-duplicated by Shopify id**, so a store edit
  mid-scrape can't drop a product.
- **Colours are taken from the most reliable source available:** `Colour_` tags (97% of
  products), then English or Hindi colour words in the title or URL, then the garment's
  dominant shade in the first photo (198 products).
- **`pairs_with`** stores what Suta's own copy says a piece is styled with ("the model is
  wearing a blouse called Gopal").

`python -m catalogue.check` verifies the export (unique ids, consistent prices and stock),
checks that Neon matches it exactly, and re-fetches 20 random products from the live site.

**Why.** Every later task reads these rows. If the catalogue is wrong, everything downstream
is wrong.

### Task 2: Editorial Lookbook ("A Story, Not a Store")

**What.** *Utsav*, a festive almanac: six chapters on six of Suta's own collections, from
Durga Puja to the quiet after Diwali. It has 24 looks and 42 pieces, with shoppable hotspots
on every photograph.

**How.**
- **Content is curated in `src/data/looks.json`:** chapters, looks, hotspot `x`/`y` as
  percentages of the photo, and copy. It names products only by Shopify handle.
- **`scripts/build-data.mjs` joins it to the Task 1 export** for titles, prices, sale prices,
  stock, sizes, fabric and photos. The build **fails** if a look names a product that isn't in
  the catalogue.
- **The hotspot card is positioned so it always stays inside the photograph.** The look
  drawer has a gallery with a weave magnifier, the label's own story, every piece with its
  sizes in stock, and the total for the look.
- **Three clicks to a product:** open a look, open a piece, shop on suta.in.
- **Photography is Suta's**, served from Shopify's CDN through a custom `next/image` loader.
  Sixteen looks use editorial images we generated (no logos or watermarks), resized to WebP
  at build time.
- **Lighthouse (local):** desktop 99–100, mobile 83–89; accessibility, best practices and SEO
  all 100.

**Why.** A lookbook sells a mood first. The grid of products is one click away, not the
first thing you see.

### Task 3: Made for One (Personalised Lookbook)

**What.** Enter an Instagram handle at `/made-for-you` and get three looks, each tied to one
of that person's own posts, at `/for/<id>`.

**How.** `POST /api/foryou` streams progress as NDJSON (`src/lib/foryou/pipeline.ts`):

1. **Photos.** Read from Neon (`ig_photos`) if the handle was seen before, otherwise fetched
   live from Instagram (at most 40 photos).
2. **Tag.** A fast vision model labels each photo using the catalogue's own vocabulary
   (`src/lib/foryou/vocab.json`): is it an outfit, garment, colours, occasion.
3. **Taste.** A strong vision model reads the person's style, their palette and three
   moments from their life.
4. **Shortlist.** No AI at this step: SQL picks in-stock products in the right department
   whose catalogue tags (`product_tags`) match each moment.
5. **Style.** One call picks one piece per moment, plus an optional accessory, and writes a
   reason that points at the post. Every returned id is validated against the shortlist.

**Instagram fallback.** When Instagram blocks live fetches, `python -m foryou.import_profiles`
loads a profile from a browser-based import (`--fetch`) or the organisers' cached copy
(`--source organiser`). The web app then treats that handle as cached.

**Measured:** 4–18 s for a saved profile, about 30–40 s for a new one, and $0.02–0.06 per
lookbook. **Limits:** 5 lookbooks per IP per 10 minutes, and 6 running at once
(`rate_limits` table).

**Why.** The personal part comes from the person's own posts; the products come from the
catalogue. Only the reasoning, written last, is generated.

### Task 4: AI Stylist & Virtual Try-On

**What.** "Ask the stylist" (bottom right) is a chat that answers by text or photo with the
top five real products, and can try any one of them on you.

**How (one turn, `POST /api/stylist/chat`, streamed as NDJSON):**

```
message ─ guard ─┬─ rule parser (instant) ── speculative Neon search ───┐
                 └─ planner (gpt-4.1-mini) reads the last 6 turns ──────┤ same filters? reuse rows
                                                                        ▼
                    code-built, parameterised SQL + "what exists nearby" alternatives
                                                                        ▼
         cards stream first ──► writer (gpt-4.1-mini) streams the reply; every sentence
                                is checked before it is sent
```

- **Latency.**
  - The rule parser handles common requests instantly and starts a speculative search while
    the planner runs (2.4 s cap). If the planner returns the same filters, those rows are
    reused.
  - Measured: cards on screen in 1.2–1.9 s, first words of the reply in 2.2–2.9 s.
- **Planner output is validated.**
  - It returns an action (`search`, `facts`, `pairing`, `out_of_scope`, `chitchat` or
    `clarify`) and filters chosen only from closed lists of real catalogue values.
  - Code checks every field, and fills in budget and size from the rule parser when the model
    missed them.
- **Search** is one query in `src/lib/server/search.ts` that ranks pieces by how many asked-for
  criteria they meet. It reads `category`, `price`, `available`, `sizes_in_stock`, `colours`,
  `attributes`, `tags`, `edits` and `pairs_with`, plus `pg_trgm` on titles for typos.
- **Honesty circuit-breakers.**
  - Out-of-catalogue requests ("sneakers") get the `out_of_scope` action and an honest no,
    never a made-up product.
  - Any ₹ amount the writer uses must be a fetched price or the shopper's own budget.
  - A failed check, a stalled model or an error swaps in a plain line built from the same rows.
  - When too little matches, `alternatives()` suggests nearby requests with real counts
    ("Festive sarees under ₹2,000 · 12").
- **Session memory.** The client sends the handles it has already shown. "Something else" or a
  repeated request excludes them. The conversation is kept in `sessionStorage`.
- **Photo search.** The vision model describes the garment as catalogue filters; then it is
  the same SQL path as text.
- **Try-on, on demand** (`POST /api/stylist/tryon`).
  - Generating five try-ons per answer would be slow, costly and hit rate limits. Instead,
    the shopper clicks **Try this on** on one card.
  - The portrait and that product's own catalogue photos go to `google/gemini-3.1-flash-image`
    (about 20 s in our test). The result opens in a before/after slider.
  - Limits: 4 per visitor per 10 minutes and 3 in flight server-wide. Identical requests are
    cached.
  - Results are saved in the browser's IndexedDB so they can be downloaded later.
- **Fit guardrail.** Before generating, the catalogue's `department` and `tags` decide whether
  a piece is womenswear, menswear or unisex, and a quick vision check reads the photo. A clear
  mismatch is refused (HTTP 422) and nothing is generated. Unisex pieces always pass.
- **15:45 curveball.** The occasion edit chips (Festive edit, Sangeet, Wedding, Workwear,
  Casual) map each occasion in `src/lib/stylist/vocab.ts` to existing `attributes.style`
  values and `tags`. The edit is a hard filter that stacks with a typed occasion, so it needed
  no schema change.

**Why.** A model that answers from memory will eventually invent a saree. This design lets
the model be fluent while code stays responsible for every fact.

### Task 5: Security & Stress-Test Hardening

All in `src/lib/server/guard.ts` and the route handlers:

- **Prompt injection.**
  - Known jailbreak patterns are stripped and flagged.
  - Product descriptions, captions and photo text are passed to models as data, never as
    instructions.
  - Replies mentioning system prompts, API keys or the database are discarded.
- **Token burning.**
  - Messages over 500 characters are rejected; accepted messages are capped at 350.
  - `max_tokens` is at most 350 on every chat call (writer 350, planner 220, photo search 200,
    fit check 40).
  - History is limited to 6 short turns.
- **Crash immunity.**
  - Bodies are size-capped while being read (not trusting `Content-Length`).
  - Empty, emoji-only, malformed or wrongly typed input gets a 400 with a friendly message,
    never a 500.
- **Images.**
  - Data URLs only, so the server never fetches a URL (no SSRF).
  - 6 MB cap; re-encoded server-side with EXIF stripped; portraits are never stored.
- **Rate limits.**
  - Chat: 30 requests a minute per client. Try-on: 4 per 10 minutes and 3 in flight.
    Made for one: 5 per IP per 10 minutes, in Postgres.
  - The chat and try-on limits are in-memory, per server process.
- **Secrets.** `DATABASE_URL` and `OPENROUTER_API_KEY` are read only in server code
  (`src/lib/server/env.ts`) and are absent from the client bundle.

## 4. Local Quickstart

Needs Node 22+, plus [uv](https://docs.astral.sh/uv/) for the scraper.

```bash
git clone https://github.com/pavankumar2004/thuli-arena-suta.git && cd thuli-arena-suta
cp .env.example .env                  # set DATABASE_URL (Neon); add OPENROUTER_API_KEY=sk-or-...
uv sync && uv run --env-file .env python -m catalogue        # Task 1: scrape + load Neon (~4 min)
cd lookbook && npm install && npm run db:stylist && npm run dev   # http://localhost:3000
```

`npm run db:stylist` adds the stylist's search indexes once. For Made for one, also run
`uv run --env-file .env python -m foryou.web_db` once to create its tables. More detail is in
`README.md` and `lookbook/README.md`.
