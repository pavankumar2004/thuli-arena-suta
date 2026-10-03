"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { m, useScroll, useTransform } from "framer-motion"
import { coverPanels, lookbook } from "@/lib/lookbook"
import { whenIdle } from "@/lib/idle"
import { cn } from "@/lib/utils"
import { scrollToId } from "@/lib/scroll"

const INTERVAL = 6500

/**
 * A quiet, living cover: just the photographs and the title. Three panels (one on
 * phones) cross-fade through frames from different chapters, staggered so the triptych
 * never changes all at once, with a slow push-in on the frame that's showing. Only the
 * first frames load up front.
 */
export function Cover() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] })
  const imageY = useTransform(scrollYProgress, [0, 1], ["0%", "14%"])
  const titleY = useTransform(scrollYProgress, [0, 1], ["0%", "-40%"])
  const fade = useTransform(scrollYProgress, [0, 0.6], [1, 0])

  const [live, setLive] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => whenIdle(() => setLive(true), 3000), [])
  useEffect(() => {
    if (!live || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const id = window.setInterval(() => setTick((t) => t + 1), INTERVAL / 3)
    return () => window.clearInterval(id)
  }, [live])

  // Panel p advances on every third tick, offset by p, so panels change one at a time.
  // The middle panel (index 1) is the phone cover and the LCP image.
  // Every panel opens on its first slide (the old offsets started the middle one on its
  // second, so the preloaded LCP image never showed). Left changes first, then right,
  // and the middle holds its opening frame longest.
  const STAGGER = [2, 0, 1]
  const slideOf = (p: number) => Math.floor((tick + STAGGER[p]) / 3) % coverPanels[p].length

  return (
    <section ref={ref} id="top" className="relative h-[100svh] min-h-[560px] overflow-hidden bg-charcoal text-ecru">
      <m.div style={{ y: imageY }} className="absolute inset-0 grid grid-cols-1 md:grid-cols-3">
        {coverPanels.map((slides, p) => {
          const active = slideOf(p)
          return (
            <div key={p} className={cn("relative h-full overflow-hidden", p !== 1 && "hidden md:block")}>
              {slides.map((s, k) =>
                k === 0 || live ? (
                  <div
                    key={s.src}
                    className={cn(
                      "absolute inset-0 transition-opacity duration-[1800ms] ease-in-out",
                      k === active ? "opacity-100" : "opacity-0",
                    )}
                  >
                    <Image
                      src={s.src}
                      alt=""
                      fill
                      preload={p === 1 && k === 0}
                      loading={k === 0 ? "eager" : "lazy"}
                      fetchPriority={k === 0 ? "high" : "low"}
                      // Side panels are hidden on phones; "1px" makes them fetch the tiniest candidate there.
                      sizes={p === 1 ? "(min-width: 768px) 34vw, 100vw" : "(min-width: 768px) 34vw, 1px"}
                      className={cn("object-cover", k === active && live && "kenburns")}
                      // Zoom towards the focal point, not the centre: a centred push-in
                      // pushed faces near the top out of the tall panel.
                      style={{ objectPosition: `${s.x}% ${s.y}%`, transformOrigin: `${s.x}% ${s.y}%` }}
                    />
                  </div>
                ) : null,
              )}
            </div>
          )
        })}
      </m.div>
      <div className="absolute inset-0 bg-gradient-to-b from-charcoal/35 via-transparent to-charcoal/60" />

      <m.div
        style={{ y: titleY, opacity: fade }}
        className="relative flex h-full flex-col items-center justify-end px-4 pb-[9vh] text-center"
      >
        <h1 className="display text-[clamp(5.5rem,20vw,13rem)] font-light italic">{lookbook.title}</h1>
        <p className="eyebrow mt-3 text-ecru/85">{lookbook.subtitle}</p>
        <button onClick={() => scrollToId("prologue")} className="mt-12 p-2" aria-label="Begin reading">
          <span className="scroll-cue block h-10 w-px bg-ecru/70" />
        </button>
      </m.div>
    </section>
  )
}
