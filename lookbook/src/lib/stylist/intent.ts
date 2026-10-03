// Turns a shopper's message into a structured search intent, instantly and without a
// model, using the catalogue's own vocabulary (see vocab.ts). The server only reaches
// for an LLM when this finds nothing to search on (a "vague" message).

import {
  CATEGORY_WORDS,
  COLOUR_WORDS,
  CRAFT_WORDS,
  FABRIC_WORDS,
  LENGTH_WORDS,
  OCCASION_KEYS,
  OCCASION_WORDS,
  OUTFIT_CATEGORIES,
  OUTFIT_WORDS,
  OUT_OF_SCOPE,
  SIZE_ALIASES,
  SIZE_RE,
  VIBES,
  type Occasion,
} from "./vocab"

export interface Intent {
  categories: string[]
  colours: string[]
  fabrics: string[]
  crafts: string[]
  lengths: string[]
  size: string | null
  occasion: Occasion | null
  minPrice: number | null
  maxPrice: number | null
  men: boolean
  /** Soft preferences from vague words: they rank results, they don't filter them. */
  prefer: { fabrics: string[]; crafts: string[]; minPrice: number | null }
}

export type Ask =
  | { kind: "search"; intent: Intent; refined: boolean }
  | { kind: "pairing"; intent: Intent }
  | { kind: "facts"; name: string; intent: Intent }
  | { kind: "out_of_scope"; term: string; nearby: string[] }
  | { kind: "greeting" }
  | { kind: "vague"; intent: Intent }

export const emptyIntent = (): Intent => ({
  categories: [],
  colours: [],
  fabrics: [],
  crafts: [],
  lengths: [],
  size: null,
  occasion: null,
  minPrice: null,
  maxPrice: null,
  men: false,
  prefer: { fabrics: [], crafts: [], minPrice: null },
})

// Every vocabulary pattern is matched as whole words, case-insensitively.
const words = (re: RegExp) => new RegExp(`\\b(?:${re.source.replace(/\\b/g, "")})\\b`, "i")
const uniq = <T,>(xs: T[]) => [...new Set(xs)]

function collect<T>(text: string, table: [RegExp, T][]): T[] {
  return table.filter(([re]) => words(re).test(text)).map(([, v]) => v)
}

/** "under 15k", "below ₹8,000", "between 3000 and 5000", "upto 10 thousand", "above 5k". */
export function parsePrice(text: string): { min: number | null; max: number | null } {
  const num = (s: string, unit?: string) => {
    const n = Number(s.replace(/,/g, ""))
    if (!Number.isFinite(n)) return null
    return /k|thousand/i.test(unit ?? "") ? n * 1000 : /l|lakh/i.test(unit ?? "") ? n * 100000 : n
  }
  // "?" too: some terminals send ₹ as a question mark.
  const amount = String.raw`(?:₹|rs\.?|inr|\?)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|l|lakh)?`
  const between = text.match(new RegExp(String.raw`between\s+${amount}\s+(?:and|to|-)\s+${amount}`, "i"))
  if (between) return { min: num(between[1], between[2]), max: num(between[3], between[4]) }
  const max = text.match(new RegExp(String.raw`(?:under|below|less than|within|upto|up to|max(?:imum)?|budget(?: of| is)?|<)\s*${amount}`, "i"))
  const min = text.match(new RegExp(String.raw`(?:above|over|more than|at least|min(?:imum)?|>)\s*${amount}`, "i"))
  return { min: min ? num(min[1], min[2]) : null, max: max ? num(max[1], max[2]) : null }
}

const FACT_RE = /\b(price|cost|how much|rate|size|sizes|available|availability|in stock|stock|sold out)\b/i
const PAIRING_RE = /\b(goes? with|go with|pair(s|ed)? with|match(es)? (with )?(this|it)|complete (the|this) look|style (this|it)|wear with)\b/i
const GREETING_RE = /^\s*(hi+|hello+|hey+|namaste|namaskar|good (morning|evening|afternoon)|hola)\b[\s!.]*$/i

export function parseIntent(raw: string, previous: Intent | null): Ask {
  const text = raw.toLowerCase().replace(/[“”"']/g, " ").replace(/\s+/g, " ").trim()

  if (GREETING_RE.test(text)) return { kind: "greeting" }

  const intent = emptyIntent()
  const categories = collect(text, CATEGORY_WORDS).flat()
  intent.categories = uniq(categories.length ? categories : OUTFIT_WORDS.test(text) ? OUTFIT_CATEGORIES : [])
  intent.colours = uniq(collect(text, COLOUR_WORDS).flat())
  intent.fabrics = uniq(collect(text, FABRIC_WORDS).flat())
  // "silk" also matches inside "cotton silk"; when both are asked for, keep both patterns.
  intent.crafts = uniq(collect(text, CRAFT_WORDS))
  intent.lengths = uniq(collect(text, LENGTH_WORDS).flat())
  intent.occasion = collect(text, OCCASION_WORDS)[0] ?? null
  intent.men = /\b(men|mens|men's|male|groom|husband|boyfriend|him|his)\b/i.test(text)
  const size = text.match(SIZE_RE)?.[1]
  intent.size = size ? (SIZE_ALIASES[size.toLowerCase()] ?? size.toUpperCase()) : null
  const price = parsePrice(text)
  intent.minPrice = price.min
  intent.maxPrice = price.max
  for (const [re, pref] of VIBES) {
    if (!words(re).test(text)) continue
    intent.prefer.fabrics.push(...(pref.fabrics ?? []))
    intent.prefer.crafts.push(...(pref.crafts ?? []))
    if (pref.minPrice) intent.prefer.minPrice = pref.minPrice
  }
  // "light festive outfit for a day wedding": light, breathable fabrics come first.
  if (/\bday wedding|daytime|day time|morning|summer|jaipur|rajasthan|chennai|mumbai heat\b/i.test(text)) {
    intent.prefer.fabrics.push("mul", "cotton", "organza", "chanderi", "linen")
  }

  // Out of scope: something we don't make, and nothing we do make named alongside it.
  const oos = text.match(words(OUT_OF_SCOPE))
  if (oos && !intent.categories.length) {
    const nearby = /shoe|sneaker|trainer|heel|boot/.test(oos[0]) ? ["Shoes"] : /bag|wallet/.test(oos[0]) ? ["Bags"] : []
    return { kind: "out_of_scope", term: oos[0], nearby }
  }

  // "What's the price of Saawan?", "is Gulab available in M?": a named piece.
  if (FACT_RE.test(text)) {
    const name = text
      .replace(/\b(what('s| is)|the|of|for|price|cost|how much|is|are|does|do|you|have|it|in|stock|available|availability|sizes?|sold out|saree|blouse|kurta|set|please|tell me|me|a|an|xxs|xs|s|m|l|xl|xxl|\d?xl)\b/gi, " ")
      .replace(/[?!.,₹]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
    if (name.length >= 3) return { kind: "facts", name, intent }
  }

  // Follow-ups lean on the previous request: "show it in blue", "what goes with this?",
  // "anything cheaper?", "in silk instead".
  if (previous && PAIRING_RE.test(text)) return { kind: "pairing", intent: previous }
  const refinesPrevious =
    previous &&
    !intent.categories.length &&
    // Only when the message points back at what we showed; a short new request is new.
    /\b(it|this|that|these|those|them|same|instead|ones?|also|too|another|similar|but)\b/i.test(text)
  if (refinesPrevious && hasAnything(intent)) {
    const merged: Intent = {
      ...previous,
      colours: intent.colours.length ? intent.colours : previous.colours,
      fabrics: intent.fabrics.length ? intent.fabrics : previous.fabrics,
      crafts: intent.crafts.length ? intent.crafts : previous.crafts,
      lengths: intent.lengths.length ? intent.lengths : previous.lengths,
      size: intent.size ?? previous.size,
      occasion: intent.occasion ?? previous.occasion,
      minPrice: intent.minPrice ?? previous.minPrice,
      maxPrice: intent.maxPrice ?? previous.maxPrice,
      prefer: intent.prefer.fabrics.length || intent.prefer.crafts.length ? intent.prefer : previous.prefer,
    }
    return { kind: "search", intent: merged, refined: true }
  }
  if (previous && /\b(cheaper|less expensive|lower price|more affordable)\b/i.test(text)) {
    return { kind: "search", intent: { ...previous, maxPrice: Math.round((previous.maxPrice ?? 6000) * 0.7) }, refined: true }
  }

  if (!hasAnything(intent)) return { kind: "vague", intent }
  return { kind: "search", intent, refined: false }
}

export function hasAnything(i: Intent) {
  return Boolean(
    i.categories.length ||
      i.colours.length ||
      i.fabrics.length ||
      i.crafts.length ||
      i.lengths.length ||
      i.size ||
      i.occasion ||
      i.minPrice ||
      i.maxPrice ||
      i.prefer.fabrics.length ||
      i.prefer.crafts.length,
  )
}

/** Accept only intent shapes we produced (the client echoes the last one back to us). */
export function sanitiseIntent(value: unknown): Intent | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  const strs = (x: unknown, max = 12) =>
    Array.isArray(x) ? x.filter((s): s is string => typeof s === "string" && s.length <= 40).slice(0, max) : []
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 && x < 10_000_000 ? x : null)
  const prefer = (v.prefer ?? {}) as Record<string, unknown>
  return {
    categories: strs(v.categories),
    colours: strs(v.colours),
    fabrics: strs(v.fabrics),
    crafts: strs(v.crafts),
    lengths: strs(v.lengths),
    size: typeof v.size === "string" && v.size.length <= 8 ? v.size : null,
    occasion: OCCASION_KEYS.includes(v.occasion as Occasion) ? (v.occasion as Occasion) : null,
    minPrice: num(v.minPrice),
    maxPrice: num(v.maxPrice),
    men: v.men === true,
    prefer: { fabrics: strs(prefer.fabrics), crafts: strs(prefer.crafts), minPrice: num(prefer.minPrice) },
  }
}
