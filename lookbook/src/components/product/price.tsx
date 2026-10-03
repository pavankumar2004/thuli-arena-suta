import { formatPrice } from "@/lib/lookbook"
import { cn } from "@/lib/utils"
import type { ProductSummary } from "@/types/lookbook"

/** Catalogue price, with the pre-sale price struck through when the piece is on sale. */
export function Price({ product, className }: { product: ProductSummary; className?: string }) {
  const onSale = product.compareAtPrice && product.compareAtPrice > product.price
  return (
    <span className={cn("inline-flex items-baseline gap-2 tabular-nums", className)}>
      <span>{formatPrice(product.price)}</span>
      {onSale && (
        <s className="text-[0.85em] opacity-50" aria-label={`was ${formatPrice(product.compareAtPrice!)}`}>
          {formatPrice(product.compareAtPrice!)}
        </s>
      )}
      {!product.available && <span className="eyebrow text-[0.6rem] text-rust">Sold out</span>}
    </span>
  )
}
