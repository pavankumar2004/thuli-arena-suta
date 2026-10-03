# Utsav · a festive almanac by Suta

Task 2 lookbook. One festive season, from Durga Puja to the quiet after Diwali, told in
six chapters built on six of Suta's own collections: 24 looks, 42 pieces. Every piece
shown is a product from the Task 1 catalogue export, at its catalogue price.

| Chapter | Suta collection | Moment |
|---|---|---|
| I · Agomoni | `agomoni-puja-collection` | Durga Puja |
| II · Zar | `zar` | Bijoya visits |
| III · Chandrama | `chandrama` | Sharad Purnima |
| IV · Jalebi | `jalebi` | Dhanteras bazaar |
| V · Varq | `gulaab` | Diwali |
| VI · Kavita | `suta-x-priya-malik` | the quiet after |

## Run it

Needs Node 22+. From this folder:

```bash
npm install
cp .env.example .env.local   # DATABASE_URL (Neon) and OPENROUTER_API_KEY; or keep them in ../.env
npm run db:stylist           # once: search indexes for the stylist (pg_trgm, GIN on tags/sizes)
npm run dev                  # http://localhost:3000
npm run build && npm start   # production server on :3000
```

`dev` and `build` first run `scripts/build-data.mjs`, which reads
`../data/export/products.jsonl` (the Task 1 export; regenerate it with
`uv run python -m catalogue` in the repo root). If the export is missing, the committed
`src/data/products*.json` are used as they are.

The lookbook pages are pre-rendered at build time; the stylist's two API routes need the
Node server (`npm start`). To share it publicly, put a Cloudflare Tunnel in front of it:
`cloudflared tunnel --url http://localhost:3000`.

## The stylist

"Ask the stylist" (bottom right) is a chat that finds pieces in the Neon `products`
table: by text, by photo, and with an on-demand virtual try-on.

```
message ─ guard ─┬─ rule parser (instant) ── speculative Neon search ─┐
                 └─ 1 planner (LLM) reads the conversation ─ plan ────┤ same filters? reuse rows
                                                                      ▼
                    2 fetch (code-built SQL on Neon) + "what exists nearby" alternatives
                                                                      ▼
   cards stream first ──► 3 writer (LLM) streams a reply about those rows, sentence by
                            sentence; each sentence is checked before it is sent
photo ── vision LLM → catalogue filters ─ same steps 2–3
try-on ─ portrait + the product's own photos ─ image model ─ before/after
```

- **Grounded.** Every card (title, price, sale price, sizes in stock, fabric, photo) is a
  database row. Price and size answers are composed from the row, never by a model. The
  model writing the stylist's line sees only the structured request and the five real
  products, is told not to mention prices or sizes, and its text is discarded if it
  contains a number, a price, a URL, an unknown quoted name or anything that looks like a
  leak (`src/lib/server/llm.ts: safeReply`).
- **Neon attributes used:** `category`, `department`, `price`, `available`,
  `sizes_in_stock`, `colours`, `attributes.fabric/style/length/type/pattern/technique`,
  `tags` (occasions like sangeet, mehendi, haldi, Durga Puja, Diwali), `edits`
  (bestsellers, new arrivals), `pairs_with` (what Suta styles a saree with) and a
  `pg_trgm` index on titles for typo-tolerant names. One parameterised query per request
  ranks pieces by how many asked-for criteria they meet; exact matches first, "Close
  match" cards only top up a short list (`src/lib/server/search.ts`).
- **Hybrid planning.** Each turn, a fast model (`openai/gpt-4.1-mini`) reads the last six
  turns and returns a plan: an action (search, facts, pairing, out of scope, chitchat,
  clarify), filters chosen only from the catalogue's own values, and quick replies. Code
  validates every field, fills budget and size from the rule parser when the model missed
  them, and falls back to the rules entirely if the model is slow (`planner.ts`). The model
  never writes SQL: code builds the parameterised query from the plan.
- **A real conversation.** The reply is written live by the model for this exchange
  (`writer.ts`), about the rows just fetched, and streamed to the panel: cards first
  (~1.2–1.9s), then the reply sentence by sentence (first words ~2.2–2.9s). Every sentence
  is checked before it is sent: any ₹ amount must be a price we fetched (or the shopper's
  own budget), and nothing may look like a leak. A failed check, a stalled model or an
  error swaps in a plain line built from the same rows.
- **When the catalogue falls short.** If nothing (or too little) matches, `alternatives()`
  asks Neon in one query what does exist nearby: the same wishes in other categories within
  budget, the same category above budget (with the real starting price), and the request
  with one wish let go. These come back as tappable suggestions with real counts
  ("Festive sarees under ₹2,000 · 12"), so none leads to an empty shelf.
- **Behind this reply** (development only): under each answer, the parsed request, every
  Neon query with its parameters and timing, and every model prompt and reply.
- **Fast.** A rule parser built from the catalogue's own vocabulary handles single
  attribute, combined, follow-up ("show it in blue", "what goes with this?"), named-piece
  and out-of-scope prompts instantly (`src/lib/stylist/intent.ts`); at most one fast LLM
  call (`google/gemini-3.5-flash-lite`, 1.6s cap with a template fallback) per message.
  Neon is reached over a warm WebSocket pool, with hedged reads and a 5-minute result
  cache.
- **Occasion edit (the curveball).** Chips for Festive edit, Sangeet, Wedding, Workwear,
  Casual; or type "festive edit only". The edit is a hard filter on `attributes.style` and
  occasion `tags`, and stacks with a typed occasion.
- **Try-on, on demand only.** One image, for the one card you choose, from your portrait
  plus the product's catalogue photos (`google/gemini-3.1-flash-image`, ~20–50s). Limited
  to 4 per visitor per 10 minutes and 3 at once server-wide; identical requests are cached.
  Portraits are re-encoded server-side (EXIF stripped) and never stored.
- **Hardened.** Payloads over 500 characters → 400; the message is capped at 350; empty,
  emoji-only, malformed or wrongly-typed bodies → 400, never 500. Images are accepted only
  as data URLs (no URL fetching, so no SSRF). Rate limits on both routes. Secrets are read
  only in route handlers (`src/lib/server/env.ts`) and are absent from the client bundle.
  `max_tokens` ≤ 350 on every chat completion.

The OpenRouter client in `scripts/lib/openrouter.mjs` (text, vision, image generation,
reference images, retries, cost logging) is shared by the stylist, the lookbook's image
scripts and the next task.

## How it's put together

```
../data/export/products.jsonl ─┐
src/data/looks.json ───────────┼─ scripts/build-data.mjs ─┬─ src/data/products.index.json  (page: title, price, 1 photo)
  (hand-curated: chapters,     │   fails if any look       └─ src/data/products.json        (drawers: stories, galleries, sizes)
   looks, hotspot x/y %, copy) │   names a product that
                               │   isn't in the catalogue
```

- **Grounding.** `looks.json` only names Shopify handles. Titles, prices, sale prices,
  stock, sizes, fabric and photographs all come from the catalogue via the build script;
  nothing is hand-typed. Each look pairs the saree with the blouse Suta's own copy says
  the model is wearing ("The model is wearing a blouse called Gopal"). Sold-out pieces
  are labelled, not hidden.
- **Photography** is Suta's, served from Shopify's CDN through a custom `next/image`
  loader (`src/lib/shopify-loader.ts`), which resizes by `width` and negotiates WebP/AVIF.
- **Speed.** Overlays (look drawer, product quick view, saved tray, mobile menu) and the
  full product data load after the page is idle or on first use
  (`components/product/lazy-overlays.tsx`). Lenis smooth scrolling loads only for
  mouse and trackpad users. Lighthouse (local, Brotli, simulated throttling): mobile
  performance 83–89, desktop 99–100; accessibility, best practices and SEO 100.

```
src/
├── app/                    layout (fonts, metadata), page, globals.css (palette, utilities)
├── components/
│   ├── editorial/          cover, prologue + contents, chapter spread, look figure,
│   │                       hotspots, index (mood filter), colophon, reveal
│   ├── navigation/         header, chapter menu, sound toggle
│   ├── product/            look drawer, product quick view, fabric zoom, saved tray, price
│   └── ui/                 shadcn/ui sheet + dialog (Radix)
├── data/                   looks.json (curated), products*.json (generated)
├── lib/                    data access, Shopify loader, ambience (Web Audio), scroll, idle
├── store/                  zustand: saved looks/pieces (localStorage), open overlays
└── types/
```

## Features

- **Cover** triptych with parallax; one frame on phones.
- **Chapters** as editorial spreads: sticky opener, palette, offset looks, drape note.
- **Shoppable hotspots** on each photograph, with a card (photo, fabric, price, link)
  that always stays inside the frame.
- **Look drawer**: gallery with weave zoom, the label's own story, how to wear it, every
  piece with sizes in stock and the total for the look, previous/next.
- **Fabric zoom**: a magnifying lens over a 2000px photo (mouse); tap-to-zoom and drag (touch).
- **Index**: all 24 looks, filterable by mood/chapter.
- **Your almanac**: bookmark looks and pieces; kept in localStorage.
- **Sound**: rain and a tanpura drone, synthesised with Web Audio (no audio file), off by default.

Three clicks to a product: open a look (1), open a piece (2), shop on suta.in (3). Or
tap a hotspot (1) and follow its link (2).

## Editing the lookbook

All copy, looks and hotspot positions live in `src/data/looks.json`. Hotspot `x`/`y` are
percentages of the photograph (3:4). Run `npm run data` to validate after editing.

*An independent lookbook made for the Thuli Arena hackathon. Photographs and products
© Suta; not affiliated with or endorsed by Suta.*
