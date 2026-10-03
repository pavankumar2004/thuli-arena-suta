import Image from "next/image"
import Link from "next/link"
import { imageOf, lookbook, looks } from "@/lib/lookbook"
import { Reveal } from "./reveal"

/** The note before chapter one, and the contents. */
export function Prologue() {
  return (
    <section id="prologue" className="grain bg-ecru px-4 py-24 sm:px-8 sm:py-36">
      <div className="mx-auto max-w-[1400px]">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="eyebrow text-rust">A note before we begin</p>
          <p className="mt-8 font-display text-[clamp(1.9rem,4.4vw,3.4rem)] leading-[1.12] font-light">
            {lookbook.prologue[0]}
          </p>
          <p className="mx-auto mt-8 max-w-xl text-[0.98rem] leading-relaxed text-charcoal/75">{lookbook.prologue[1]}</p>
        </Reveal>

        <nav aria-label="Contents" className="mt-24 sm:mt-32">
          <Reveal>
            <p className="eyebrow mb-8 text-stone">Contents</p>
          </Reveal>
          <ol className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-6">
            {lookbook.chapters.map((c, i) => {
              const first = looks.find((l) => l.chapter.id === c.id)!
              return (
                <li key={c.id}>
                  <Reveal delay={i * 0.06}>
                    <Link href={`#${c.id}`} className="group block">
                      <div className="relative aspect-[3/4] overflow-hidden bg-sand">
                        <Image
                          src={imageOf(first.image)}
                          alt=""
                          fill
                          sizes="(min-width: 1024px) 16vw, (min-width: 640px) 31vw, 46vw"
                          className="object-cover transition-transform duration-[1.4s] ease-editorial group-hover:scale-105"
                        />
                      </div>
                      <p className="mt-4 font-display text-lg text-rust italic">{c.numeral}</p>
                      <p className="font-display text-2xl leading-tight font-light sm:text-3xl">{c.name}</p>
                      <p className="mt-1 text-xs leading-snug text-stone">{c.when}</p>
                    </Link>
                  </Reveal>
                </li>
              )
            })}
          </ol>
        </nav>
      </div>
    </section>
  )
}
