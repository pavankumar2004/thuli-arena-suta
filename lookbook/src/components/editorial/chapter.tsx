import { cn } from "@/lib/utils"
import type { Chapter as ChapterData } from "@/types/lookbook"
import { ChapterBanner } from "./chapter-banner"
import { LookFigure } from "./look-figure"
import { Reveal } from "./reveal"

const BIG = "(min-width: 1024px) 52vw, 100vw"
const MID = "(min-width: 1024px) 38vw, 100vw"
const SMALL = "(min-width: 1024px) 30vw, 100vw"

/**
 * A chapter is a spread: the opener (sticky on desktop) beside its first look, then an
 * offset pair, then a closing look beside the drape note. Every other chapter is mirrored.
 */
export function Chapter({ chapter, index }: { chapter: ChapterData; index: number }) {
  const dark = chapter.tone === "dark"
  const flip = index % 2 === 1
  const [first, second, third, fourth] = chapter.looks
  const tone = dark ? "dark" : "light"

  return (
    <div id={chapter.id}>
    <ChapterBanner chapter={chapter} />
    <section
      aria-labelledby={`${chapter.id}-title`}
      className={cn(
        "relative px-4 py-24 sm:px-8 sm:py-32",
        dark ? "bg-ink text-ecru" : index % 2 ? "grain bg-kora" : "grain bg-ecru",
      )}
    >
      <div className="mx-auto max-w-[1500px]">

        <div className="grid gap-x-10 gap-y-16 lg:grid-cols-12">
          <header className={cn("self-start lg:sticky lg:top-28 lg:col-span-5", flip && "lg:order-2 lg:col-start-8")}>
            <Reveal>
              <p className={cn("font-display text-3xl italic", dark ? "text-haldi" : "text-rust")}>{chapter.numeral}</p>
              <h2 id={`${chapter.id}-title`} className="display mt-2 text-[clamp(3.6rem,7.4vw,7.6rem)]">
                {chapter.name}
              </h2>
              <p className="mt-4 font-display text-2xl font-light italic sm:text-3xl">{chapter.title}</p>
            </Reveal>
            <Reveal delay={0.1}>
              <p className={cn("mt-8 max-w-md text-[0.98rem] leading-relaxed", dark ? "text-ecru/80" : "text-charcoal/80")}>
                {chapter.intro}
              </p>
              <div className="mt-8 flex items-center gap-4">
                <span className={cn("eyebrow", dark ? "text-ecru/50" : "text-stone")}>Palette</span>
                <ul className="flex gap-1.5" aria-label={`${chapter.name} palette`}>
                  {chapter.palette.map((colour) => (
                    <li
                      key={colour}
                      className={cn("size-5 rounded-full border", dark ? "border-ecru/25" : "border-charcoal/10")}
                      style={{ backgroundColor: colour }}
                    />
                  ))}
                </ul>
              </div>
            </Reveal>
          </header>

          <div className={cn("lg:col-span-7", flip && "lg:order-1 lg:col-start-1")}>
            <Reveal>
              <LookFigure id={first.id} sizes={BIG} tone={tone} />
            </Reveal>
          </div>
        </div>

        {second && third && (
          <div className="mt-24 grid gap-x-10 gap-y-20 lg:mt-36 lg:grid-cols-12">
            <Reveal className={cn("lg:col-span-5", flip ? "lg:col-start-8" : "lg:col-start-1")}>
              <LookFigure id={second.id} sizes={MID} tone={tone} />
            </Reveal>
            <Reveal
              className={cn("lg:col-span-4 lg:mt-56", flip ? "lg:order-first lg:col-start-2" : "lg:col-start-8")}
              delay={0.08}
            >
              <LookFigure id={third.id} sizes={SMALL} tone={tone} />
            </Reveal>
          </div>
        )}

        {fourth && (
          <div className="mt-24 grid items-end gap-x-10 gap-y-12 lg:mt-36 lg:grid-cols-12">
            <Reveal className={cn("lg:col-span-6", flip ? "lg:col-start-2" : "lg:col-start-6")}>
              <LookFigure id={fourth.id} sizes={MID} tone={tone} />
            </Reveal>
            <Reveal
              className={cn("lg:col-span-4 lg:row-start-1 lg:pb-40", flip ? "lg:col-start-8" : "lg:col-start-1")}
              delay={0.1}
            >
              <blockquote>
                <p className="font-display text-[clamp(1.8rem,3.2vw,2.6rem)] leading-[1.15] font-light italic">
                  &ldquo;{chapter.verse}&rdquo;
                </p>
              </blockquote>
              <div className={cn("mt-10 border-t pt-6", dark ? "border-ecru/20" : "border-charcoal/15")}>
                <p className={cn("eyebrow", dark ? "text-haldi" : "text-rust")}>How to wear it</p>
                <p className={cn("mt-4 text-[0.94rem] leading-relaxed", dark ? "text-ecru/75" : "text-charcoal/75")}>
                  {chapter.drape}
                </p>
              </div>
            </Reveal>
          </div>
        )}
      </div>
    </section>
    </div>
  )
}
