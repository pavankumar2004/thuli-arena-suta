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

Needs Node 20+. From this folder:

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # static site in ./out
```

Both commands first run `scripts/build-data.mjs`, which reads
`../data/export/products.jsonl` (the Task 1 export; regenerate it with
`uv run python -m catalogue` in the repo root). If the export is missing, the committed
`src/data/products*.json` are used as they are.

## Deploy (Cloudflare Pages)

```bash
npx wrangler login                                                    # once
npx wrangler pages project create suta-utsav --production-branch main # once
npm run deploy                                                        # build + upload ./out
```

Or, in CI: set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` and run `npm run deploy`.
The site is fully static; `public/_headers` sets caching and security headers.

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
- **Static export** (`output: "export"`), so it is plain files on Cloudflare Pages.
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
