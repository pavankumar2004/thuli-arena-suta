import "server-only"

import { AsyncLocalStorage } from "node:async_hooks"

// A per-request record of how the stylist reached its answer: the parsed request, each
// database query, and every prompt sent to a model (with what came back). Shown under
// each reply in development ("Behind this reply") and never sent in production.

export interface TraceStep {
  step: string
  ms?: number
  detail: unknown
}

const store = new AsyncLocalStorage<TraceStep[]>()

export const tracing = process.env.NODE_ENV !== "production" || process.env.STYLIST_TRACE === "1"

export function withTrace<T>(fn: () => Promise<T>): Promise<{ result: T; trace: TraceStep[] }> {
  const steps: TraceStep[] = []
  return store.run(steps, async () => ({ result: await fn(), trace: steps }))
}

export function trace(step: string, detail: unknown, ms?: number) {
  if (!tracing) return
  store.getStore()?.push({ step, detail, ...(ms !== undefined && { ms }) })
}
