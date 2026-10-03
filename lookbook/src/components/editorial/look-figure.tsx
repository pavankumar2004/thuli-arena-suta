"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { AnimatePresence, m } from "framer-motion"
import { ArrowRight } from "lucide-react"
import { imageOf, kind, lookById, pad, piecesOf, product } from "@/lib/lookbook"
import { cn } from "@/lib/utils"
import { useOverlays } from "@/store/lookbook"
import { SaveButton } from "@/components/product/save-button"
import { HotspotCard, HotspotPin } from "./hotspot"

const EASE = [0.76, 0, 0.24, 1] as const

/**
 * One look: the photograph (unveiled with a curtain wipe) with its pins, then a short
 * caption crediting what she's wearing. Clicking the photograph opens the look.
 */
export function LookFigure({
  id,
  sizes,
  tone = "light",
  className,
}: {
  id: string
  sizes: string
  tone?: "light" | "dark"
  className?: string
}) {
  const look = lookById(id)!
  const [openSpot, setOpenSpot] = useState<number | null>(null)
  const frame = useRef<HTMLDivElement>(null)
  const openLook = useOverlays((s) => s.openLook)
  const pieces = piecesOf(look)
  const hero = product(look.image.product)
  const dark = tone === "dark"

  useEffect(() => {
    if (openSpot === null) return
    const onDown = (e: PointerEvent) => {
      if (!frame.current?.contains(e.target as Node)) setOpenSpot(null)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenSpot(null)
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [openSpot])

  return (
    <figure id={`look-${look.id}`} className={cn("group/look", className)}>
      <div
        ref={frame}
        data-cursor="View the look"
        className="relative aspect-[3/4] cursor-pointer"
        onClick={() => (openSpot !== null ? setOpenSpot(null) : openLook(look.id))}
      >
        <m.div
          className={cn("absolute inset-0 overflow-hidden", dark ? "bg-ecru/10" : "bg-sand")}
          initial={{ clipPath: "inset(100% 0% 0% 0%)" }}
          whileInView={{ clipPath: "inset(0% 0% 0% 0%)" }}
          viewport={{ once: true, margin: "0px 0px -15% 0px" }}
          transition={{ duration: 1.3, ease: EASE }}
        >
          <m.div
            className="absolute inset-0"
            initial={{ scale: 1.18 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true, margin: "0px 0px -15% 0px" }}
            transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <Image
              src={imageOf(look.image)}
              alt={`${look.title}: ${pieces.map((p) => p.title).join(" with ")}, from Suta's ${hero.collection ?? look.chapter.name} collection`}
              fill
              sizes={sizes}
              className="object-cover transition-transform duration-[1.6s] ease-editorial group-hover/look:scale-[1.03]"
            />
          </m.div>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-charcoal/30 to-transparent" />
        </m.div>
        <span className="eyebrow pointer-events-none absolute top-4 left-4 text-ecru">Look {pad(look.number)}</span>

        {look.hotspots.map((spot, i) => (
          <HotspotPin
            key={spot.product}
            spot={spot}
            product={product(spot.product)}
            index={i}
            open={openSpot === i}
            onToggle={() => setOpenSpot(openSpot === i ? null : i)}
          />
        ))}
        <AnimatePresence>
          {openSpot !== null && (
            <HotspotCard
              key={openSpot}
              spot={look.hotspots[openSpot]}
              product={product(look.hotspots[openSpot].product)}
              onClose={() => setOpenSpot(null)}
            />
          )}
        </AnimatePresence>
      </div>

      <figcaption className="mt-6">
        <div className="flex items-start justify-between gap-4">
          <h3 className="font-display text-[1.9rem] leading-[1.05] font-light sm:text-4xl">{look.title}</h3>
          <SaveButton kind="look" id={look.id} label={look.title} className="-mt-1 -mr-2" />
        </div>
        <p className={cn("mt-2 max-w-md text-[0.94rem] leading-relaxed", dark ? "text-ecru/80" : "text-charcoal/80")}>
          {look.blurb}
        </p>
        <p className={cn("mt-4 text-sm", dark ? "text-ecru/70" : "text-charcoal/70")}>
          <span className={cn("eyebrow mr-3 text-[0.58rem]", dark ? "text-haldi" : "text-rust")}>Wearing</span>
          {pieces.map((p, i) => (
            <span key={p.handle}>
              {i > 0 && <span className="mx-2 opacity-40">/</span>}
              <span className="font-display text-base italic">{p.title}</span>{" "}
              <span className="lowercase opacity-70">{kind(p)}</span>
            </span>
          ))}
        </p>
        <button onClick={() => openLook(look.id)} className="group/btn mt-5 inline-flex items-center gap-2 text-sm">
          <span className="border-b border-current pb-0.5">Open the look</span>
          <ArrowRight className="size-3.5 transition-transform duration-500 group-hover/btn:translate-x-1" strokeWidth={1.5} />
        </button>
      </figcaption>
    </figure>
  )
}
