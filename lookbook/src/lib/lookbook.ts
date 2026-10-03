import looksJson from "@/data/looks.json"
import productsJson from "@/data/products.index.json"
import type { Frame, IndexedLook, Lookbook, ProductSummary } from "@/types/lookbook"

export const lookbook = looksJson as Lookbook
export const products = productsJson.products as Record<string, ProductSummary>
export const scrapedAt = productsJson.scrapedAt
export const coverPanels = productsJson.cover as (Frame & { x: number; y: number })[][]
export const framesOf = (chapterId: string) => (productsJson.frames as Record<string, Frame[]>)[chapterId] ?? []

export const looks: IndexedLook[] = lookbook.chapters.flatMap((chapter) => chapter.looks).map((look, i) => ({
  ...look,
  number: i + 1,
  chapter: lookbook.chapters.find((c) => c.looks.includes(look))!,
}))

export function product(handle: string): ProductSummary {
  const p = products[handle]
  if (!p) throw new Error(`Unknown product ${handle}; run scripts/build-data.mjs`)
  return p
}

export function lookById(id: string) {
  return looks.find((l) => l.id === id)
}

export function imageOf(ref: { product: string; index: number; src?: string }) {
  if (ref.src) return ref.src
  const p = product(ref.product)
  return p.images[ref.index] ?? p.images[0]
}

/** Every piece in a look: pinned pieces first, then unpinned extras. */
export function piecesOf(look: { hotspots: { product: string }[]; extras?: string[] }): ProductSummary[] {
  const handles = [...look.hotspots.map((h) => h.product), ...(look.extras ?? [])]
  return [...new Set(handles)].map(product)
}

export function lookTotal(look: Parameters<typeof piecesOf>[0]) {
  return piecesOf(look).reduce((sum, p) => sum + p.price, 0)
}

export { formatPrice } from "./format"

export const pad = (n: number) => String(n).padStart(2, "0")

export function kind(p: { category: string | null }) {
  if (!p.category) return "Piece"
  if (p.category === "Sarees") return "Saree"
  if (p.category === "Blouses") return "Blouse"
  if (p.category.startsWith("Co-ords")) return "Kurta set"
  return p.category.replace(/s$/, "")
}
