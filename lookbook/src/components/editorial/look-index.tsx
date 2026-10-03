"use client"

import Image from "next/image"
import { useState } from "react"
import { AnimatePresence, m } from "framer-motion"
import { formatPrice, imageOf, lookbook, looks, lookTotal, pad } from "@/lib/lookbook"
import { cn } from "@/lib/utils"
import { useOverlays } from "@/store/lookbook"

/** Every look on one page, filterable by chapter (the mood switcher). */
export function LookIndex() {
  const [mood, setMood] = useState<string>("all")
  const openLook = useOverlays((s) => s.openLook)
  const shown = mood === "all" ? looks : looks.filter((l) => l.chapter.id === mood)
  const moods = [{ id: "all", name: "All moods" }, ...lookbook.chapters]

  return (
    <section id="index" aria-labelledby="index-title" className="bg-charcoal px-4 py-24 text-ecru sm:px-8 sm:py-32">
      <div className="mx-auto max-w-[1500px]">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="eyebrow text-haldi">The index</p>
            <h2 id="index-title" className="display mt-4 text-[clamp(3rem,7vw,6rem)]">
              All twenty-four looks
            </h2>
          </div>
          <div role="radiogroup" aria-label="Filter by mood" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:justify-end lg:px-0">
            {moods.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={mood === m.id}
                onClick={() => setMood(m.id)}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-2 text-xs tracking-wide transition-colors duration-300",
                  mood === m.id ? "border-ecru bg-ecru text-charcoal" : "border-ecru/25 text-ecru/75 hover:border-ecru/60",
                )}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>

        <m.ul layout className="mt-12 grid grid-cols-2 gap-x-3 gap-y-10 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4 xl:grid-cols-6">
          <AnimatePresence mode="popLayout" initial={false}>
            {shown.map((look) => (
              <m.li
                key={look.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              >
                <button onClick={() => openLook(look.id)} className="group block w-full text-left">
                  <div className="relative aspect-[3/4] overflow-hidden bg-ecru/10">
                    <Image
                      src={imageOf(look.image)}
                      alt=""
                      fill
                      sizes="(min-width: 1280px) 15vw, (min-width: 1024px) 23vw, (min-width: 640px) 31vw, 46vw"
                      className="object-cover transition-transform duration-[1.2s] ease-editorial group-hover:scale-105"
                    />
                    <span className="eyebrow absolute top-3 left-3 text-[0.6rem]">{pad(look.number)}</span>
                  </div>
                  <p className="mt-3 eyebrow text-[0.58rem] text-ecru/50">{look.chapter.name}</p>
                  <p className="mt-1.5 font-display text-xl leading-tight">{look.title}</p>
                  <p className="mt-1 text-xs text-ecru/60 tabular-nums">The look · {formatPrice(lookTotal(look))}</p>
                </button>
              </m.li>
            ))}
          </AnimatePresence>
        </m.ul>
      </div>
    </section>
  )
}
