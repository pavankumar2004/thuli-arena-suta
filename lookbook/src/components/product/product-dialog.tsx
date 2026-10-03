"use client"

import Image from "next/image"
import { ArrowUpRight, X } from "lucide-react"
import { imageOf, kind, looks } from "@/lib/lookbook"
import { detail } from "@/lib/details"
import { cn } from "@/lib/utils"
import { useOverlays } from "@/store/lookbook"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { FabricZoom } from "./fabric-zoom"
import { Price } from "./price"
import { SaveButton } from "./save-button"

/** Quick view of one piece: gallery with weave zoom, facts from the catalogue, the label's story. */
export function ProductDialog() {
  const handle = useOverlays((s) => s.piece)
  const openPiece = useOverlays((s) => s.openPiece)
  const openLook = useOverlays((s) => s.openLook)
  const p = handle ? detail(handle) : null
  const seenIn = p ? looks.filter((l) => [...l.hotspots.map((h) => h.product), ...(l.extras ?? [])].includes(p.handle)) : []

  const facts = p
    ? ([
        ["Fabric", p.fabric],
        ["Craft", p.technique.join(", ") || null],
        ["Length", p.length],
        ["Blouse piece", p.blousePiece],
        ["Collection", p.collection],
      ].filter(([, v]) => v) as [string, string][])
    : []

  return (
    <Dialog open={Boolean(p)} onOpenChange={(open) => !open && openPiece(null)}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[94svh] w-[calc(100%-1.5rem)] max-w-5xl overflow-y-auto rounded-none border-none bg-ecru p-0 sm:max-w-5xl md:h-[min(820px,92svh)] md:grid-rows-1 md:overflow-hidden"
        data-lenis-prevent
      >
        {p && (
          <div className="grid md:h-full md:grid-cols-2">
            <FabricZoom images={p.images} alt={p.title} sizes="(min-width: 768px) 512px, 100vw" fill className="bg-kora p-3 md:h-full md:min-h-0" />
            <div className="relative flex flex-col p-6 sm:p-10 md:min-h-0 md:overflow-y-auto" data-lenis-prevent>
              <button
                onClick={() => openPiece(null)}
                className="absolute top-4 right-4 flex size-10 items-center justify-center rounded-full hover:bg-kora"
                aria-label="Close"
              >
                <X className="size-5" strokeWidth={1.5} />
              </button>
              <p className="eyebrow text-stone">{kind(p)}</p>
              <DialogTitle className="mt-3 font-display text-5xl leading-none font-light">{p.title}</DialogTitle>
              <DialogDescription asChild>
                <div className="mt-4 text-lg">
                  <Price product={p} />
                </div>
              </DialogDescription>

              <dl className="mt-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 border-t border-border pt-6 text-sm">
                {facts.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-stone">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-6">
                <p className="eyebrow text-[0.6rem] text-stone">
                  {p.sizes.length === 1 && p.sizes[0] === "Free Size" ? "Size" : "Sizes in stock"}
                </p>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {p.sizes.map((s) => {
                    const inStock = p.sizesInStock.includes(s)
                    return (
                      <li
                        key={s}
                        className={cn(
                          "min-w-10 border px-2.5 py-1.5 text-center text-xs",
                          inStock ? "border-charcoal/40" : "border-border text-stone line-through",
                        )}
                        aria-label={`${s}${inStock ? "" : ", sold out"}`}
                      >
                        {s}
                      </li>
                    )
                  })}
                </ul>
                {p.preOrder && <p className="mt-3 text-xs text-stone">{p.preOrder}</p>}
              </div>

              {(p.story || p.description) && (
                <blockquote className="mt-8 border-l border-rust/50 pl-5">
                  <p className="font-display text-xl leading-snug whitespace-pre-line text-charcoal/85 italic">
                    {(p.story || p.description).split("\n").slice(0, 3).join("\n")}
                  </p>
                  <footer className="eyebrow mt-4 text-[0.58rem] text-stone">From the Suta label</footer>
                </blockquote>
              )}

              <div className="mt-10 flex flex-wrap items-center gap-3">
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-2 bg-charcoal px-6 py-3.5 text-sm text-ecru transition-colors hover:bg-rust"
                >
                  {p.available ? "Shop on suta.in" : "See it on suta.in"} <ArrowUpRight className="size-4" strokeWidth={1.5} />
                </a>
                <SaveButton kind="piece" id={p.handle} label={p.title} withText className="border border-charcoal/20 py-3" />
              </div>

              {seenIn.length > 0 && (
                <div className="mt-10 border-t border-border pt-6">
                  <p className="eyebrow text-[0.6rem] text-stone">Seen in</p>
                  <ul className="mt-4 flex flex-wrap gap-4">
                    {seenIn.map((l) => (
                      <li key={l.id}>
                        <button
                          onClick={() => {
                            openPiece(null)
                            openLook(l.id)
                          }}
                          className="group flex items-center gap-3 text-left"
                        >
                          <span className="relative block aspect-[3/4] w-10 overflow-hidden bg-sand">
                            <Image src={imageOf(l.image)} alt="" fill sizes="40px" className="object-cover" />
                          </span>
                          <span className="text-sm">
                            <span className="block font-display text-lg leading-tight group-hover:underline">{l.title}</span>
                            <span className="text-xs text-stone">{l.chapter.name}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
