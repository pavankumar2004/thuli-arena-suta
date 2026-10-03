"use client"

import Image from "next/image"
import { ArrowUpRight, Sparkles } from "lucide-react"
import { formatPrice } from "@/lib/format"
import type { StylistProduct } from "@/lib/stylist/types"

/** One product, exactly as it is in the catalogue: photo, name, price, category, fabric. */
export function StylistCard({ product, onTryOn }: { product: StylistProduct; onTryOn: (p: StylistProduct) => void }) {
  const kind = product.category?.replace(/s$/, "").replace("Co-ords & Kurta Set", "Kurta set") ?? "Piece"
  return (
    <article className="flex min-w-0 flex-col bg-white/60 shadow-[0_1px_0_rgba(26,26,26,0.06)]">
      <a href={product.url} target="_blank" rel="noopener" className="group relative block aspect-[4/5] overflow-hidden bg-sand">
        {product.image && (
          <Image
            src={product.image}
            alt={product.title}
            fill
            sizes="(min-width: 768px) 260px, (min-width: 640px) 30vw, 50vw"
            className="object-cover transition-transform duration-700 ease-editorial group-hover:scale-105"
          />
        )}
        {product.closeMatch && (
          <span className="eyebrow absolute top-2 left-2 bg-ecru/90 px-2 py-1 text-[0.6rem] text-stone">Close match</span>
        )}
      </a>
      <div className="flex flex-1 flex-col p-3">
        <p className="eyebrow truncate text-[0.6rem] text-stone">
          {kind}
          {product.fabric && <> · {product.fabric}</>}
        </p>
        <h3 className="mt-1.5 line-clamp-2 font-display text-xl leading-tight">{product.title}</h3>
        <p className="mt-1 flex items-baseline gap-1.5 text-base tabular-nums">
          {formatPrice(product.price)}
          {product.compareAtPrice && <s className="text-xs text-stone">{formatPrice(product.compareAtPrice)}</s>}
        </p>
        <div className="mt-auto grid grid-cols-[1fr_auto] gap-1.5 pt-3 text-sm">
          <button
            onClick={() => onTryOn(product)}
            className="flex items-center justify-center gap-1.5 bg-charcoal px-2 py-2 text-ecru transition-colors hover:bg-rust"
          >
            <Sparkles className="size-3.5" strokeWidth={1.5} /> Try this on
          </button>
          <a
            href={product.url}
            target="_blank"
            rel="noopener"
            aria-label={`${product.title} on suta.in`}
            className="flex items-center justify-center border border-charcoal/20 px-2 transition-colors hover:bg-kora"
          >
            <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
          </a>
        </div>
      </div>
    </article>
  )
}
