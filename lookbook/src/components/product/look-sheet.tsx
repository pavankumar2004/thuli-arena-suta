"use client"

import Image from "next/image"
import { ArrowLeft, ArrowRight, ArrowUpRight, X } from "lucide-react"
import { formatPrice, kind, lookById, looks, lookTotal, pad, piecesOf } from "@/lib/lookbook"
import { detail } from "@/lib/details"
import { useOverlays } from "@/store/lookbook"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { FabricZoom } from "./fabric-zoom"
import { Price } from "./price"
import { SaveButton } from "./save-button"

/** The story drawer: one look as an editorial spread, with every piece ready to shop. */
export function LookSheet() {
  const id = useOverlays((s) => s.look)
  const openLook = useOverlays((s) => s.openLook)
  const openPiece = useOverlays((s) => s.openPiece)
  const look = id ? lookById(id) : null

  return (
    <Sheet open={Boolean(look)} onOpenChange={(open) => !open && openLook(null)}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full gap-0 overflow-y-auto border-none bg-ecru p-0 sm:max-w-[min(1040px,94vw)]"
        data-lenis-prevent
      >
        {look && <Spread key={look.id} id={look.id} onPiece={openPiece} onLook={openLook} />}
      </SheetContent>
    </Sheet>
  )
}

function Spread({ id, onPiece, onLook }: { id: string; onPiece: (h: string) => void; onLook: (id: string | null) => void }) {
  const look = lookById(id)!
  const hero = detail(look.image.product)
  const pieces = piecesOf(look).map((p) => detail(p.handle))
  const prev = looks[(look.number - 2 + looks.length) % looks.length]
  const next = looks[look.number % looks.length]
  // The look's photograph first (ours if we shot one), then the hero product's own gallery.
  const gallery = look.image.src
    ? [look.image.src, ...hero.images]
    : [hero.images[look.image.index], ...hero.images.filter((_, i) => i !== look.image.index)]
  const label = (hero.story || hero.description).split("\n").slice(0, 2).join("\n")

  return (
    <article>
      <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-ecru/95 px-4 backdrop-blur sm:px-6">
        <p className="eyebrow text-[0.62rem] text-stone">
          Chapter {look.chapter.numeral} · {look.chapter.name}
          <span className="ml-3 text-charcoal">
            {pad(look.number)} / {looks.length}
          </span>
        </p>
        <div className="flex items-center gap-1">
          <button onClick={() => onLook(prev.id)} className="flex size-10 items-center justify-center rounded-full hover:bg-kora" aria-label={`Previous look: ${prev.title}`}>
            <ArrowLeft className="size-4" strokeWidth={1.5} />
          </button>
          <button onClick={() => onLook(next.id)} className="flex size-10 items-center justify-center rounded-full hover:bg-kora" aria-label={`Next look: ${next.title}`}>
            <ArrowRight className="size-4" strokeWidth={1.5} />
          </button>
          <button onClick={() => onLook(null)} className="ml-1 flex size-10 items-center justify-center rounded-full hover:bg-kora" aria-label="Close">
            <X className="size-5" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="p-4 sm:p-6 md:sticky md:top-14 md:self-start">
          {/* On phones the title leads, so the sheet doesn't open on a wall of photograph. */}
          <p aria-hidden className="display mb-4 px-1 text-[2.6rem] font-light md:hidden">
            {look.title}
          </p>
          <FabricZoom images={gallery} alt={`${look.title}: ${hero.title}`} sizes="(min-width: 768px) 500px, 100vw" />
        </div>

        <div className="px-5 pt-4 pb-12 sm:px-8 md:pt-10">
          <SheetTitle className="display sr-only text-[clamp(2.8rem,6vw,4.5rem)] font-light md:not-sr-only">{look.title}</SheetTitle>
          <SheetDescription className="text-base md:mt-5 leading-relaxed text-charcoal/80">{look.blurb}</SheetDescription>

          {label && (
            <blockquote className="mt-8 border-l border-rust/50 pl-5">
              <p className="font-display text-xl leading-snug whitespace-pre-line text-charcoal/85 italic">{label}</p>
              <footer className="eyebrow mt-4 text-[0.58rem] text-stone">From the Suta label · {hero.title}</footer>
            </blockquote>
          )}

          <section className="mt-10">
            <h3 className="eyebrow text-rust">How to wear it</h3>
            <p className="mt-3 text-[0.94rem] leading-relaxed text-charcoal/80">{look.chapter.drape}</p>
          </section>

          <section className="mt-10">
            <h3 className="eyebrow text-stone">In this look</h3>
            <ul className="mt-4 divide-y divide-border border-y border-border">
              {pieces.map((p) => (
                <li key={p.handle} className="flex gap-4 py-4">
                  <button onClick={() => onPiece(p.handle)} className="relative aspect-[3/4] w-20 shrink-0 overflow-hidden bg-sand" aria-label={`Details of ${p.title}`}>
                    <Image src={p.images[0]} alt="" fill sizes="80px" className="object-cover transition-transform duration-700 hover:scale-105" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="eyebrow text-[0.58rem] text-stone">{kind(p)}</p>
                    <button onClick={() => onPiece(p.handle)} className="mt-1 text-left font-display text-2xl leading-tight hover:underline">
                      {p.title}
                    </button>
                    <p className="mt-0.5 text-xs text-stone">
                      {[p.fabric, p.sizesInStock.length && p.sizes[0] !== "Free Size" ? `In stock: ${p.sizesInStock.join(", ")}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <Price product={p} className="mt-2 text-sm" />
                    <div className="mt-2 flex items-center gap-1 text-xs">
                      <button onClick={() => onPiece(p.handle)} className="rounded-full px-2 py-1.5 hover:bg-kora">
                        Details
                      </button>
                      <SaveButton kind="piece" id={p.handle} label={p.title} withText className="px-2 py-1.5" />
                      <a href={p.url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 rounded-full px-2 py-1.5 hover:bg-kora">
                        suta.in <ArrowUpRight className="size-3" strokeWidth={1.5} />
                      </a>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm">
                <span className="text-stone">The complete look</span>{" "}
                <span className="font-display text-2xl tabular-nums">{formatPrice(lookTotal(look))}</span>
              </p>
              <SaveButton kind="look" id={look.id} label={look.title} withText className="border border-charcoal/20 py-2.5" />
            </div>
          </section>

          <nav className="mt-14 grid grid-cols-2 gap-4 border-t border-border pt-6" aria-label="More looks">
            {[prev, next].map((l, i) => (
              <button key={l.id} onClick={() => onLook(l.id)} className={`group text-left ${i ? "text-right" : ""}`}>
                <span className="eyebrow text-[0.58rem] text-stone">{i ? "Next" : "Previous"}</span>
                <span className="mt-2 block font-display text-xl leading-tight group-hover:underline">{l.title}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>
    </article>
  )
}
