import "server-only"

import { OCCASIONS } from "@/lib/stylist/vocab"
import type { Intent } from "@/lib/stylist/intent"
import type { StylistProduct } from "@/lib/stylist/types"
import { ping, query } from "./db"

// Everything the stylist shows comes from these columns of the Task 1 `products` table.
const columns = (t = "") => {
  const c = (name: string) => `${t && `${t}.`}${name}`
  return `
  ${c("handle")}, ${c("title")}, ${c("url")}, ${c("category")}, ${c("department")}, ${c("price")}::float8 AS price,
  ${c("compare_at_price")}::float8 AS compare_at_price, ${c("available")}, ${c("sizes")}, ${c("sizes_in_stock")},
  ${c("colours")}, ${c("attributes")}->'fabric' AS fabric, ${c("images")}[1:3] AS images, ${c("pairs_with")}`
}
const COLUMNS = columns()

interface Row {
  handle: string
  title: string
  url: string
  category: string | null
  department: string | null
  price: number
  compare_at_price: number | null
  available: boolean
  sizes: string[]
  sizes_in_stock: string[]
  colours: string[]
  fabric: string[] | null
  images: string[]
  pairs_with: string[]
}

const toProduct = (r: Row): StylistProduct => ({
  handle: r.handle,
  title: r.title,
  url: r.url,
  category: r.category,
  price: r.price,
  compareAtPrice: r.compare_at_price && r.compare_at_price > r.price ? r.compare_at_price : null,
  available: r.available,
  sizes: r.sizes,
  sizesInStock: r.sizes_in_stock,
  colours: r.colours,
  fabric: r.fabric?.[0] ?? null,
  image: r.images?.[0] ?? null,
})

/** Builds WHERE clauses and a relevance score from an intent, all as $n parameters. */
class Sql {
  params: unknown[] = []
  where: string[] = []
  score: string[] = []
  p(value: unknown) {
    this.params.push(value)
    return `$${this.params.length}`
  }
}

const anyFabric = (s: Sql, patterns: string[]) =>
  `EXISTS (SELECT 1 FROM jsonb_array_elements_text(attributes->'fabric') f WHERE f ILIKE ANY(${s.p(patterns.map((x) => `%${x}%`))}))`

// Crafts and patterns are spread across attributes.type/pattern/technique and tags.
const anyCraft = (s: Sql, crafts: string[]) => {
  const patterns = s.p(crafts.map((c) => `%${c}%`))
  return `(EXISTS (SELECT 1 FROM jsonb_each(attributes) a, jsonb_array_elements_text(a.value) v
                   WHERE a.key IN ('type','pattern','technique') AND v ILIKE ANY(${patterns}))
           OR EXISTS (SELECT 1 FROM unnest(tags) t WHERE t ILIKE ANY(${patterns})))`
}

const occasionClause = (s: Sql, occasion: keyof typeof OCCASIONS) => {
  const o = OCCASIONS[occasion]
  const parts: string[] = []
  if (o.styles.length) parts.push(`attributes->'style' ?| ${s.p([...o.styles])}`)
  if (o.tags.length) parts.push(`EXISTS (SELECT 1 FROM unnest(tags) t WHERE lower(t) = ANY(${s.p([...o.tags])}))`)
  if (occasion === "haldi") parts.push(`colours && ${s.p(["Yellow", "Mustard"])}`)
  return `(${parts.join(" OR ")})`
}

export interface SearchOptions {
  limit?: number
  exclude?: string[]
  /** An occasion chip (the festive-edit curveball): a hard filter, unlike a typed occasion. */
  edit?: keyof typeof OCCASIONS | null
}

export type Filter = "colours" | "fabrics" | "crafts" | "lengths" | "size" | "occasion"

export interface SearchResult {
  products: StylistProduct[]
  /** Filters even the best piece couldn't meet (so: "the closest we have"). */
  relaxed: Filter[]
}

/** What a shopper wears out of a chat when they haven't named a category. */
const WEARABLES = ["Sarees", "Blouses", "Co-ords & Kurta Sets", "Dresses", "Lehengas", "Skirts", "Dupattas", "Jackets", "Shirts", "Trousers", "Kurtas", "Loungewear"]
const OUTFITS = ["Sarees", "Co-ords & Kurta Sets", "Dresses", "Lehengas"]

/**
 * One round trip: hard filters (availability, category, department, budget, occasion chip)
 * in WHERE; every other criterion becomes a 0/1 match flag, and pieces are ranked by how
 * many they meet, then by soft preferences and the brand's own edits. Exact matches come
 * first; close matches only top up a short list, and are marked as such.
 */
export async function search(intent: Intent, opts: SearchOptions = {}): Promise<SearchResult> {
  const limit = opts.limit ?? 5
  const s = new Sql()
  s.where.push("available")
  s.where.push(`category = ANY(${s.p(intent.categories.length ? intent.categories : WEARABLES)})`)
  if (intent.men) s.where.push(`department = 'Men'`)
  else if (!intent.categories.some((c) => ["Kurtas", "Shirts", "Shorts & Trousers"].includes(c)))
    s.where.push(`department IS DISTINCT FROM 'Men'`)
  if (intent.maxPrice) s.where.push(`price <= ${s.p(intent.maxPrice)}`)
  if (intent.minPrice) s.where.push(`price >= ${s.p(intent.minPrice)}`)
  if (opts.exclude?.length) s.where.push(`handle <> ALL(${s.p(opts.exclude)})`)
  if (opts.edit) s.where.push(occasionClause(s, opts.edit))

  const flags: [Filter, string][] = []
  if (intent.colours.length) flags.push(["colours", `colours && ${s.p(intent.colours)}`])
  if (intent.fabrics.length) flags.push(["fabrics", anyFabric(s, intent.fabrics)])
  if (intent.crafts.length) flags.push(["crafts", anyCraft(s, intent.crafts)])
  if (intent.lengths.length) flags.push(["lengths", `attributes->'length' ?| ${s.p(intent.lengths)}`])
  if (intent.size) flags.push(["size", `(${s.p(intent.size)} = ANY(sizes_in_stock) OR 'Free Size' = ANY(sizes_in_stock))`])
  if (intent.occasion && intent.occasion !== opts.edit) flags.push(["occasion", occasionClause(s, intent.occasion)])
  // A piece must meet at least one asked-for criterion to be shown at all (dropped on the
  // second pass below, when nothing meets any of them).
  const anyFlag = flags.length ? `(${flags.map(([, c]) => c).join(" OR ")})` : null

  if (intent.prefer.fabrics.length) s.score.push(`(CASE WHEN ${anyFabric(s, intent.prefer.fabrics)} THEN 3 ELSE 0 END)`)
  if (intent.prefer.crafts.length) s.score.push(`(CASE WHEN ${anyCraft(s, intent.prefer.crafts)} THEN 2 ELSE 0 END)`)
  if (intent.prefer.minPrice) s.score.push(`(CASE WHEN price >= ${s.p(intent.prefer.minPrice)} THEN 2 ELSE 0 END)`)
  if (intent.colours.length) s.score.push(`(CASE WHEN colours[1] = ANY(${s.p(intent.colours)}) THEN 2 ELSE 0 END)`)
  if (!intent.categories.length) s.score.push(`(CASE WHEN category = ANY(${s.p(OUTFITS)}) THEN 2 ELSE 0 END)`)
  s.score.push(`(CASE WHEN edits && ARRAY['bestseller-sarees','best-seller-blouses','influencer-picks'] THEN 1 ELSE 0 END)`)
  s.score.push(`(CASE WHEN edits && ARRAY['new-arrival-sarees','new-arrival-blouses'] THEN 0.5 ELSE 0 END)`)

  const flagCols = flags.map(([name, clause]) => `(${clause})::int AS m_${name}`)
  // "0::int", not "0": a bare integer in ORDER BY means "the first column".
  const matched = flags.length ? flags.map(([name]) => `m_${name}`).join(" + ") : "0::int"
  const limitParam = s.p(limit * 3)
  const sql = (where: string[]) => `SELECT * FROM (
      SELECT ${COLUMNS}, published_at, (${s.score.join(" + ")}) AS score${flagCols.length ? ", " + flagCols.join(", ") : ""}
      FROM products WHERE ${where.join(" AND ")}
    ) t ORDER BY (${matched}) DESC, score DESC, published_at DESC NULLS LAST LIMIT ${limitParam}`
  let rows = await query<Row & Record<string, number>>(sql(anyFlag ? [...s.where, anyFlag] : s.where), s.params)
  // Nothing meets even one of the extra wishes ("festive" dresses under ₹2,000): show the
  // closest pieces within the hard limits (category, budget, edit), marked as close matches.
  if (!rows.length && anyFlag) rows = await query<Row & Record<string, number>>(sql(s.where), s.params)

  const met = (r: Record<string, number>) => flags.filter(([name]) => r[`m_${name}`] === 1).length
  const exact = rows.filter((r) => met(r) === flags.length)
  // Enough exact matches: show only those. Otherwise top up with the closest.
  const chosen = exact.length >= 3 ? exact.slice(0, limit) : rows.slice(0, limit)
  const best = chosen[0]
  const relaxed = best ? flags.filter(([name]) => best[`m_${name}`] !== 1).map(([name]) => name) : []
  return {
    products: chosen.map((r) => ({ ...toProduct(r), closeMatch: flags.length > 0 && met(r) < flags.length })),
    relaxed,
  }
}

/** A named piece, typo-tolerant ("saawan", "gulab saree"). Best match first. */
export async function findByName(name: string): Promise<StylistProduct[]> {
  const rows = await query<Row & { sim: number }>(
    `SELECT ${COLUMNS}, GREATEST(similarity(lower(title), $1), word_similarity(lower(title), $1)) AS sim
     FROM products
     WHERE lower(title) % $1 OR lower(title) <% $1 OR lower(title) = $1
     ORDER BY lower(title) = $1 DESC, sim DESC, available DESC LIMIT 3`,
    [name.toLowerCase()],
  )
  return rows.filter((r) => r.sim >= 0.55 && r.title.length >= 3).map(toProduct)
}

export async function byHandles(handles: string[]): Promise<StylistProduct[]> {
  if (!handles.length) return []
  const rows = await query<Row>(`SELECT ${COLUMNS} FROM products WHERE handle = ANY($1)`, [handles])
  const order = new Map(handles.map((h, i) => [h, i]))
  return rows.map(toProduct).sort((a, b) => order.get(a.handle)! - order.get(b.handle)!)
}

/**
 * What goes with a piece, in one round trip: the blouses Suta itself styles it with
 * (pairs_with) first, then the complementary category in a shared colour.
 */
export async function pairingsFor(handle: string): Promise<{ base: StylistProduct | null; products: StylistProduct[] }> {
  const rows = await query<Row & { is_base: boolean }>(
    `WITH base AS (
       SELECT handle, category, colours, pairs_with,
              CASE WHEN category = 'Sarees' THEN ARRAY['Blouses','Jewellery','Bags']
                   WHEN category ILIKE '%blouse%' THEN ARRAY['Sarees']
                   ELSE ARRAY['Jewellery','Bags','Dupattas'] END AS complement
       FROM products WHERE handle = $1)
     (SELECT ${COLUMNS}, true AS is_base FROM products WHERE handle = $1)
     UNION ALL
     (SELECT ${columns("p")}, false
      FROM products p, base b
      WHERE p.available AND p.handle <> b.handle
        AND (p.handle = ANY(b.pairs_with) OR p.category = ANY(b.complement))
      ORDER BY (p.handle = ANY(b.pairs_with)) DESC, (p.colours && b.colours) DESC,
               (p.edits && ARRAY['bestseller-sarees','best-seller-blouses']) DESC, p.published_at DESC NULLS LAST
      LIMIT 5)`,
    [handle],
  )
  const base = rows.find((r) => r.is_base)
  return { base: base ? toProduct(base) : null, products: rows.filter((r) => !r.is_base).map(toProduct) }
}

export async function productForTryOn(handle: string) {
  const [row] = await query<{
    handle: string
    title: string
    url: string
    category: string | null
    department: string | null
    tags: string[] | null
    colours: string[]
    attributes: Record<string, string[]>
    images: string[]
    description: string | null
  }>(`SELECT handle, title, url, category, department, tags, colours, attributes, images[1:3] AS images, left(description, 900) AS description
      FROM products WHERE handle = $1`, [handle])
  return row ?? null
}

/** Cheap query used to wake Neon's compute before the shopper's first real question. */
export async function warm() {
  await ping()
}

export interface Suggestion {
  /** Shown on the chip, e.g. "Festive kurta sets under ₹2,000 · 12". */
  label: string
  /** Sent as the shopper's next message when tapped; the parser reads it like typed text. */
  message: string
  count: number
}

const CATEGORY_WORD: Record<string, string> = {
  Sarees: "sarees",
  Blouses: "blouses",
  "Co-ords & Kurta Sets": "kurta sets",
  Kurtas: "kurtas",
  Dresses: "dresses",
  Lehengas: "lehengas",
  Skirts: "skirts",
  Dupattas: "dupattas",
  Jackets: "jackets",
  Shirts: "shirts",
  Trousers: "trousers",
  Loungewear: "loungewear",
}
const OCCASION_WORD: Record<keyof typeof OCCASIONS, string> = {
  festive: "festive",
  sangeet: "sangeet",
  wedding: "wedding",
  haldi: "haldi",
  workwear: "office",
  casual: "casual",
  evening: "evening",
  summer: "summer",
}
const FILTER_WORD: Record<Filter, string> = {
  colours: "colour",
  fabrics: "fabric",
  crafts: "weave",
  lengths: "length",
  size: "size",
  occasion: "occasion",
}
const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`

/** Words for an intent, in an order the intent parser reads back the same way. */
function phrase(intent: Intent, categories: string[], drop: Filter | null, price: { max?: number | null; min?: number | null }) {
  const keep = (f: Filter) => f !== drop
  const words = [
    keep("colours") && intent.colours[0]?.toLowerCase(),
    keep("fabrics") && intent.fabrics[0],
    keep("crafts") && intent.crafts[0]?.toLowerCase(),
    keep("occasion") && intent.occasion && OCCASION_WORD[intent.occasion],
    categories.map((c) => CATEGORY_WORD[c] ?? c.toLowerCase())[0] ?? "pieces",
    keep("lengths") && intent.lengths[0]?.toLowerCase(),
    keep("size") && intent.size && `in ${intent.size}`,
    price.max && `under ${rupees(price.max)}`,
    price.min && `above ${rupees(price.min)}`,
  ].filter(Boolean)
  return words.join(" ")
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * When a search comes up short, asks Neon what *does* exist nearby, in one round trip:
 * the same wishes in other categories within budget, the same category above budget (with
 * the real starting price), and the same request with any one wish let go. Every
 * suggestion carries a real count, so none of them leads to an empty shelf.
 */
export async function alternatives(intent: Intent, edit: keyof typeof OCCASIONS | null = null): Promise<Suggestion[]> {
  const s = new Sql()
  const base: string[] = ["available"]
  if (intent.men) base.push(`department = 'Men'`)
  else base.push(`department IS DISTINCT FROM 'Men'`)
  if (edit) base.push(occasionClause(s, edit))

  const flags: [Filter, string][] = []
  if (intent.colours.length) flags.push(["colours", `colours && ${s.p(intent.colours)}`])
  if (intent.fabrics.length) flags.push(["fabrics", anyFabric(s, intent.fabrics)])
  if (intent.crafts.length) flags.push(["crafts", anyCraft(s, intent.crafts)])
  if (intent.lengths.length) flags.push(["lengths", `attributes->'length' ?| ${s.p(intent.lengths)}`])
  if (intent.size) flags.push(["size", `(${s.p(intent.size)} = ANY(sizes_in_stock) OR 'Free Size' = ANY(sizes_in_stock))`])
  if (intent.occasion && intent.occasion !== edit) flags.push(["occasion", occasionClause(s, intent.occasion)])

  const cats = s.p(intent.categories.length ? intent.categories : WEARABLES)
  const all = s.p([...new Set([...WEARABLES, ...intent.categories])])
  const budget = [intent.maxPrice && `price <= ${s.p(intent.maxPrice)}`, intent.minPrice && `price >= ${s.p(intent.minPrice)}`].filter(Boolean)
  const flagCols = flags.map(([name, clause]) => `(${clause}) AS f_${name}`).join(", ")
  const allFlags = flags.length ? flags.map(([name]) => `f_${name}`).join(" AND ") : "true"
  const inBudget = budget.length ? budget.join(" AND ") : "true"

  const parts: string[] = []
  // Same wishes, same budget, another category.
  if (intent.categories.length) {
    parts.push(`SELECT 'category' AS kind, category, NULL::text AS dropped, count(*)::int AS n, min(price)::float8 AS lo
      FROM m WHERE ${allFlags} AND ${inBudget} AND NOT (category = ANY(${cats})) GROUP BY category`)
  }
  // Same wishes and category, beyond the budget.
  if (intent.maxPrice) {
    parts.push(`SELECT 'over_budget' AS kind, NULL::text AS category, NULL::text AS dropped, count(*)::int AS n, min(price)::float8 AS lo
      FROM m WHERE ${allFlags} AND category = ANY(${cats}) AND price > ${s.p(intent.maxPrice)}`)
  }
  // Let go of one wish at a time.
  for (const [name] of flags) {
    const others = flags.filter(([n]) => n !== name).map(([n]) => `f_${n}`)
    parts.push(`SELECT 'drop' AS kind, NULL::text AS category, '${name}'::text AS dropped, count(*)::int AS n, min(price)::float8 AS lo
      FROM m WHERE ${others.length ? others.join(" AND ") : "true"} AND ${inBudget} AND category = ANY(${cats})`)
  }
  if (!parts.length) return []

  const rows = await query<{ kind: string; category: string | null; dropped: Filter | null; n: number; lo: number | null }>(
    `WITH m AS (SELECT category, price${flagCols ? ", " + flagCols : ""} FROM products
                WHERE ${base.join(" AND ")} AND category = ANY(${all}))
     ${parts.join("\nUNION ALL\n")}`,
    s.params,
  )

  const out: Suggestion[] = []
  const price = { max: intent.maxPrice, min: intent.minPrice }
  for (const r of rows.filter((r) => r.kind === "category" && r.n > 0).sort((a, b) => b.n - a.n).slice(0, 2)) {
    const message = phrase(intent, [r.category!], null, price)
    out.push({ label: `${cap(message)} · ${r.n}`, message, count: r.n })
  }
  const over = rows.find((r) => r.kind === "over_budget" && r.n > 0)
  if (over?.lo) {
    const message = phrase(intent, intent.categories, null, { max: null, min: intent.minPrice })
    out.push({ label: `${cap(message)}, from ${rupees(over.lo)} · ${over.n}`, message, count: over.n })
  }
  for (const r of rows.filter((r) => r.kind === "drop" && r.n > 0).sort((a, b) => b.n - a.n).slice(0, 2)) {
    const message = phrase(intent, intent.categories, r.dropped, price)
    out.push({ label: `${cap(message)} (any ${FILTER_WORD[r.dropped!]}) · ${r.n}`, message, count: r.n })
  }
  // Never offer the same request twice.
  return out.filter((x, i) => out.findIndex((y) => y.message === x.message) === i).slice(0, 4)
}
