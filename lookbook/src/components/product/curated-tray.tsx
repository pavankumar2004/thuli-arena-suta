"use client"

import Image from "next/image"
import { ArrowUpRight, X } from "lucide-react"
import { formatPrice, imageOf, kind, lookById, pad, piecesOf, products } from "@/lib/lookbook"
import { useOverlays, useSaved } from "@/store/lookbook"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Price } from "./price"

/** "Your almanac": the looks and pieces the visitor has bookmarked. */
export function CuratedTray() {
  const open = useOverlays((s) => s.tray)
  const setTray = useOverlays((s) => s.setTray)
  const openLook = useOverlays((s) => s.openLook)
  const { looks: savedLooks, pieces: savedPieces, toggleLook, togglePiece, clear } = useSaved()

  const lookList = savedLooks.map(lookById).filter((l) => l !== undefined)
  const pieceList = savedPieces.map((h) => products[h]).filter(Boolean)
  // Everything to buy: saved pieces plus every piece of each saved look, once each.
  const all = [...new Map([...pieceList, ...lookList.flatMap(piecesOf)].map((p) => [p.handle, p])).values()]
  const total = all.reduce((sum, p) => sum + p.price, 0)
  const empty = lookList.length + pieceList.length === 0

  return (
    <Sheet open={open} onOpenChange={setTray}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 border-none bg-ecru p-0 sm:max-w-md" data-lenis-prevent>
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-6">
          <SheetTitle className="font-display text-2xl font-light">Your almanac</SheetTitle>
          <button onClick={() => setTray(false)} className="flex size-10 items-center justify-center rounded-full hover:bg-kora" aria-label="Close">
            <X className="size-5" strokeWidth={1.5} />
          </button>
        </div>
        <SheetDescription className="sr-only">Looks and pieces you have saved</SheetDescription>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {empty ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <p className="font-display text-3xl font-light italic">Nothing kept yet.</p>
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-stone">
                Tap the bookmark on any look or piece and it will wait for you here, for as long as this browser
                remembers.
              </p>
            </div>
          ) : (
            <>
              {lookList.length > 0 && (
                <section>
                  <h3 className="eyebrow text-stone">Looks</h3>
                  <ul className="mt-4 space-y-4">
                    {lookList.map((l) => (
                      <li key={l.id} className="flex items-center gap-4">
                        <button
                          onClick={() => {
                            setTray(false)
                            openLook(l.id)
                          }}
                          className="group flex min-w-0 flex-1 items-center gap-4 text-left"
                        >
                          <span className="relative block aspect-[3/4] w-16 shrink-0 overflow-hidden bg-sand">
                            <Image src={imageOf(l.image)} alt="" fill sizes="64px" className="object-cover" />
                          </span>
                          <span className="min-w-0">
                            <span className="eyebrow block text-[0.58rem] text-stone">
                              Look {pad(l.number)} · {l.chapter.name}
                            </span>
                            <span className="mt-1 block truncate font-display text-xl group-hover:underline">{l.title}</span>
                            <span className="text-xs text-stone">{piecesOf(l).map((p) => p.title).join(" + ")}</span>
                          </span>
                        </button>
                        <button onClick={() => toggleLook(l.id)} className="text-xs text-stone underline-offset-4 hover:underline" aria-label={`Remove ${l.title}`}>
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {pieceList.length > 0 && (
                <section className={lookList.length ? "mt-10" : ""}>
                  <h3 className="eyebrow text-stone">Pieces</h3>
                  <ul className="mt-4 space-y-4">
                    {pieceList.map((p) => (
                      <li key={p.handle} className="flex items-center gap-4">
                        <span className="relative block aspect-[3/4] w-16 shrink-0 overflow-hidden bg-sand">
                          <Image src={p.images[0]} alt="" fill sizes="64px" className="object-cover" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="eyebrow text-[0.58rem] text-stone">{kind(p)}</p>
                          <a href={p.url} target="_blank" rel="noopener" className="mt-1 flex items-center gap-1 font-display text-xl hover:underline">
                            <span className="truncate">{p.title}</span>
                            <ArrowUpRight className="size-3.5 shrink-0" strokeWidth={1.5} />
                          </a>
                          <Price product={p} className="text-sm" />
                        </div>
                        <button onClick={() => togglePiece(p.handle)} className="text-xs text-stone underline-offset-4 hover:underline" aria-label={`Remove ${p.title}`}>
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>

        {!empty && (
          <div className="shrink-0 border-t border-border px-6 py-5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-stone">
                {all.length} {all.length === 1 ? "piece" : "pieces"}
              </span>
              <span className="font-display text-3xl tabular-nums">{formatPrice(total)}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-stone">
              Each piece opens on suta.in, where you can choose your size and buy it.
            </p>
            <button onClick={clear} className="mt-4 text-xs text-stone underline underline-offset-4">
              Clear everything
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
