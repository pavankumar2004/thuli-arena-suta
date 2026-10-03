// Full product records for the drawers. Imported only by overlay components, which
// load after the page is interactive, so the stories and galleries stay off the
// critical path.
import full from "@/data/products.json"
import type { Product } from "@/types/lookbook"

const details = full.products as Record<string, Product>

export function detail(handle: string): Product {
  const p = details[handle]
  if (!p) throw new Error(`Unknown product ${handle}; run scripts/build-data.mjs`)
  return p
}
