"use client"

import Image from "next/image"
import { useRef } from "react"
import { m, useScroll, useTransform } from "framer-motion"
import { framesOf } from "@/lib/lookbook"
import { cn } from "@/lib/utils"
import type { Chapter } from "@/types/lookbook"

/**
 * The full-bleed banner that opens each chapter and closes the one before it: three
 * frames from the chapter's shoot (one on phones), drifting at different speeds as
 * you scroll past, with the chapter's numeral and name set over them.
 */
export function ChapterBanner({ chapter }: { chapter: Chapter }) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] })
  const slow = useTransform(scrollYProgress, [0, 1], ["-6%", "6%"])
  const fast = useTransform(scrollYProgress, [0, 1], ["-12%", "12%"])
  const title = useTransform(scrollYProgress, [0, 1], ["30%", "-30%"])
  const frames = framesOf(chapter.id).slice(0, 3)
  const banner = chapter.banner ?? {}

  return (
    <div ref={ref} className="relative overflow-hidden bg-charcoal text-ecru">
      <div className="relative h-[78svh] min-h-[460px] lg:h-[84vh]">
        <div className="absolute inset-0 grid grid-cols-1 gap-px md:grid-cols-[1fr_1.35fr_1fr]">
          {frames.map((f, i) => (
            <div key={f.src} className={cn("relative overflow-hidden", i !== 1 && "hidden md:block")}>
              <m.div style={{ y: i === 1 ? slow : fast }} className="absolute -inset-y-[14%] inset-x-0">
                <Image
                  src={f.src}
                  alt=""
                  fill
                  sizes={i === 1 ? "(min-width: 768px) 41vw, 100vw" : "(min-width: 768px) 30vw, 1px"}
                  className="object-cover"
                  style={{ objectPosition: `50% ${banner.focus?.[i] ?? 30}%` }}
                />
              </m.div>
            </div>
          ))}
        </div>
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg, ${chapter.palette[1]}33 0%, transparent 35%, rgba(26,26,26,0.72) 100%)`,
          }}
        />

        <m.div style={{ y: title }} className="absolute inset-x-0 bottom-0 px-4 pb-14 sm:px-8 sm:pb-20">
          <div className="mx-auto flex max-w-[1500px] flex-col items-start gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
            <div>
              <p className="eyebrow text-ecru/75">Chapter {chapter.numeral}</p>
              <p className="display mt-3 text-[clamp(4.5rem,13vw,12rem)] font-light">{chapter.name}</p>
            </div>
            <div className="max-w-xs pb-3 sm:text-right">
              <p className="font-display text-2xl italic sm:text-3xl">{chapter.title}</p>
              <p className="eyebrow mt-3 leading-relaxed text-ecru/70">{chapter.when}</p>
            </div>
          </div>
        </m.div>
      </div>

      {/* A slow ticker of the chapter's verse, in its first colour: the seam between chapters. */}
      <div className="marquee overflow-hidden border-t border-ecru/10 py-4" style={{ backgroundColor: banner.ink ?? chapter.palette[2] }} aria-hidden>
        <div className="marquee-track flex w-max">
          {[0, 1].map((half) => (
            <div key={half} className="flex shrink-0 items-center">
              {Array.from({ length: 4 }, (_, k) => (
                <span key={k} className="flex items-center whitespace-nowrap font-display text-lg italic text-ecru/85 sm:text-xl">
                  <span className="px-8">{chapter.verse}</span>
                  <span className="eyebrow not-italic text-ecru/50">
                    {chapter.numeral} · {chapter.name}
                  </span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
