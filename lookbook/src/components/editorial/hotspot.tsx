"use client"

import Image from "next/image"
import { m } from "framer-motion"
import { ArrowUpRight, Plus } from "lucide-react"
import { kind } from "@/lib/lookbook"
import { cn } from "@/lib/utils"
import { useOverlays } from "@/store/lookbook"
import { Price } from "@/components/product/price"
import type { Hotspot, ProductSummary } from "@/types/lookbook"

/** A pulsing pin on a photograph. */
export function HotspotPin({
  spot,
  product,
  open,
  onToggle,
  index,
}: {
  spot: Hotspot
  product: ProductSummary
  open: boolean
  onToggle: () => void
  index: number
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      aria-expanded={open}
      aria-label={`${kind(product)}: ${product.title}`}
      className={cn("group absolute -translate-x-1/2 -translate-y-1/2 p-2.5", open ? "z-20" : "z-10")}
      style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
    >
      <span
        className="hotspot-ring absolute inset-2.5 rounded-full bg-ecru"
        style={{ animationDelay: `${index * 0.6}s` }}
      />
      <span
        className={cn(
          "relative flex size-7 items-center justify-center rounded-full border border-ecru/80 bg-charcoal/35 text-ecru backdrop-blur-sm transition-all duration-500 ease-editorial group-hover:scale-110 group-hover:bg-ecru group-hover:text-charcoal",
          open && "scale-110 bg-ecru text-charcoal",
        )}
      >
        <Plus className={cn("size-3.5 transition-transform duration-500", open && "rotate-45")} strokeWidth={1.5} />
      </span>
    </button>
  )
}

/**
 * The card for an open pin. It sits at `left: x%` and shifts left by x% of its own
 * width, so it always stays inside the photo whatever the pin's position or screen size.
 */
export function HotspotCard({ spot, product, onClose }: { spot: Hotspot; product: ProductSummary; onClose: () => void }) {
  const openPiece = useOverlays((s) => s.openPiece)
  const above = spot.y > 55
  return (
    <div
      className="pointer-events-none absolute z-30 w-[min(15.5rem,calc(100%-1.5rem))]"
      style={{
        left: `${spot.x}%`,
        top: `${spot.y}%`,
        transform: `translate(-${spot.x}%, ${above ? "calc(-100% - 1.6rem)" : "1.6rem"})`,
      }}
    >
      <m.div
        initial={{ opacity: 0, y: above ? 10 : -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: above ? 10 : -10 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-auto bg-ecru text-charcoal shadow-[0_18px_50px_-12px_rgba(26,26,26,0.5)]"
        role="dialog"
        aria-label={product.title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-3 p-3">
          <div className="relative aspect-[3/4] w-16 shrink-0 overflow-hidden bg-sand">
            <Image src={product.images[0]} alt="" fill sizes="64px" className="object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="eyebrow text-[0.58rem] text-stone">{kind(product)}</p>
            <p className="mt-1.5 font-display text-xl leading-tight">{product.title}</p>
            {product.fabric && <p className="mt-0.5 truncate text-xs text-stone">{product.fabric}</p>}
            <Price product={product} className="mt-1.5 text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-border text-xs">
          <button
            onClick={() => {
              onClose()
              openPiece(product.handle)
            }}
            className="py-2.5 transition-colors hover:bg-kora"
          >
            The piece
          </button>
          <a
            href={product.url}
            target="_blank"
            rel="noopener"
            className="flex items-center justify-center gap-1 border-l border-border py-2.5 transition-colors hover:bg-kora"
          >
            At suta.in <ArrowUpRight className="size-3" strokeWidth={1.5} />
          </a>
        </div>
      </m.div>
    </div>
  )
}
