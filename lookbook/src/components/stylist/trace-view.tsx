"use client"

import type { ChatReply } from "@/lib/stylist/types"

type Step = NonNullable<ChatReply["trace"]>[number]

const pretty = (x: unknown) => (typeof x === "string" ? x : JSON.stringify(x, null, 2))

const LABEL: Record<string, string> = {
  rules: "Rule parser (no model, instant)",
  planner: "1 · Planner: model reads the turn",
  plan: "Merged plan (planner + rules)",
  fetch: "2 · Fetch",
  sql: "Neon query",
  photo: "Photo model",
  writer: "3 · Writer: model writes the reply",
}

const isModel = (t: Step) => Boolean(t.detail && typeof t.detail === "object" && "prompt" in (t.detail as object))

/**
 * Development only: how the stylist reached this reply. The parsed request, every Neon
 * query (with its parameters and row count) and every prompt sent to a model, in order.
 */
export function TraceView({ trace }: { trace: Step[] }) {
  const llm = trace.filter(isModel)
  return (
    <details className="mt-3 ml-8 text-xs">
      <summary className="eyebrow cursor-pointer text-[0.55rem] text-stone select-none hover:text-charcoal">
        Behind this reply · {trace.filter((t) => t.step === "sql").length} queries · {llm.length} model {llm.length === 1 ? "call" : "calls"}
      </summary>
      <ol className="mt-3 space-y-3 border-l border-border pl-3">
        {!llm.length && (
          <li className="text-stone">No prompt was sent to a model: this reply was written from the database rows by code.</li>
        )}
        {trace.map((t, i) => (
          <li key={i}>
            <p className="eyebrow text-[0.52rem] text-rust">
              {LABEL[t.step] ?? t.step}
              {t.ms !== undefined && <span className="ml-2 text-stone">{t.ms}ms</span>}
            </p>
            {isModel(t) ? <LlmStep detail={t.detail as LlmDetail} /> : <Code>{pretty(t.detail)}</Code>}
          </li>
        ))}
      </ol>
    </details>
  )
}

type LlmDetail = { model: string; prompt: { role: string; content: unknown }[]; reply?: unknown; error?: string; outcome?: string }

function LlmStep({ detail }: { detail: LlmDetail }) {
  return (
    <div className="mt-1 space-y-1.5">
      <p className="text-stone">{detail.model}</p>
      {detail.prompt.map((m, i) => (
        <div key={i}>
          <p className="font-medium text-charcoal">{m.role}</p>
          <Code>{pretty(m.content)}</Code>
        </div>
      ))}
      <p className="font-medium text-charcoal">reply</p>
      <Code>{detail.error ? `error: ${detail.error}` : pretty(detail.reply)}</Code>
      {detail.outcome && detail.outcome !== "ok" && <p className="text-rust">Grounding check: {detail.outcome}; the safe line was used.</p>}
    </div>
  )
}

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-1 max-h-56 overflow-auto bg-kora p-2 text-[0.65rem] leading-relaxed break-words whitespace-pre-wrap text-charcoal/80">
      {children}
    </pre>
  )
}
