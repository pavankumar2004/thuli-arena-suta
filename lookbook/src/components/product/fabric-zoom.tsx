"use client"

import Image from "next/image"
import { useRef, useState } from "react"
import { AnimatePresence, m } from "framer-motion"
import { ChevronLeft, ChevronRight, ZoomIn } from "lucide-react"
import { shopifyImage } from "@/lib/shopify-loader"
import { cn } from "@/lib/utils"

const LENS = 190
const MAGNIFY = 3
const SWIPE = 40

/**
 * A product carousel with a weave magnifier. Arrows, keyboard and swipe move between
 * photographs (cross-fading); with a mouse a lens follows the cursor over a 2000px copy,
 * and on touch a tap zooms in and dragging pans. Thumbnails sit in an equal-width grid
 * that always fits its column.
 *
 * `fill`: from md up, the stage grows to fill a fixed-height parent instead of keeping
 * 3:4 (the photo is contained, not cropped). Used when the gallery shares a dialog with
 * text, so photo and thumbnails always fit the dialog. Phones keep the 3:4 stage.
 */
export function FabricZoom({
  images,
  alt,
  sizes,
  className,
  fill = false,
}: {
  images: string[]
  alt: string
  sizes: string
  className?: string
  fill?: boolean
}) {
  const [[active, dir], setActive] = useState<[number, number]>([0, 0])
  const [lens, setLens] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [zoomed, setZoomed] = useState<{ x: number; y: number } | null>(null)
  const stage = useRef<HTMLDivElement>(null)
  const swipeFrom = useRef<number | null>(null)
  const src = images[active]
  const hiRes = shopifyImage(src, 2000)
  const many = images.length > 1

  const go = (step: number) => {
    setZoomed(null)
    setActive(([i]) => [(i + step + images.length) % images.length, step])
  }

  const at = (e: React.PointerEvent) => {
    const r = stage.current!.getBoundingClientRect()
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)),
      w: r.width,
      h: r.height,
    }
  }

  return (
    <div
      className={cn("flex flex-col gap-2", className)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1)
        if (e.key === "ArrowLeft") go(-1)
      }}
    >
      <div
        ref={stage}
        role="region"
        aria-roledescription="carousel"
        aria-label={`${alt}: photograph ${active + 1} of ${images.length}`}
        className={cn(
          "group relative overflow-hidden bg-sand select-none",
          fill ? "aspect-[3/4] md:aspect-auto md:min-h-0 md:flex-1" : "aspect-[3/4]",
          lens ? "cursor-none" : zoomed ? "cursor-zoom-out touch-none" : "cursor-zoom-in touch-pan-y",
        )}
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse" && !zoomed) swipeFrom.current = e.clientX
        }}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse" && !fill) setLens(at(e))
          else if (zoomed) setZoomed(at(e))
        }}
        onPointerLeave={() => setLens(null)}
        onPointerUp={(e) => {
          if (e.pointerType === "mouse") return
          const from = swipeFrom.current
          swipeFrom.current = null
          if (from !== null && Math.abs(e.clientX - from) > SWIPE && many) return go(e.clientX < from ? 1 : -1)
          setZoomed(zoomed ? null : at(e))
        }}
      >
        <AnimatePresence initial={false} custom={dir}>
          <m.div
            key={src}
            custom={dir}
            initial={{ opacity: 0, x: dir * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -24 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0"
          >
            <Image
              src={src}
              alt={alt}
              fill
              sizes={sizes}
              className={cn("transition-transform duration-500 ease-editorial", fill ? "object-cover md:object-contain" : "object-cover")}
              style={zoomed ? { transform: `scale(${MAGNIFY})`, transformOrigin: `${zoomed.x}% ${zoomed.y}%` } : undefined}
            />
          </m.div>
        </AnimatePresence>

        {lens && (
          <div
            aria-hidden
            className="pointer-events-none absolute z-10 rounded-full border border-ecru/90 shadow-[0_10px_40px_rgba(0,0,0,0.35)]"
            style={{
              width: LENS,
              height: LENS,
              left: `calc(${lens.x}% - ${LENS / 2}px)`,
              top: `calc(${lens.y}% - ${LENS / 2}px)`,
              backgroundImage: `url("${hiRes}")`,
              backgroundRepeat: "no-repeat",
              backgroundSize: `${lens.w * MAGNIFY}px ${lens.h * MAGNIFY}px`,
              backgroundPosition: `${-((lens.x / 100) * lens.w * MAGNIFY - LENS / 2)}px ${-((lens.y / 100) * lens.h * MAGNIFY - LENS / 2)}px`,
            }}
          />
        )}

        {many && (
          <>
            {[-1, 1].map((step) => (
              <button
                key={step}
                onClick={(e) => {
                  e.stopPropagation()
                  go(step)
                }}
                onPointerUp={(e) => e.stopPropagation()}
                onPointerMove={(e) => e.stopPropagation()}
                aria-label={step < 0 ? "Previous photograph" : "Next photograph"}
                className={cn(
                  "absolute top-1/2 z-20 flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-ecru/85 text-charcoal shadow-sm backdrop-blur-sm transition-all duration-300 hover:bg-ecru",
                  step < 0 ? "left-3" : "right-3",
                  "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100",
                )}
              >
                {step < 0 ? <ChevronLeft className="size-4" strokeWidth={1.5} /> : <ChevronRight className="size-4" strokeWidth={1.5} />}
              </button>
            ))}
            <span className="eyebrow pointer-events-none absolute top-3 right-3 z-20 bg-charcoal/45 px-2 py-1.5 text-[0.58rem] text-ecru tabular-nums backdrop-blur-sm">
              {String(active + 1).padStart(2, "0")} / {String(images.length).padStart(2, "0")}
            </span>
          </>
        )}

        <span className="eyebrow pointer-events-none absolute bottom-3 left-3 z-20 flex items-center gap-1.5 bg-charcoal/45 px-2.5 py-1.5 text-[0.58rem] text-ecru backdrop-blur-sm">
          <ZoomIn className="size-3" strokeWidth={1.5} />
          <span className="[@media(hover:hover)]:hidden">{zoomed ? "Tap to zoom out" : "Tap to see the weave"}</span>
          <span className="hidden [@media(hover:hover)]:inline">{fill ? "Use the arrows to browse" : "Hover to see the weave"}</span>
        </span>
      </div>

      {many && (
        <ul
          className="grid shrink-0 gap-1.5"
          style={{ gridTemplateColumns: `repeat(${images.length}, minmax(0, 1fr))` }}
          aria-label="All photographs"
        >
          {images.map((img, i) => (
            <li key={img}>
              <button
                onClick={() => {
                  setZoomed(null)
                  setActive(([cur]) => [i, i > cur ? 1 : -1])
                }}
                aria-label={`Photograph ${i + 1} of ${images.length}`}
                aria-current={i === active}
                className="group/thumb relative block aspect-[3/4] w-full overflow-hidden bg-sand"
              >
                <Image
                  src={img}
                  alt=""
                  fill
                  sizes="80px"
                  className={cn(
                    "object-cover transition-all duration-500",
                    i === active ? "opacity-100" : "opacity-45 group-hover/thumb:opacity-90",
                  )}
                />
                <span
                  className={cn(
                    "absolute inset-x-0 bottom-0 h-0.5 origin-left bg-rust transition-transform duration-500 ease-editorial",
                    i === active ? "scale-x-100" : "scale-x-0",
                  )}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
