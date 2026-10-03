// Small OpenRouter client shared by every generation script (Task 2 lookbook shots,
// Task 3 personal lookbooks, anything later). No framework, no SDK: fetch + sharp.
//
//   import { generateImage, chat, imageInput, logRun } from "./lib/openrouter.mjs"
//
//   const refs = await Promise.all(urls.map((u) => imageInput(u, { scrub: SUTA_SIGNATURE })))
//   const shot = await generateImage({ model, prompt, references: refs, aspectRatio: "3:4" })
//   await saveImage(shot, "public/images/looks/x.jpg")
//
//   const text = await chat({ model: "google/gemini-3-pro", messages: [...] })
//   const data = await chat({ model, messages, json: true })   // parsed JSON object
//
// Images can be passed as https URLs, local file paths or data URLs; they are all sent
// as data URLs so they can be resized and cleaned first.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const API = "https://openrouter.ai/api/v1"
const lookbookRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")

/** The Suta signature sits in the top-right corner of their product photos. */
export const SUTA_SIGNATURE = { left: 0.8, top: 0, width: 0.2, height: 0.11 }

export function apiKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY
  for (const p of [resolve(lookbookRoot, ".env"), resolve(lookbookRoot, "../.env")]) {
    if (!existsSync(p)) continue
    const m = readFileSync(p, "utf8").match(/^OPENROUTER_API_KEY\s*=\s*"?([^"\r\n]+)"?/m)
    if (m) return m[1].trim()
  }
  throw new Error("OPENROUTER_API_KEY is not set (environment or .env)")
}

async function post(path, body, { retries = 2 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
        "X-Title": "Suta Utsav lookbook",
      },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (res.ok) return json
    // Retry rate limits and upstream hiccups; fail fast on bad requests.
    if (attempt < retries && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
      continue
    }
    throw new Error(`OpenRouter ${path} ${res.status}: ${JSON.stringify(json).slice(0, 600)}`)
  }
}

async function readBytes(src) {
  if (src.startsWith("data:")) return Buffer.from(src.split(",")[1], "base64")
  if (/^https?:/.test(src)) {
    const res = await fetch(src)
    if (!res.ok) throw new Error(`could not fetch ${src}: ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  }
  return readFileSync(resolve(src))
}

/**
 * Loads an image for use as a model input: resized to `maxWidth`, re-encoded as JPEG,
 * and optionally with a region blurred away (`scrub`, as fractions of width/height),
 * e.g. a watermark the model would otherwise copy.
 */
export async function imageInput(src, { maxWidth = 1600, scrub = null } = {}) {
  let img = sharp(await readBytes(src)).rotate().resize({ width: maxWidth, withoutEnlargement: true })
  if (scrub) {
    const buf = await img.jpeg().toBuffer()
    const { width, height } = await sharp(buf).metadata()
    const box = {
      left: Math.round(scrub.left * width),
      top: Math.round(scrub.top * height),
      width: Math.round(scrub.width * width),
      height: Math.round(scrub.height * height),
    }
    box.width = Math.min(box.width, width - box.left)
    box.height = Math.min(box.height, height - box.top)
    // Fill the box with a heavy blur of itself, which smears dark strokes into the background.
    const patch = await sharp(buf).extract(box).blur(Math.max(20, box.height / 3)).toBuffer()
    img = sharp(buf).composite([{ input: patch, left: box.left, top: box.top }])
  }
  const out = await img.jpeg({ quality: 88 }).toBuffer()
  return `data:image/jpeg;base64,${out.toString("base64")}`
}

/**
 * Text-to-image or reference-guided image generation.
 * `references`: image inputs (see imageInput) the model should follow.
 */
export async function generateImage({ model, prompt, references = [], aspectRatio = "3:4", resolution = "2K" }) {
  const started = Date.now()
  const json = await post("/images", {
    model,
    prompt,
    aspect_ratio: aspectRatio,
    resolution,
    ...(references.length && {
      input_references: references.map((url) => ({ type: "image_url", image_url: { url } })),
    }),
  })
  const first = json.data?.[0]
  if (!first?.b64_json) throw new Error(`no image returned: ${JSON.stringify(json).slice(0, 600)}`)
  return {
    bytes: Buffer.from(first.b64_json, "base64"),
    mediaType: first.media_type ?? "image/png",
    cost: json.usage?.cost ?? null,
    seconds: Math.round((Date.now() - started) / 1000),
  }
}

/**
 * Chat completion. `messages` follow the OpenAI shape; an image can be included as
 * { type: "image_url", image_url: { url } } in a content array. With `json: true` the
 * reply is parsed (the model is asked for a JSON object).
 */
export async function chat({ model, messages, json = false, temperature = 0.7, maxTokens = 2000 }) {
  const res = await post("/chat/completions", {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    ...(json && { response_format: { type: "json_object" } }),
  })
  const text = res.choices?.[0]?.message?.content ?? ""
  const usage = { cost: res.usage?.cost ?? null, tokens: res.usage?.total_tokens ?? null }
  if (!json) return { text, usage }
  const body = text.replace(/^```(?:json)?\s*|\s*```$/g, "")
  return { data: JSON.parse(body), usage }
}

/** Writes a generated image, optionally converting it (by extension: .jpg/.webp/.png). */
export async function saveImage(image, path, { quality = 86 } = {}) {
  const out = resolve(path)
  mkdirSync(dirname(out), { recursive: true })
  const ext = out.split(".").pop().toLowerCase()
  const pipeline = sharp(image.bytes)
  const bytes =
    ext === "webp"
      ? await pipeline.webp({ quality }).toBuffer()
      : ext === "jpg" || ext === "jpeg"
        ? await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer()
        : await pipeline.png().toBuffer()
  writeFileSync(out, bytes)
  return out
}

/** Appends one JSON line to a run log, so every prompt version and its cost is on record. */
export function logRun(logPath, entry) {
  mkdirSync(dirname(resolve(logPath)), { recursive: true })
  appendFileSync(resolve(logPath), JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n")
}
