import type { Intent } from "./intent"
import type { Occasion } from "./vocab"

/** A product card, exactly as stored in Neon. Nothing here is written by a model. */
export interface StylistProduct {
  handle: string
  title: string
  url: string
  category: string | null
  price: number
  compareAtPrice: number | null
  available: boolean
  sizes: string[]
  sizesInStock: string[]
  colours: string[]
  fabric: string | null
  image: string | null
  /** Meets some but not all of what was asked; shown as "Close match". */
  closeMatch?: boolean
}

/** A previous turn, as the client remembers it (sanitised and capped on the server). */
export interface HistoryTurn {
  role: "shopper" | "stylist"
  text: string
}

export interface ChatRequest {
  message: string
  /** Optional photo for visual search, as a data URL. */
  image?: string
  /** Occasion chip the shopper has switched on (the curveball filter). */
  occasion?: Occasion | null
  /** Echo of the previous reply's context, for follow-ups. */
  context?: { intent?: Intent | null; handles?: string[] }
  /** The last few turns, so the stylist can hold a conversation. */
  history?: HistoryTurn[]
  /** Ask for a streamed (NDJSON) reply instead of one JSON object. */
  stream?: boolean
}

export interface ChatReply {
  reply: string
  products: StylistProduct[]
  kind: "results" | "facts" | "pairing" | "out_of_scope" | "no_results" | "greeting" | "error"
  context: { intent: Intent | null; handles: string[] }
  /** Filters relaxed to find anything, shown to the shopper for honesty. */
  relaxed?: string[]
  /** When results fell short: nearby requests that do have stock, with real counts. */
  suggestions?: { label: string; message: string; count: number }[]
  /** Things the shopper might say next, proposed by the planner for this conversation. */
  quickReplies?: string[]
  /** An occasion edit the stylist switched on from the message ("festive edit only"). */
  edit?: Occasion | null
  ms: number
  /** Development only: parsed request, SQL and any model prompts, in order. */
  trace?: { step: string; ms?: number; detail: unknown }[]
}

export interface TryOnReply {
  image: string
  product: { handle: string; title: string; url: string }
  ms: number
}

/** The streamed reply, one JSON object per line. */
export type StylistEvent =
  | ({ type: "meta" } & Omit<ChatReply, "reply" | "ms" | "trace">)
  | { type: "delta"; text: string }
  | { type: "replace"; text: string }
  | { type: "done"; ms: number; trace?: ChatReply["trace"] }
  | { type: "error"; error: string }
