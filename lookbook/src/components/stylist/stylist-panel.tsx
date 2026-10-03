"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { AnimatePresence, m } from "framer-motion"
import { ArrowUp, ArrowUpRight, Camera, Download, ImagePlus, RotateCcw, UserRound, X } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Logo } from "@/components/brand/logo"
import { cn } from "@/lib/utils"
import { photoToDataUrl } from "@/lib/stylist/photo"
import type { ChatReply, HistoryTurn, StylistEvent, StylistProduct } from "@/lib/stylist/types"
import type { Intent } from "@/lib/stylist/intent"
import { clearTryOns, loadTryOn, saveTryOn } from "@/lib/stylist/try-on-store"
import { OCCASIONS, type Occasion } from "@/lib/stylist/vocab"
import { useOverlays } from "@/store/lookbook"
import { StylistCard } from "./stylist-card"
import { TraceView } from "./trace-view"
import { TryOnDialog } from "./try-on-dialog"

type Message =
  | { id: number; role: "user"; text: string; photo?: string }
  | { id: number; role: "stylist"; reply: ChatReply; streaming?: boolean }
  | { id: number; role: "stylist"; error: string }
  // A finished try-on; the image itself lives in IndexedDB under `key`.
  | { id: number; role: "stylist"; tryOn: { key: string; handle: string; title: string; url: string } }

// Omit that keeps a union a union.
type NewMessage = Message extends infer M ? (M extends unknown ? Omit<M, "id"> : never) : never

const CHIPS: Occasion[] = ["festive", "sangeet", "wedding", "workwear", "casual"]
const STARTERS = [
  "A red silk saree",
  "Light festive outfit for a day wedding, under ₹15k",
  "Something sage green",
  "I want to look expensive but feel comfortable",
]
const MAX = 350

// The session's memory, kept in sessionStorage: the conversation survives closing the
// panel or reloading the page, and ends with the tab. Photos and traces aren't stored.
const SESSION_KEY = "suta-stylist-session-v1"
interface Session {
  messages: Message[]
  context: { intent: Intent | null; handles: string[] }
  history: HistoryTurn[]
  seen: string[]
  occasion: Occasion | null
}

function loadSession(): Session | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

function saveSession(s: Session) {
  try {
    const messages = s.messages.slice(-40).map((m) => {
      if (m.role === "user") return { ...m, photo: undefined }
      if ("reply" in m) return { ...m, streaming: false, reply: { ...m.reply, trace: undefined } }
      return m
    })
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, messages }))
  } catch {
    // storage full or blocked: the conversation still works, it just won't survive a reload
  }
}

export function StylistPanel() {
  const open = useOverlays((s) => s.stylist)
  const setOpen = useOverlays((s) => s.setStylist)
  const [restored] = useState(loadSession)
  const [messages, setMessages] = useState<Message[]>(restored?.messages ?? [])
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [occasion, setOccasion] = useState<Occasion | null>(restored?.occasion ?? null)
  const [context, setContext] = useState<{ intent: Intent | null; handles: string[] }>(restored?.context ?? { intent: null, handles: [] })
  // What the stylist remembers of the conversation (sent back each turn, last 6 kept).
  const [history, setHistory] = useState<HistoryTurn[]>(restored?.history ?? [])
  // Every piece shown this session, so "something else" never repeats them.
  const [seen, setSeen] = useState<string[]>(restored?.seen ?? [])
  const [portrait, setPortrait] = useState<string | null>(null)
  const [trying, setTrying] = useState<StylistProduct | null>(null)
  const [photoMenu, setPhotoMenu] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const searchFile = useRef<HTMLInputElement>(null)
  const portraitFile = useRef<HTMLInputElement>(null)
  const nextId = useRef(Math.max(0, ...(restored?.messages ?? []).map((m) => m.id)) + 1)

  // Save after every settled turn (not on each streamed word).
  useEffect(() => {
    if (!busy && !messages.some((m) => "streaming" in m && m.streaming)) {
      saveSession({ messages, context, history, seen, occasion })
    }
  }, [messages, context, history, seen, occasion, busy])

  const reset = () => {
    setMessages([])
    setContext({ intent: null, handles: [] })
    setHistory([])
    setSeen([])
    setOccasion(null)
    try {
      window.sessionStorage.removeItem(SESSION_KEY)
    } catch {}
    void clearTryOns()
  }

  // Keep each finished try-on in the chat (once), with its image saved in this browser.
  const keepTryOn = (key: string, piece: StylistProduct, image: string) => {
    void saveTryOn({ id: key, handle: piece.handle, title: piece.title, url: piece.url, image, createdAt: Date.now() })
    setMessages((xs) =>
      xs.some((x) => "tryOn" in x && x.tryOn.key === key)
        ? xs
        : [...xs, { id: nextId.current++, role: "stylist", tryOn: { key, handle: piece.handle, title: piece.title, url: piece.url } }],
    )
  }

  // The composer grows with what's typed, up to a limit, then scrolls.
  const input = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [draft])

  // Wake the database the moment the panel opens, before the first question.
  useEffect(() => {
    if (open) void fetch("/api/stylist/chat").catch(() => {})
  }, [open])

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" })
  }, [messages, busy])

  const push = (msg: NewMessage) => {
    const id = nextId.current++
    setMessages((xs) => [...xs, { ...msg, id } as Message])
    return id
  }
  const patch = (id: number, fn: (reply: ChatReply) => ChatReply, streaming = true) =>
    setMessages((xs) => xs.map((m) => (m.id === id && "reply" in m ? { ...m, reply: fn(m.reply), streaming } : m)))

  const send = async (text: string, image?: string) => {
    const message = text.trim().slice(0, MAX)
    if ((!message && !image) || busy) return
    push({ role: "user", text: message || "Find pieces like this photo", photo: image })
    setDraft("")
    setBusy(true)
    let id: number | null = null
    let said = ""
    let shown: string[] = []
    try {
      const ask = () =>
        fetch("/api/stylist/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, image, occasion, context, history, seen, stream: true }),
        })
      // One quiet retry when the server hiccups (a dropped database connection, say).
      let res = await ask()
      if (res.status >= 500) res = await ask()
      if (!res.ok || !res.body) {
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(json.error ?? "Something went quiet on our side. Please try again.")
      }
      // Cards arrive first, then the reply as it is written, sentence by sentence.
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let nl
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const ev = JSON.parse(buffer.slice(0, nl)) as StylistEvent
          buffer = buffer.slice(nl + 1)
          if (ev.type === "meta") {
            const { type, ...meta } = ev
            void type
            if (meta.edit) setOccasion(meta.edit)
            setContext(meta.context)
            shown = meta.products.map((p) => p.title)
            setSeen((s) => [...new Set([...s, ...meta.products.map((p) => p.handle)])].slice(-300))
            setBusy(false)
            id = push({ role: "stylist", reply: { ...meta, reply: "", ms: 0 }, streaming: true })
          } else if (ev.type === "delta" && id !== null) {
            said += ev.text
            const text = said
            patch(id, (r) => ({ ...r, reply: text }))
          } else if (ev.type === "replace" && id !== null) {
            said = ev.text
            patch(id, (r) => ({ ...r, reply: ev.text }))
          } else if (ev.type === "done" && id !== null) {
            patch(id, (r) => ({ ...r, ms: ev.ms, trace: ev.trace }), false)
          } else if (ev.type === "error") {
            throw new Error(ev.error)
          }
        }
      }
      setHistory((h) =>
        [
          ...h,
          { role: "shopper" as const, text: message || "[shared a photo]" },
          { role: "stylist" as const, text: `${said}${shown.length ? ` (Showed: ${shown.join(", ")})` : ""}`.slice(0, 400) },
        ].slice(-6),
      )
    } catch (err) {
      if (id !== null) patch(id, (r) => r, false)
      push({ role: "stylist", error: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const pickSearchPhoto = async (file: File | undefined) => {
    if (!file) return
    try {
      await send(draft, await photoToDataUrl(file, 768))
    } catch (err) {
      push({ role: "stylist", error: (err as Error).message })
    }
  }

  const pickPortrait = async (file: File | undefined) => {
    if (!file) return
    try {
      setPortrait(await photoToDataUrl(file, 1024))
    } catch (err) {
      push({ role: "stylist", error: (err as Error).message })
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="flex w-full flex-col gap-0 border-none bg-ecru p-0 sm:max-w-none md:w-[min(56rem,max(50vw,40rem))]"
          data-lenis-prevent
        >
          {/* Header */}
          <div className="flex items-center justify-between bg-ink px-5 py-4 text-ecru">
            <div className="flex items-center gap-3">
              <Logo className="h-8 text-ecru" />
              <div>
                <SheetTitle className="font-display text-2xl leading-none font-normal text-ecru">The Stylist</SheetTitle>
                <SheetDescription className="eyebrow mt-1.5 text-[0.55rem] text-ecru/60">From Suta&rsquo;s own looms</SheetDescription>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={reset}
                  className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs text-ecru/75 transition-colors hover:bg-ecru/10 hover:text-ecru"
                  title="Start a new conversation"
                  aria-label="Start a new conversation"
                >
                  <RotateCcw className="size-3.5" strokeWidth={1.5} /> <span className="hidden whitespace-nowrap sm:inline">New chat</span>
                </button>
              )}
              <button onClick={() => setOpen(false)} className="flex size-10 items-center justify-center rounded-full hover:bg-ecru/10" aria-label="Close the stylist">
                <X className="size-5" strokeWidth={1.5} />
              </button>
            </div>
          </div>

          {/* Occasion edit: the curveball filter */}
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-b border-border px-5 py-3" role="group" aria-label="Occasion edit">
            {CHIPS.map((key) => (
              <button
                key={key}
                onClick={() => setOccasion(occasion === key ? null : key)}
                aria-pressed={occasion === key}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-2 text-sm transition-colors",
                  occasion === key ? "border-rust bg-rust text-ecru" : "border-charcoal/20 hover:border-charcoal/50",
                )}
              >
                {OCCASIONS[key].label}
              </button>
            ))}
          </div>

          {/* Conversation */}
          <div ref={scroller} className="flex-1 overflow-y-auto px-5 py-6 sm:px-8" aria-live="polite">
            {messages.length === 0 && (
              <div>
                <p className="font-display text-4xl leading-tight font-light">
                  Namaste. Where are you <em>going</em>, and what would you like to feel in it?
                </p>
                <p className="mt-3 text-base leading-relaxed text-stone">
                  Ask for a colour, a fabric, an occasion or a budget, or share a photo of something you love.
                </p>
                <div className="mt-6 flex flex-col gap-2">
                  {STARTERS.map((s) => (
                    <button key={s} onClick={() => void send(s)} className="border border-charcoal/15 px-4 py-3 text-left text-base transition-colors hover:border-charcoal/40 hover:bg-kora">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <m.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className={cn("mb-6", msg.role === "user" && "flex flex-col items-end")}
                >
                  {msg.role === "user" ? (
                    <>
                      {msg.photo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={msg.photo} alt="Your photo" className="mb-2 max-h-40 w-auto rounded-sm object-cover" />
                      )}
                      <p className="max-w-[80%] bg-charcoal px-4 py-3 text-base text-ecru">{msg.text}</p>
                    </>
                  ) : "error" in msg ? (
                    <p className="border-l-2 border-rust pl-3 text-base text-rust">{msg.error}</p>
                  ) : "tryOn" in msg ? (
                    <TryOnMessage tryOn={msg.tryOn} />
                  ) : (
                    <StylistMessage reply={msg.reply} streaming={Boolean(msg.streaming)} onTryOn={setTrying} onSuggest={(m) => void send(m)} />
                  )}
                </m.div>
              ))}
            </AnimatePresence>

            {busy && (
              <div className="flex items-center gap-2 text-stone" aria-label="The stylist is looking">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-1.5 animate-bounce rounded-full bg-rust" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
                <span className="ml-1 font-display text-sm italic">Looking through the looms…</span>
              </div>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void send(draft)
            }}
            className="relative border-t border-border bg-ecru px-4 pt-3 sm:px-8 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            {portrait && (
              <div className="mb-2 flex items-center gap-2 text-xs text-stone">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={portrait} alt="" className="size-7 rounded-full object-cover" />
                Your portrait is ready for try-ons.
                <button type="button" onClick={() => setPortrait(null)} className="underline">
                  Remove
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPhotoMenu((v) => !v)}
                  aria-expanded={photoMenu}
                  aria-label="Add a photo"
                  className="flex size-11 items-center justify-center rounded-full border border-charcoal/20 transition-colors hover:bg-kora"
                >
                  <ImagePlus className="size-[18px]" strokeWidth={1.5} />
                </button>
                <AnimatePresence>
                  {photoMenu && (
                    <m.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      className="absolute bottom-14 left-0 z-10 w-60 bg-ecru text-sm shadow-[0_12px_40px_-10px_rgba(0,0,0,0.35)]"
                    >
                      <button type="button" onClick={() => (setPhotoMenu(false), searchFile.current?.click())} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-kora">
                        <Camera className="size-4" strokeWidth={1.5} /> Find pieces like a photo
                      </button>
                      <button type="button" onClick={() => (setPhotoMenu(false), portraitFile.current?.click())} className="flex w-full items-center gap-3 border-t border-border px-4 py-3 text-left hover:bg-kora">
                        <UserRound className="size-4" strokeWidth={1.5} /> My portrait, for try-ons
                      </button>
                    </m.div>
                  )}
                </AnimatePresence>
              </div>
              <label className="sr-only" htmlFor="stylist-input">
                Ask the stylist
              </label>
              <textarea
                ref={input}
                id="stylist-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, MAX))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    void send(draft)
                  }
                }}
                rows={2}
                maxLength={MAX}
                placeholder="A sangeet look in green, under ₹8,000…"
                className="max-h-[200px] min-h-[4.25rem] flex-1 resize-none overflow-y-auto border border-charcoal/20 bg-white/60 px-4 py-3 text-base leading-relaxed outline-none placeholder:text-stone/70 focus:border-charcoal/50"
              />
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                aria-label="Send"
                className="flex size-11 items-center justify-center rounded-full bg-charcoal text-ecru transition-colors hover:bg-rust disabled:opacity-35"
              >
                <ArrowUp className="size-[18px]" strokeWidth={1.5} />
              </button>
            </div>
            {draft.length > MAX - 60 && <p className="mt-1 text-right text-[0.65rem] text-stone tabular-nums">{MAX - draft.length} left</p>}
            <input ref={searchFile} type="file" accept="image/*" className="hidden" onChange={(e) => (void pickSearchPhoto(e.target.files?.[0]), (e.target.value = ""))} />
            <input ref={portraitFile} type="file" accept="image/*" className="hidden" onChange={(e) => (void pickPortrait(e.target.files?.[0]), (e.target.value = ""))} />
          </form>
        </SheetContent>
      </Sheet>

      <TryOnDialog product={trying} portrait={portrait} onPortrait={setPortrait} onResult={keepTryOn} onClose={() => setTrying(null)} />
    </>
  )
}

function StylistMessage({
  reply,
  streaming,
  onTryOn,
  onSuggest,
}: {
  reply: ChatReply
  streaming: boolean
  onTryOn: (p: StylistProduct) => void
  onSuggest: (message: string) => void
}) {
  return (
    <div>
      <div className="flex gap-2.5">
        <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-ink">
          <Image src="/brand/suta-logo.png" alt="" width={16} height={11} unoptimized className="invert" />
        </span>
        <p className="font-display text-[1.4rem] leading-snug text-charcoal">
          {reply.reply}
          {streaming && (
            <span
              aria-hidden
              className={cn("ml-0.5 inline-block h-[1em] w-[2px] translate-y-[3px] animate-pulse bg-rust", !reply.reply && "ml-0")}
            />
          )}
          {streaming && !reply.reply && <span className="ml-2 text-sm text-stone italic">thinking it through…</span>}
        </p>
      </div>
      {reply.products.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {reply.products.map((p) => (
            <StylistCard key={p.handle} product={p} onTryOn={onTryOn} />
          ))}
        </div>
      )}
      {reply.suggestions && reply.suggestions.length > 0 && (
        <div className="mt-4 ml-8">
          <p className="eyebrow text-[0.62rem] text-stone">{reply.products.length ? "Or, from what we do have" : "What we do have"}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {reply.suggestions.map((s) => (
              <button
                key={s.message}
                onClick={() => onSuggest(s.message)}
                className="rounded-full border border-rust/40 px-3.5 py-2 text-left text-sm text-rust transition-colors hover:bg-rust hover:text-ecru"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {!streaming && reply.quickReplies && reply.quickReplies.length > 0 && (
        <m.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="mt-3 ml-8 flex flex-wrap gap-1.5"
        >
          {reply.quickReplies.map((q) => (
            <button
              key={q}
              onClick={() => onSuggest(q)}
              className="rounded-full border border-charcoal/20 bg-white/50 px-3.5 py-2 text-sm transition-colors hover:border-charcoal/50 hover:bg-kora"
            >
              {q}
            </button>
          ))}
        </m.div>
      )}
      {reply.trace && <TraceView trace={reply.trace} />}
    </div>
  )
}

/** A saved try-on in the chat: the image from this browser's storage, ready to download. */
function TryOnMessage({ tryOn }: { tryOn: { key: string; handle: string; title: string; url: string } }) {
  const [image, setImage] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    void loadTryOn(tryOn.key).then((t) => live && setImage(t?.image ?? null))
    return () => {
      live = false
    }
  }, [tryOn.key])

  return (
    <div className="flex gap-4">
      <span className="mt-1 size-2 shrink-0 rounded-full bg-haldi" aria-hidden />
      <div className="min-w-0">
        <p className="eyebrow text-[0.62rem] text-rust">Your try-on</p>
        <p className="mt-1 font-display text-2xl leading-tight">{tryOn.title}</p>
        {image ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt={`You, wearing ${tryOn.title}`} className="mt-3 aspect-[3/4] w-64 max-w-full bg-sand object-cover" />
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <a
                href={image}
                download={`suta-${tryOn.handle}-try-on.png`}
                className="inline-flex items-center gap-1.5 bg-charcoal px-4 py-2 text-ecru transition-colors hover:bg-rust"
              >
                <Download className="size-3.5" strokeWidth={1.5} /> Download
              </a>
              <a
                href={tryOn.url}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1.5 border border-charcoal/20 px-4 py-2 transition-colors hover:bg-kora"
              >
                Shop this look <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
              </a>
            </div>
          </>
        ) : image === null ? (
          <p className="mt-2 text-sm text-stone">This image is no longer stored in this browser.</p>
        ) : (
          <div className="mt-3 aspect-[3/4] w-64 max-w-full animate-pulse bg-sand" />
        )}
      </div>
    </div>
  )
}
