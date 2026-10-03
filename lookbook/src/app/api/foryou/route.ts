import { InstagramError, normaliseHandle } from "@/lib/foryou/instagram"
import { run, type Event } from "@/lib/foryou/pipeline"
import { limit } from "@/lib/foryou/ratelimit"

// One request does the whole run and streams progress as NDJSON (one event per line).
export const maxDuration = 60

const json = (status: number, body: object) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } })

export async function POST(request: Request) {
  const raw = await request.text()
  if (raw.length > 1000) return json(413, { status: "invalid", message: "Request too large." })
  let handle: string
  try {
    handle = normaliseHandle((JSON.parse(raw) as { handle?: unknown })?.handle)
  } catch (err) {
    const message = err instanceof InstagramError ? err.message : "Send a JSON body like {\"handle\": \"balanvidya\"}."
    return json(400, { status: "invalid", message })
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"
  const refused = await limit(ip)
  if (refused) return json(429, { status: "unavailable", message: refused })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: Event) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`))
      try {
        await run(handle, emit)
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  })
}
