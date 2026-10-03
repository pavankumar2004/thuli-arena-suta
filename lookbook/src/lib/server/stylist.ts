import "server-only"

import { formatPrice } from "@/lib/format"
import { emptyIntent, hasAnything, parseIntent, type Ask, type Intent } from "@/lib/stylist/intent"
import { OCCASIONS, type Occasion } from "@/lib/stylist/vocab"
import type { ChatReply, HistoryTurn, StylistEvent, StylistProduct } from "@/lib/stylist/types"
import { describePhoto } from "./llm"
import { plan, type Action, type Plan } from "./planner"
import { alternatives, byHandles, findByName, pairingsFor, search, type Suggestion } from "./search"
import { trace } from "./trace"
import { writeReply, type Brief } from "./writer"

// The stylist, a hybrid:
//   1. plan    a fast model reads the conversation and picks an action + catalogue filters
//              (validated against closed lists); the rule parser runs alongside as the
//              fallback and remains the authority on numbers (budget, size)
//   2. fetch   code turns the plan into parameterised SQL on Neon; when results fall
//              short, it also asks what does exist nearby (alternatives, with counts)
//   3. reply   the model writes a live, conversational reply about those rows only,
//              streamed sentence by sentence and checked before each sentence is sent
// The cards go out as soon as the rows arrive, before the reply starts.

export const HONEST_NO =
  "We specialise in authentic Indian handlooms, mulmul sarees and artisanal apparel; we do not carry that."

type Meta = Extract<StylistEvent, { type: "meta" }>

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`)

const RELAX_LABEL: Record<string, string> = {
  crafts: "the weave or pattern",
  lengths: "the length",
  occasion: "the occasion",
  fabrics: "the fabric",
  size: "the size",
  colours: "the colour",
}

/** The request in words: "red silk sarees for festive wear under ₹5,000". */
function describe(intent: Intent) {
  const cat = intent.categories.length === 1 ? intent.categories[0].toLowerCase() : intent.categories.length ? "outfits" : "pieces"
  const bits = [intent.colours[0]?.toLowerCase(), intent.fabrics[0], intent.crafts[0]?.toLowerCase(), cat].filter(Boolean)
  const occ = intent.occasion ? ` for ${OCCASIONS[intent.occasion].phrase}` : ""
  const size = intent.size ? ` in ${intent.size}` : ""
  const budget = intent.maxPrice ? ` under ${formatPrice(intent.maxPrice)}` : intent.minPrice ? ` above ${formatPrice(intent.minPrice)}` : ""
  return `${bits.join(" ")}${occ}${size}${budget}`
}

/** "festive edit only", "just the wedding edit": switches the occasion edit on from text. */
function editFromText(text: string): Occasion | null {
  const m = text.toLowerCase().match(/\b(festive|sangeet|wedding|haldi|workwear|office|casual|evening|summer)\s+(edit|collection|only)\b/)
  if (!m) return null
  return (m[1] === "office" ? "workwear" : m[1]) as Occasion
}

/** What the rule parser alone would do: the fallback when the planner is slow or fails. */
function planFromRules(ask: Ask): Plan {
  const base = { productName: null, aboutPrevious: false, wantsNew: false, unavailableItem: null, quickReplies: [] }
  switch (ask.kind) {
    case "greeting":
      return { ...base, action: "chitchat", intent: emptyIntent() }
    case "out_of_scope":
      return { ...base, action: "out_of_scope", intent: emptyIntent(), unavailableItem: ask.term }
    case "pairing":
      return { ...base, action: "pairing", intent: ask.intent, aboutPrevious: true }
    case "facts":
      return { ...base, action: "facts", intent: ask.intent, productName: ask.name }
    case "vague":
      return { ...base, action: hasAnything(ask.intent) ? "search" : "clarify", intent: ask.intent }
    case "search":
      return { ...base, action: "search", intent: ask.intent }
  }
}

/** The planner leads; the rules fill in numbers it missed and catch what we don't sell. */
function merge(planned: Plan | null, ask: Ask): Plan {
  if (!planned) return planFromRules(ask)
  if (ask.kind === "out_of_scope" && !planned.intent.categories.length) {
    return { ...planned, action: "out_of_scope", unavailableItem: planned.unavailableItem ?? ask.term }
  }
  const rules = "intent" in ask ? ask.intent : null
  const intent = { ...planned.intent }
  if (rules) {
    intent.maxPrice ??= rules.maxPrice
    intent.minPrice ??= rules.minPrice
    intent.size ??= rules.size
  }
  return { ...planned, intent, productName: planned.productName ?? (ask.kind === "facts" ? ask.name : null) }
}

/** "something else", "other than these", "show me more": they want pieces not yet shown. */
const NEW_RE = /\b(else|others?|other than|another|more|different|new ones|next|fresh|apart from|besides|not these|not those)\b/i

export interface Turn {
  text: string
  image: string | null
  occasion: Occasion | null
  previous: Intent | null
  lastHandles: string[]
  /** Every piece shown to this shopper in this session (the client's memory). */
  seen: string[]
  history: HistoryTurn[]
  injection: boolean
}

/** One turn of the conversation, as a stream of events (meta, then reply deltas). */
export async function* respond(turn: Turn): AsyncGenerator<StylistEvent> {
  const { text, image, previous, lastHandles, history } = turn
  const edit = editFromText(text) ?? turn.occasion
  let speculation: Rows | null = null

  // ---- 1. plan ----------------------------------------------------------------------
  let p: Plan
  if (image) {
    const seen = await describePhoto(image)
    p = seen && hasAnything(seen)
      ? { action: "search", intent: seen, productName: null, aboutPrevious: false, wantsNew: false, unavailableItem: null, quickReplies: [] }
      : { action: "clarify", intent: emptyIntent(), productName: null, aboutPrevious: false, wantsNew: false, unavailableItem: "what is in that photo", quickReplies: [] }
  } else {
    const ask = parseIntent(text, previous)
    trace("rules", { message: text, edit, ...ask })
    // Speculate: start the rule parser's search while the planner thinks. If the plan
    // lands on the same filters, the rows are already here.
    const asksNew = NEW_RE.test(text)
    if (ask.kind === "search") speculation = fetchRows(ask.intent, edit, excludeFor(ask.intent, asksNew, previous, turn.seen))
    p = merge(await plan({ message: text, history, previous, edit }), ask)
    if (asksNew && p.action === "search") p = { ...p, wantsNew: true }
    if (turn.injection && p.action !== "search") p = { ...p, action: "chitchat" }
  }
  trace("plan", { action: p.action, intent: p.intent, productName: p.productName, aboutPrevious: p.aboutPrevious, wantsNew: p.wantsNew, seen: turn.seen.length, edit })

  // ---- 2. fetch ---------------------------------------------------------------------
  const brief: Brief = { action: p.action, message: image ? `${text || "Find pieces like this photo"} [shared a photo]` : text, history }
  let meta: Omit<Meta, "type">
  let fallback: string

  const action: Action = p.action
  if (action === "facts" || action === "pairing") {
    const pronoun = p.aboutPrevious || /^(this|that|it|this one|that one|the first one|first one)$/i.test(p.productName ?? "")
    const [piece] = pronoun && lastHandles.length ? await byHandles(lastHandles.slice(0, 1)) : p.productName ? await findByName(p.productName) : []
    if (!piece) {
      if (hasAnything(p.intent)) {
        ;({ meta, fallback } = await searchStep(p, edit, brief, speculation, previous, turn.seen))
      } else {
        meta = { kind: "no_results", products: [], quickReplies: p.quickReplies, context: { intent: previous, handles: lastHandles } }
        fallback = p.productName
          ? `I couldn't find a piece called "${p.productName}" in our collection. Could you check the name, or tell me what it looks like?`
          : "Which piece do you have in mind? Tell me its name, or ask me for something and I'll show you a few."
        brief.request = p.productName ? `a piece called "${p.productName}" (not found)` : undefined
      }
    } else if (action === "facts") {
      meta = { kind: "facts", products: [piece], quickReplies: p.quickReplies, context: { intent: previous, handles: [piece.handle] } }
      brief.piece = piece
      brief.askedSize = p.intent.size
      fallback = factsLine(piece, p.intent.size)
    } else {
      const { products } = await pairingsFor(piece.handle)
      meta = { kind: "pairing", products, quickReplies: p.quickReplies, context: { intent: previous, handles: [piece.handle, ...products.map((x) => x.handle)] } }
      brief.pairingFor = piece.title
      brief.products = products
      fallback = products.length
        ? `For ${piece.title}, these are the pieces I'd reach for${piece.category === "Sarees" ? ", starting with the blouses Suta styles it with" : ""}.`
        : `I don't have a pairing for ${piece.title} in stock just now.`
    }
  } else if (action === "out_of_scope") {
    const item = p.unavailableItem ?? "that"
    const nearby = /shoe|sneaker|trainer|heel|boot|footwear/i.test(item) ? ["Shoes"] : /bag|wallet|purse/i.test(item) ? ["Bags"] : []
    const products = nearby.length ? (await search({ ...emptyIntent(), categories: nearby })).products : []
    meta = { kind: "out_of_scope", products, quickReplies: p.quickReplies, context: { intent: previous, handles: lastHandles } }
    brief.unavailableItem = item
    brief.products = products
    fallback = `${HONEST_NO}${products.length ? ` We do make a few handcrafted ${nearby[0].toLowerCase()}, if you'd like a look.` : ""}`
  } else if (action === "chitchat" || action === "clarify") {
    meta = { kind: "greeting", products: [], quickReplies: p.quickReplies, context: { intent: previous, handles: lastHandles } }
    fallback = "Tell me where you're going, a colour you can't stop thinking about, or a fabric you love, and I'll find a few pieces from our looms for you."
  } else {
    ;({ meta, fallback } = await searchStep(p, edit, brief, speculation, previous, turn.seen))
  }

  yield { type: "meta", ...meta, edit }

  // ---- 3. reply ---------------------------------------------------------------------
  brief.occasionEdit = edit ? OCCASIONS[edit].label : null
  yield* writeReply(brief, fallback)
}

type Rows = { intent: Intent; exclude: string[]; result: Promise<[Awaited<ReturnType<typeof search>>, Suggestion[]]> }

/**
 * Session memory: which already-shown pieces to leave out. All of them when the shopper
 * asks for something new, and when they repeat the same request (so asking again moves
 * on). A fresh request can show anything.
 */
function excludeFor(intent: Intent, wantsNew: boolean, previous: Intent | null, seen: string[]) {
  return wantsNew || (previous && sameFilters(previous, intent)) ? seen : []
}

/** The search and its "what exists nearby" alternatives, fetched in parallel. */
function fetchRows(intent: Intent, edit: Occasion | null, exclude: string[] = []): Rows {
  const result = Promise.all([search(intent, { edit, exclude }), alternatives(intent, edit).catch(() => [])])
  result.catch(() => {}) // a discarded speculation must not surface as an unhandled rejection
  return { intent, exclude, result }
}

const sameFilters = (a: Intent, b: Intent) => {
  const key = (i: Intent) =>
    JSON.stringify([
      [...i.categories].sort(), [...i.colours].sort(), [...i.fabrics].sort(), [...i.crafts].sort(), [...i.lengths].sort(),
      i.size, i.occasion, i.minPrice, i.maxPrice, i.men, [...i.prefer.fabrics].sort(), [...i.prefer.crafts].sort(), i.prefer.minPrice,
    ])
  return key(a) === key(b)
}

async function searchStep(
  p: Plan,
  edit: Occasion | null,
  brief: Brief,
  speculation: Rows | null,
  previous: Intent | null,
  seen: string[],
) {
  const intent = p.intent
  const exclude = excludeFor(intent, p.wantsNew, previous, seen)
  const reused = speculation && sameFilters(speculation.intent, intent) && speculation.exclude.length === exclude.length
  trace("fetch", {
    rows: reused ? "reused the rule parser's speculative search" : "searched with the planner's filters",
    leftOut: exclude.length ? `${exclude.length} pieces already shown this session` : "nothing",
  })
  const [found, nearby] = await (reused ? speculation : fetchRows(intent, edit, exclude)).result
  const shortfall = !found.products.length || found.relaxed.length > 0 || found.products.length < 3
  const suggestions: Suggestion[] = shortfall ? nearby : []
  brief.newOnly = exclude.length > 0
  brief.nothingNewLeft = exclude.length > 0 && !found.products.length
  brief.seenCount = seen.length
  const relaxed = found.relaxed.map((r) => RELAX_LABEL[r])
  brief.request = describe(intent)
  brief.products = found.products
  brief.relaxed = relaxed
  brief.alternatives = suggestions
  const meta: Omit<Meta, "type"> = {
    kind: found.products.length ? "results" : "no_results",
    products: found.products,
    relaxed,
    suggestions,
    quickReplies: suggestions.length ? [] : p.quickReplies,
    context: { intent, handles: found.products.map((x) => x.handle) },
  }
  return { meta, fallback: fallbackLine(intent, edit, found.products, found.relaxed, suggestions, brief.nothingNewLeft) }
}

/** The safe line used if the model stalls or a sentence fails the grounding check. */
function fallbackLine(intent: Intent, edit: Occasion | null, products: StylistProduct[], relaxed: string[], suggestions: Suggestion[], allSeen = false) {
  const what = `${describe(intent)}${edit && intent.occasion !== edit ? ` in the ${OCCASIONS[edit].label.toLowerCase()}` : ""}`
  if (!products.length && allSeen) {
    return `I've already shown you everything we have in ${what}. ${suggestions.length ? "Here is what else I can show you." : "Try loosening the colour or the budget, and I'll look again."}`
  }
  if (!products.length) {
    return suggestions.length
      ? `Nothing in our current collection matches ${what}, but here is what I can show you instead.`
      : `Nothing in our current collection matches ${what}. Try loosening the budget or the colour, and I'll look again.`
  }
  const names = list(products.slice(0, 2).map((p) => p.title))
  if (relaxed.length) return `Nothing matched ${list(relaxed.map((r) => RELAX_LABEL[r]))} exactly, so here are the closest: ${names} lead the way.`
  return `Here are ${products.length === 1 ? "one piece" : `${products.length} pieces`} I'd reach for, ${names} first.`
}

/** Price and stock, word for word from the database row. */
function factsLine(p: StylistProduct, size: string | null) {
  const price = `${p.title} is ${formatPrice(p.price)}${p.compareAtPrice ? ` (reduced from ${formatPrice(p.compareAtPrice)})` : ""}.`
  if (!p.available || !p.sizesInStock.length) return `${price} It's sold out at the moment.`
  if (p.sizes.length === 1 && p.sizes[0] === "Free Size") return `${price} It's free size, and in stock.`
  if (size) {
    return p.sizesInStock.includes(size)
      ? `${price} Yes, size ${size} is in stock.`
      : `${price} Size ${size} isn't available right now; in stock: ${p.sizesInStock.join(", ")}.`
  }
  return `${price} In stock in ${list(p.sizesInStock)}.`
}

/** Runs a turn to completion, for clients that don't stream (tests, curl). */
export async function respondOnce(turn: Turn): Promise<Omit<ChatReply, "ms" | "trace">> {
  let meta: Omit<Meta, "type"> | null = null
  let reply = ""
  for await (const ev of respond(turn)) {
    if (ev.type === "meta") {
      const { type, ...rest } = ev
      void type
      meta = rest
    }
    else if (ev.type === "delta") reply += ev.text
    else if (ev.type === "replace") reply = ev.text
  }
  return { ...(meta ?? { kind: "error", products: [], context: { intent: turn.previous, handles: turn.lastHandles } }), reply }
}
