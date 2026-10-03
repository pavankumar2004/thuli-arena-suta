import { sanitiseIntent } from "@/lib/stylist/intent"
import { OCCASION_KEYS, type Occasion } from "@/lib/stylist/vocab"
import type { ChatReply, HistoryTurn, StylistEvent } from "@/lib/stylist/types"
import { cleanImage, cleanMessage, clientKey, errorResponse, HttpError, isNoise, rateLimit, readJson } from "@/lib/server/guard"
import { warm } from "@/lib/server/search"
import { respond, respondOnce, type Turn } from "@/lib/server/stylist"
import { tracing, withTrace } from "@/lib/server/trace"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Wakes the database when the stylist panel opens, so the first answer is fast. */
export async function GET() {
  try {
    await warm()
    return Response.json({ ok: true })
  } catch {
    return Response.json({ ok: false }, { status: 503 })
  }
}

/** The client's memory of the conversation: last 6 turns, short, plain text only. */
function cleanHistory(value: unknown): HistoryTurn[] {
  if (!Array.isArray(value)) return []
  return value
    .slice(-6)
    .filter((t): t is { role: string; text: string } => Boolean(t) && typeof t.text === "string" && (t.role === "shopper" || t.role === "stylist"))
    .map((t) => ({ role: t.role as HistoryTurn["role"], text: cleanMessage(t.text.slice(0, 480)).text.slice(0, 400) }))
}

async function readTurn(req: Request): Promise<{ turn: Turn; stream: boolean }> {
  rateLimit(`chat:${clientKey(req)}`, 30, 60_000)
  const body = await readJson(req, 8 * 1024 * 1024)
  const { text, injection } = cleanMessage(body.message ?? "")
  const image = body.image ? await cleanImage(body.image, 768) : null
  if (!image && isNoise(text)) {
    throw new HttpError(400, text ? "I speak fabric better than emoji. Tell me a colour, an occasion or a piece you're after." : "Tell me what you're looking for.")
  }
  const ctx = (body.context ?? {}) as Record<string, unknown>
  const turn: Turn = {
    text,
    image,
    injection,
    occasion: OCCASION_KEYS.includes(body.occasion as Occasion) ? (body.occasion as Occasion) : null,
    previous: sanitiseIntent(ctx.intent),
    lastHandles: Array.isArray(ctx.handles)
      ? ctx.handles.filter((h): h is string => typeof h === "string" && /^[a-z0-9-]{1,120}$/.test(h)).slice(0, 6)
      : [],
    history: cleanHistory(body.history),
    seen: Array.isArray(body.seen)
      ? [...new Set(body.seen.filter((h): h is string => typeof h === "string" && /^[a-z0-9-]{1,120}$/.test(h)))].slice(-300)
      : [],
  }
  return { turn, stream: body.stream === true }
}

export async function POST(req: Request) {
  const started = Date.now()
  let parsed: Awaited<ReturnType<typeof readTurn>>
  try {
    parsed = await readTurn(req)
  } catch (err) {
    return errorResponse(err)
  }
  const { turn, stream } = parsed

  if (!stream) {
    try {
      const { result, trace } = await withTrace(() => respondOnce(turn))
      return Response.json({ ...result, ms: Date.now() - started, ...(tracing && { trace }) } satisfies ChatReply)
    } catch (err) {
      return errorResponse(err)
    }
  }

  // Streamed: one JSON object per line. Cards arrive first ("meta"), then the reply as it
  // is written ("delta"), then "done". Errors after the stream has started are an event.
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: StylistEvent) => controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"))
      try {
        const { trace } = await withTrace(async () => {
          for await (const ev of respond(turn)) send(ev)
        })
        send({ type: "done", ms: Date.now() - started, ...(tracing && { trace }) })
      } catch (err) {
        console.error("[stylist]", err)
        send({ type: "error", error: "Something went quiet on our side. Please try again." })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  })
}
