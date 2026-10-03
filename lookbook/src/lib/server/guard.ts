import "server-only"

import sharp from "sharp"

// Input hygiene and abuse limits for the stylist's public endpoints.

export const MAX_MESSAGE = 500 // longer payloads are rejected outright (400)
export const KEEP_MESSAGE = 350 // what we actually read
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Lets the client tell kinds of refusal apart (e.g. "fit-mismatch"). */
    public code?: string,
  ) {
    super(message)
  }
}

/** Reads a JSON body with a hard size cap, without trusting Content-Length. */
export async function readJson(req: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get("content-length") ?? 0)
  if (declared > maxBytes) throw new HttpError(413, "That's more than we can take in one go.")
  const reader = req.body?.getReader()
  if (!reader) throw new HttpError(400, "Empty request.")
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      throw new HttpError(413, "That's more than we can take in one go.")
    }
    chunks.push(value)
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error()
    return body
  } catch {
    throw new HttpError(400, "We couldn't read that request.")
  }
}

// Control characters, zero-width and bidi-override characters (written as escapes on purpose).
const INVISIBLE = new RegExp("[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]", "g")

const INJECTION =
  /(ignore|disregard|forget|override)\s+(all\s+|any\s+|the\s+|your\s+|previous\s+|prior\s+|above\s+)*(instructions?|prompts?|rules?|guidelines?)|system\s*prompt|developer\s*(mode|message)|you are now|act as an?|pretend (to be|you)|jailbreak|\bDAN\b|(reveal|show|print|repeat|leak) (me )?(your|the) (system |hidden |initial )?(prompt|instructions|rules)|api[_ ]?key|database|sql|schema|env(ironment)? var|<\/?\s*(system|assistant|user)\s*>/gi

/**
 * Normalises a shopper's message: strips control and zero-width characters, collapses
 * whitespace, defuses instruction-like phrases and keeps the first 350 characters.
 * Returns `injection: true` when it removed something suspicious.
 */
export function cleanMessage(input: unknown): { text: string; injection: boolean } {
  if (typeof input !== "string") return { text: "", injection: false }
  if (input.length > MAX_MESSAGE) throw new HttpError(400, `Please keep it under ${MAX_MESSAGE} characters.`)
  let text = input
    .normalize("NFKC")
    .replace(INVISIBLE, " ")
    .replace(/\s+/g, " ")
    .trim()
  const injection = INJECTION.test(text)
  INJECTION.lastIndex = 0
  text = text.replace(INJECTION, " ").replace(/\s+/g, " ").trim().slice(0, KEEP_MESSAGE)
  return { text, injection }
}

/** True when there's nothing to search on: empty, only emoji or punctuation. */
export function isNoise(text: string) {
  return !/[\p{L}\p{N}]/u.test(text)
}

/**
 * Validates an uploaded photo (data URL only: we never fetch URLs the client gives us)
 * by decoding it, then re-encodes it as a clean, EXIF-free JPEG at most `maxSide` px.
 */
export async function cleanImage(input: unknown, maxSide = 1024): Promise<string> {
  if (typeof input !== "string") throw new HttpError(400, "Please attach a photo.")
  const m = input.match(/^data:image\/(jpeg|jpg|png|webp|heic|heif|avif);base64,([A-Za-z0-9+/=\s]+)$/)
  if (!m) throw new HttpError(400, "Please upload a JPEG, PNG or WebP photo.")
  const bytes = Buffer.from(m[2], "base64")
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new HttpError(413, "That photo is a little too large; please try one under 6 MB.")
  try {
    const out = await sharp(bytes, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 86 })
      .toBuffer()
    return `data:image/jpeg;base64,${out.toString("base64")}`
  } catch {
    throw new HttpError(400, "We couldn't open that photo. Could you try another?")
  }
}

// ---- Rate limiting: a sliding window per client, in memory (one server process). ----

const windows = new Map<string, number[]>()

export function clientKey(req: Request) {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return fwd || req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || "local"
}

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const hits = (windows.get(key) ?? []).filter((t) => now - t < windowMs)
  if (hits.length >= limit) {
    const retry = Math.ceil((windowMs - (now - hits[0])) / 1000)
    throw new HttpError(429, `A moment, please. Try again in ${retry}s.`)
  }
  hits.push(now)
  windows.set(key, hits)
  if (windows.size > 5000) windows.clear()
}

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) return Response.json({ error: err.message, ...(err.code && { code: err.code }) }, { status: err.status })
  console.error("[stylist]", err)
  return Response.json({ error: "Something went quiet on our side. Please try again." }, { status: 500 })
}
