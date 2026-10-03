import "server-only"
import type { z } from "zod"

const URL = "https://openrouter.ai/api/v1/chat/completions"

// Fast vision model for tagging photos; strong vision model for taste and picks. Each
// call lists a backup, and OpenRouter switches to it if the first is down.
export const MODELS = {
  tagger: ["google/gemini-2.5-flash", "google/gemini-2.5-flash-lite"],
  stylist: [
    process.env.FORYOU_MODEL ?? "anthropic/claude-sonnet-5.5",
    "anthropic/claude-sonnet-4.6",
  ],
}

export type Part =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }

export const text = (t: string): Part => ({ type: "text", text: t })
export const image = (url: string): Part => ({ type: "image_url", image_url: { url } })
export const jpeg = (bytes: Uint8Array): Part =>
  image(`data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`)

export class LLMError extends Error {}

function parseJson(raw: string): unknown {
  const body = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim()
  const start = body.indexOf("{")
  const end = body.lastIndexOf("}")
  if (start < 0 || end < start) throw new LLMError("no JSON object in model output")
  return JSON.parse(body.slice(start, end + 1))
}

/**
 * One chat call that must return a JSON object matching `schema`. Tokens are capped,
 * the call times out, and a malformed answer is retried once. Returns the parsed object
 * and the call's cost in USD (from OpenRouter's usage accounting).
 */
export async function chatJson<T extends z.ZodType>(opts: {
  models: string[]
  system: string
  content: Part[]
  schema: T
  maxTokens: number
  timeoutMs?: number
}): Promise<{ data: z.infer<T>; cost: number }> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new LLMError("OPENROUTER_API_KEY is not set")
  let lastError: unknown
  let cost = 0
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Title": "Suta · Made for you",
      },
      body: JSON.stringify({
        models: opts.models,
        max_tokens: opts.maxTokens,
        temperature: 0.4,
        response_format: { type: "json_object" },
        usage: { include: true },
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.content },
        ],
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
    })
    if (!res.ok) throw new LLMError(`OpenRouter HTTP ${res.status}`)
    const payload = await res.json()
    cost += Number(payload?.usage?.cost ?? 0)
    try {
      const parsed = opts.schema.safeParse(parseJson(payload.choices[0].message.content))
      if (parsed.success) return { data: parsed.data, cost }
      lastError = parsed.error
    } catch (err) {
      lastError = err
    }
  }
  throw new LLMError(`model output did not match the schema: ${String(lastError).slice(0, 200)}`)
}
