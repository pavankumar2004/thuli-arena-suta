// Builds src/data/products.json (full) and src/data/products.index.json (what the page
// itself needs) from the Task 1 catalogue export.
//
// looks.json is hand-curated and refers to products by Shopify handle. This script
// pulls exactly those products out of data/export/products.jsonl, keeps the fields
// the lookbook shows, and fails loudly if a look points at anything that isn't in
// the scraped catalogue. Prices therefore always come from the catalogue, never
// from hand-typed copy.
//
//   node scripts/build-data.mjs            (runs automatically before `npm run build`)
//   CATALOGUE=path/to/products.jsonl node scripts/build-data.mjs

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import sharp from "sharp"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const cataloguePath = resolve(root, process.env.CATALOGUE ?? "../data/export/products.jsonl")
const looksPath = resolve(root, "src/data/looks.json")
const outPath = resolve(root, "src/data/products.json")
const indexPath = resolve(root, "src/data/products.index.json")

const MAX_IMAGES = 8
const MAX_STORY = 700

if (!existsSync(cataloguePath)) {
  // A checkout without the scraper's export (e.g. a CI build of just this folder) keeps
  // the committed products.json, which was built from the same export.
  if (existsSync(outPath)) {
    console.warn(`build-data: ${cataloguePath} not found; keeping the committed src/data/products.json`)
    process.exit(0)
  }
  console.error(`build-data: ${cataloguePath} not found. Run \`uv run python -m catalogue\` in the repo root first.`)
  process.exit(1)
}

const looks = JSON.parse(readFileSync(looksPath, "utf8"))
const catalogue = new Map(
  readFileSync(cataloguePath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const p = JSON.parse(line)
      return [p.handle, p]
    }),
)

// Every handle the lookbook references, in first-seen order.
const wanted = new Set()
const errors = []
// Highest image index the page shows per product, so the index file carries only those.
const shownImages = new Map()
const need = (handle, where, image = 0, track = true) => {
  if (!catalogue.has(handle)) errors.push(`${where}: "${handle}" is not in the catalogue`)
  else if (image >= catalogue.get(handle).images.length) errors.push(`${where}: "${handle}" has no image ${image}`)
  wanted.add(handle)
  if (track) shownImages.set(handle, Math.max(shownImages.get(handle) ?? 0, image))
}
// Lookbook photographs we generated (scripts/generate-look.mjs), served from public/.
const generated = []
// Cover slides and filmstrip frames are resolved to URLs below, so they don't widen `images`.
looks.cover.forEach((panel, i) => panel.forEach((c, j) => need(c.product, `cover[${i}][${j}]`, c.index, false)))
for (const chapter of looks.chapters) {
  chapter.frames.forEach((f, i) => need(f.product, `${chapter.id} frame ${i}`, f.index, false))
  for (const look of chapter.looks) {
    const where = `${chapter.id}/${look.id}`
    need(look.image.product, `${where} image`, look.image.index)
    if (look.image.src) generated.push({ where, src: look.image.src })
    for (const h of look.hotspots) {
      need(h.product, `${where} hotspot`)
      if (!(h.x >= 0 && h.x <= 100 && h.y >= 0 && h.y <= 100)) {
        errors.push(`${where}: hotspot for ${h.product} is outside the image (${h.x}, ${h.y})`)
      }
    }
    for (const e of look.extras ?? []) need(e, `${where} extra`)
  }
}

const ids = looks.chapters.flatMap((c) => c.looks.map((l) => l.id))
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i)
if (dupes.length) errors.push(`duplicate look ids: ${dupes.join(", ")}`)

// Each generated photo gets WebP copies at the widths src/lib/shopify-loader.ts asks for.
const LOCAL_WIDTHS = [640, 1080, 1600]
for (const { where, src } of generated) {
  const file = resolve(root, "public", src.replace(/^\//, ""))
  if (!existsSync(file)) {
    errors.push(`${where}: generated image ${src} not found in public/`)
    continue
  }
  for (const w of LOCAL_WIDTHS) {
    const out = file.replace(/\.\w+$/, `-${w}.webp`)
    if (!existsSync(out)) await sharp(file).resize({ width: w, withoutEnlargement: true }).webp({ quality: 80 }).toFile(out)
  }
}

if (errors.length) {
  console.error(`build-data: ${errors.length} problem(s)\n  ` + errors.join("\n  "))
  process.exit(1)
}

// The export has U+FFFD where the store's copy had curly quotes and apostrophes.
const clean = (s) => (s ?? "").replace(/�/g, "’").replace(/[ \t]+/g, " ").trim()

// Suta's descriptions are "Details" (Key: value lines), then "Story" and/or "Description".
function parseDescription(text) {
  const sections = {}
  let current = "intro"
  for (const raw of clean(text).split("\n")) {
    const line = raw.trim()
    if (!line) continue
    if (/^(details|story|description)$/i.test(line)) {
      current = line.toLowerCase()
      continue
    }
    ;(sections[current] ??= []).push(line)
  }
  const details = {}
  for (const line of sections.details ?? []) {
    const m = line.match(/^([^:]{2,30}?)\s*:\s*(.+)$/)
    if (m) details[m[1].trim().toLowerCase()] = m[2].trim()
  }
  return { details, story: sections.story ?? [], description: sections.description ?? [] }
}

function excerpt(paragraphs, max) {
  let out = ""
  for (const p of paragraphs) {
    const next = out ? `${out}\n${p}` : p
    if (next.length > max) {
      if (!out) {
        const cut = p.slice(0, max)
        out = cut.slice(0, cut.lastIndexOf(". ") + 1) || `${cut.slice(0, cut.lastIndexOf(" "))}…`
      }
      break
    }
    out = next
  }
  return out
}

const products = {}
for (const handle of wanted) {
  const p = catalogue.get(handle)
  const { details, story, description } = parseDescription(p.description)
  const fabric = details.fabric ?? p.attributes.fabric?.[0] ?? null
  products[handle] = {
    handle,
    title: p.title,
    url: p.url,
    category: p.category,
    price: p.price,
    compareAtPrice: p.compare_at_price,
    currency: p.currency,
    available: p.available,
    sizes: p.sizes,
    sizesInStock: p.sizes_in_stock,
    colours: p.colours,
    fabric,
    technique: p.attributes.technique ?? [],
    // "5.50 m (550.00 cm) ; Width: 1.14 m (114 cm)" -> "5.50 m"
    length: details.length?.split(";")[0].replace(/\s*\(.*?\)/g, "").trim() || null,
    blousePiece: details["blouse piece"] ?? null,
    collection: details.collection ?? null,
    preOrder: /pre-order/i.test(details.note ?? "") ? details.note : null,
    story: excerpt(story, MAX_STORY),
    description: excerpt(description, MAX_STORY),
    images: p.images.slice(0, MAX_IMAGES),
  }
}

const scrapedAt = [...wanted].map((h) => catalogue.get(h).scraped_at).sort().at(-1)
writeFileSync(outPath, JSON.stringify({ scrapedAt, products }, null, 2) + "\n")

// The page renders 24 looks before anyone opens a drawer; it only needs these fields.
const summary = Object.fromEntries(
  Object.values(products).map((p) => [
    p.handle,
    {
      handle: p.handle,
      title: p.title,
      url: p.url,
      category: p.category,
      price: p.price,
      compareAtPrice: p.compareAtPrice,
      available: p.available,
      fabric: p.fabric,
      collection: p.collection,
      images: p.images.slice(0, shownImages.get(p.handle) + 1),
    },
  ]),
)
const src = (ref) => catalogue.get(ref.product).images[ref.index]
const cover = looks.cover.map((panel) => panel.map((c) => ({ src: src(c), product: c.product, x: c.x, y: c.y })))
const frames = Object.fromEntries(
  looks.chapters.map((c) => [c.id, c.frames.map((f) => ({ src: src(f), product: f.product }))]),
)
writeFileSync(indexPath, JSON.stringify({ scrapedAt, cover, frames, products: summary }, null, 2) + "\n")
console.log(`build-data: ${wanted.size} products from ${looks.chapters.length} chapters, ${ids.length} looks (catalogue scraped ${scrapedAt})`)
