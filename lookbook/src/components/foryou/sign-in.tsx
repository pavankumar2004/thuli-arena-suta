"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Camera, Check, Loader2 } from "lucide-react"
import { Logo } from "@/components/brand/logo"

type Step = { stage: string; message: string }
type Phase = "intro" | "handle" | "working" | "error"

const SUGGESTIONS = ["balanvidya", "masabagupta", "aliaabhatt", "ranveersingh"]

export function SignIn() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>("intro")
  const [handle, setHandle] = useState("")
  const [steps, setSteps] = useState<Step[]>([])
  const [error, setError] = useState("")

  async function submit(value: string, retry = true) {
    setPhase("working")
    if (retry) setSteps([{ stage: "start", message: "Signing you in" }])
    setError("")
    try {
      const res = await fetch("/api/foryou", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: value }),
      })
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message ?? "Something went wrong. Please try again.")
      }
      // NDJSON: one event per line.
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      for (;;) {
        const { value: chunk, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(chunk, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines.filter(Boolean)) {
          const event = JSON.parse(line)
          if (event.type === "stage") setSteps((s) => [...s, event])
          if (event.type === "error") throw new Error(event.message)
          if (event.type === "done") {
            setSteps((s) => [...s, { stage: "done", message: "Your lookbook is ready" }])
            router.push(`/for/${event.id}`)
            return
          }
        }
      }
      // Cut off (e.g. a function time limit). Finished stages are saved, so one retry resumes fast.
      if (retry) {
        setSteps((s) => [...s, { stage: "resume", message: "Picking up where we left off" }])
        return submit(value, false)
      }
      throw new Error("The connection closed early. Please try again.")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase("error")
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-ecru px-4 py-16 text-charcoal">
      <Logo className="h-12 text-charcoal" />
      <p className="mt-6 text-[11px] uppercase tracking-[0.3em] text-stone">Made for you</p>
      <h1 className="mt-3 max-w-md text-center font-display text-4xl leading-tight sm:text-5xl">
        Three looks, styled from your own posts
      </h1>

      <div className="mt-10 w-full max-w-sm border border-border bg-kora/60 p-6">
        {phase === "intro" && (
          <>
            <button
              onClick={() => setPhase("handle")}
              className="flex w-full items-center justify-center gap-3 bg-charcoal px-5 py-3.5 text-sm text-ecru transition hover:bg-ink"
            >
              <Camera className="size-4" strokeWidth={1.5} /> Sign in with Instagram
            </button>
            <p className="mt-4 text-center text-xs leading-relaxed text-stone">
              A demo sign-in: we only read your public posts. No password, no access to your account.
            </p>
          </>
        )}

        {(phase === "handle" || phase === "error") && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (handle.trim()) submit(handle)
            }}
          >
            <label htmlFor="handle" className="text-xs uppercase tracking-[0.2em] text-stone">
              Your Instagram handle
            </label>
            <div className="mt-2 flex border border-border bg-ecru focus-within:border-charcoal">
              <span className="px-3 py-3 text-stone">@</span>
              <input
                id="handle"
                autoFocus
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="public.handle"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={60}
                className="w-full bg-transparent py-3 pr-3 outline-none"
              />
            </div>
            {error && <p role="alert" className="mt-3 text-sm text-rust">{error}</p>}
            <button
              type="submit"
              disabled={!handle.trim()}
              className="mt-4 w-full bg-charcoal px-5 py-3.5 text-sm text-ecru transition hover:bg-ink disabled:opacity-40"
            >
              Continue
            </button>
            <p className="mt-4 text-xs text-stone">
              Try:{" "}
              {SUGGESTIONS.map((s, i) => (
                <span key={s}>
                  <button type="button" onClick={() => setHandle(s)} className="underline underline-offset-2 hover:text-charcoal">
                    @{s}
                  </button>
                  {i < SUGGESTIONS.length - 1 ? " · " : ""}
                </span>
              ))}
            </p>
          </form>
        )}

        {phase === "working" && (
          <ol aria-live="polite" className="space-y-3 text-sm">
            {steps.map((s, i) => {
              const current = i === steps.length - 1 && s.stage !== "done"
              return (
                <li key={i} className={current ? "flex items-center gap-3" : "flex items-center gap-3 text-stone"}>
                  {current ? (
                    <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
                  ) : (
                    <Check className="size-4" strokeWidth={1.5} />
                  )}
                  {s.message}
                </li>
              )
            })}
          </ol>
        )}
      </div>
      <p className="mt-6 max-w-sm text-center text-xs text-stone">
        Every piece we suggest is a real Suta product, in stock today.
      </p>
    </main>
  )
}
