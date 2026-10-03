"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { ArrowUpRight, Download, ImagePlus, RotateCcw, X } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { formatPrice } from "@/lib/format"
import { photoToDataUrl } from "@/lib/stylist/photo"
import type { StylistProduct, TryOnReply } from "@/lib/stylist/types"

type State = { stage: "idle" } | { stage: "need-photo" } | { stage: "working" } | { stage: "done"; image: string } | { stage: "error"; message: string }

const STEPS = ["Reading your photo", "Studying the weave", "Pleating the drape", "Setting the light"]

/**
 * The virtual fitting room. Generates exactly one try-on, for the one piece the shopper
 * chose, then shows it beside their own photo with a draggable before/after divider.
 */
export function TryOnDialog({
  product,
  portrait,
  onPortrait,
  onClose,
}: {
  product: StylistProduct | null
  portrait: string | null
  onPortrait: (dataUrl: string) => void
  onClose: () => void
}) {
  const [stored, setState] = useState<State>({ stage: "idle" })
  // No portrait yet: ask for one (unless we're showing an error about the last one).
  const state: State = !portrait && stored.stage !== "error" ? { stage: "need-photo" } : stored
  const [split, setSplit] = useState(50)
  const [step, setStep] = useState(0)
  const file = useRef<HTMLInputElement>(null)
  const started = useRef<string | null>(null)

  const run = async (photo: string, piece: StylistProduct) => {
    setState({ stage: "working" })
    setStep(0)
    try {
      const res = await fetch("/api/stylist/tryon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portrait: photo, product: piece.handle }),
      })
      const json = (await res.json()) as Partial<TryOnReply> & { error?: string }
      if (!res.ok || !json.image) throw new Error(json.error ?? "The fitting room is resting. Please try again.")
      setSplit(50)
      setState({ stage: "done", image: json.image })
    } catch (err) {
      setState({ stage: "error", message: (err as Error).message })
    }
  }

  // Start as soon as we have both a piece and a portrait (once per pairing).
  useEffect(() => {
    if (!product) {
      started.current = null
      return
    }
    if (!portrait) return
    const key = `${product.handle}:${portrait.length}`
    if (started.current === key) return
    started.current = key
    void run(portrait, product)
  }, [product, portrait])

  useEffect(() => {
    if (state.stage !== "working") return
    const id = window.setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 6000)
    return () => window.clearInterval(id)
  }, [state.stage])

  const pick = async (f: File | undefined) => {
    if (!f) return
    try {
      onPortrait(await photoToDataUrl(f, 1024))
    } catch (err) {
      setState({ stage: "error", message: (err as Error).message })
    }
  }

  return (
    <Dialog open={Boolean(product)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[94svh] w-[calc(100%-1.5rem)] max-w-3xl overflow-y-auto rounded-none border-none bg-ecru p-0 sm:max-w-3xl"
        data-lenis-prevent
      >
        {product && (
          <div className="grid md:grid-cols-[1.15fr_1fr]">
            <div className="relative aspect-[3/4] overflow-hidden bg-charcoal">
              {state.stage === "done" && portrait ? (
                <Compare before={portrait} after={state.image} split={split} onSplit={setSplit} />
              ) : state.stage === "working" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-ink text-ecru">
                  {portrait && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={portrait} alt="" className="absolute inset-0 size-full object-cover opacity-25 blur-sm" />
                  )}
                  <span className="relative size-14 animate-spin rounded-full border border-ecru/20 border-t-haldi" />
                  <p className="relative font-display text-2xl italic">{STEPS[step]}…</p>
                  <p className="relative eyebrow text-[0.58rem] text-ecru/60">About 20 to 40 seconds</p>
                </div>
              ) : product.image ? (
                <Image src={product.image} alt={product.title} fill sizes="420px" className="object-cover" />
              ) : null}
            </div>

            <div className="relative flex flex-col p-6 sm:p-8">
              <button onClick={onClose} className="absolute top-3 right-3 flex size-10 items-center justify-center rounded-full hover:bg-kora" aria-label="Close">
                <X className="size-5" strokeWidth={1.5} />
              </button>
              <p className="eyebrow text-rust">The fitting room</p>
              <DialogTitle className="mt-3 font-display text-4xl leading-none font-light">{product.title}</DialogTitle>
              <DialogDescription className="mt-3 text-sm text-stone">
                {formatPrice(product.price)}
                {product.fabric && <> · {product.fabric}</>}
              </DialogDescription>

              {state.stage === "need-photo" && (
                <div className="mt-8">
                  <p className="text-[0.95rem] leading-relaxed text-charcoal/80">
                    Upload a clear, front-facing photo of yourself, from head to at least the waist, in good light. We&rsquo;ll drape{" "}
                    {product.title} on you.
                  </p>
                  <button
                    onClick={() => file.current?.click()}
                    className="mt-6 inline-flex items-center gap-2 bg-charcoal px-5 py-3 text-sm text-ecru transition-colors hover:bg-rust"
                  >
                    <ImagePlus className="size-4" strokeWidth={1.5} /> Upload my photo
                  </button>
                  <p className="mt-4 text-xs leading-relaxed text-stone">
                    Your photo is used only to make this one image and is not stored.
                  </p>
                </div>
              )}

              {state.stage === "working" && (
                <p className="mt-8 text-[0.95rem] leading-relaxed text-charcoal/80">
                  Our model is draping {product.title} on you, keeping your face, pose and light as they are.
                </p>
              )}

              {state.stage === "error" && (
                <div className="mt-8">
                  <p className="text-[0.95rem] leading-relaxed text-rust">{state.message}</p>
                  <button
                    onClick={() => (portrait ? ((started.current = null), void run(portrait, product)) : file.current?.click())}
                    className="mt-5 inline-flex items-center gap-2 border border-charcoal/25 px-4 py-2.5 text-sm hover:bg-kora"
                  >
                    <RotateCcw className="size-4" strokeWidth={1.5} /> Try again
                  </button>
                </div>
              )}

              {state.stage === "done" && (
                <div className="mt-8 flex flex-col gap-3">
                  <p className="text-[0.95rem] leading-relaxed text-charcoal/80">
                    Drag the line to compare. A preview made by AI: colours and drape are a guide, the real weave is lovelier.
                  </p>
                  <a
                    href={product.url}
                    target="_blank"
                    rel="noopener"
                    className="mt-2 inline-flex items-center justify-center gap-2 bg-charcoal px-5 py-3.5 text-sm text-ecru transition-colors hover:bg-rust"
                  >
                    Shop this look <ArrowUpRight className="size-4" strokeWidth={1.5} />
                  </a>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <a
                      href={state.image}
                      download={`suta-${product.handle}-try-on.png`}
                      className="flex items-center justify-center gap-1.5 border border-charcoal/20 py-2.5 hover:bg-kora"
                    >
                      <Download className="size-3.5" strokeWidth={1.5} /> Save image
                    </a>
                    <button
                      onClick={() => file.current?.click()}
                      className="flex items-center justify-center gap-1.5 border border-charcoal/20 py-2.5 hover:bg-kora"
                    >
                      <ImagePlus className="size-3.5" strokeWidth={1.5} /> Another photo
                    </button>
                  </div>
                </div>
              )}

              <input
                ref={file}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                className="hidden"
                onChange={(e) => {
                  void pick(e.target.files?.[0])
                  e.target.value = ""
                }}
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Before/after: the try-on over the original photo, revealed up to a draggable line. */
function Compare({ before, after, split, onSplit }: { before: string; after: string; split: number; onSplit: (n: number) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const move = (clientX: number) => {
    const r = box.current!.getBoundingClientRect()
    onSplit(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)))
  }
  return (
    <div
      ref={box}
      className="absolute inset-0 cursor-ew-resize touch-none select-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        move(e.clientX)
      }}
      onPointerMove={(e) => e.buttons && move(e.clientX)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={after} alt="You, wearing the piece" className="absolute inset-0 size-full object-cover" />
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={before} alt="Your photo" className="absolute inset-0 size-full object-cover" />
      </div>
      <div className="absolute inset-y-0 w-px bg-ecru shadow-[0_0_12px_rgba(0,0,0,0.4)]" style={{ left: `${split}%` }}>
        <span className="absolute top-1/2 left-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-ecru text-[0.6rem] text-charcoal shadow">
          ⇆
        </span>
      </div>
      <span className="eyebrow absolute bottom-3 left-3 bg-charcoal/50 px-2 py-1 text-[0.52rem] text-ecru">Before</span>
      <span className="eyebrow absolute right-3 bottom-3 bg-charcoal/50 px-2 py-1 text-[0.52rem] text-ecru">After</span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(split)}
        onChange={(e) => onSplit(Number(e.target.value))}
        aria-label="Compare before and after"
        className="sr-only"
      />
    </div>
  )
}
