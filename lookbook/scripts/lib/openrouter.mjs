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
import https from "node:https"
import sharp from "sharp"

const API = "https://openrouter.ai/api/v1"
const lookbookRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")

/**
 * The Suta signature sits in the top-right corner of their product photos. We crop the
 * whole top band away rather than blurring it: a blurred patch gets copied by the model
 * as a soft grey box. References only need to show the garment, so the band is no loss.
 */
export const SUTA_SIGNATURE = { trimTop: 0.12 }

export function apiKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY
  for (const p of [resolve(lookbookRoot, ".env"), resolve(lookbookRoot, "../.env")]) {
    if (!existsSync(p)) continue
    const m = readFileSync(p, "utf8").match(/^OPENROUTER_API_KEY\s*=\s*"?([^"\r\n]+)"?/m)
    if (m) return m[1].trim()
  }
  throw new Error("OPENROUTER_API_KEY is not set (environment or .env)")
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/** fetch that retries dropped connections and timeouts (not HTTP errors). */
async function fetchRetry(url, init, retries = 3) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, init)
    } catch (err) {
      if (attempt >= retries) throw err
      await wait(3000 * (attempt + 1))
    }
  }
}

/**
 * POST JSON over node:https. Not global fetch: undici aborts any response that takes
 * longer than 300s, and a 2K image with several references can exceed that.
 */
function httpsJson(url, body, timeoutMs = 600_000) {
  const payload = JSON.stringify(body)
  return new Promise((resolvePromise, reject) => {
    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey()}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          "X-Title": "Suta Utsav lookbook",
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = []
        res.on("data", (c) => chunks.push(c))
        res.on("error", reject)
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8")
          let json
          try {
            json = JSON.parse(text)
          } catch {
            return reject(new Error(`truncated or non-JSON response (${res.statusCode}): ${text.slice(0, 200)}`))
          }
          resolvePromise({ status: res.statusCode, json })
        })
      },
    )
    req.on("timeout", () => req.destroy(new Error(`timed out after ${timeoutMs / 1000}s`)))
    req.on("error", reject)
    req.end(payload)
  })
}

async function post(path, body, { retries = 2 } = {}) {
  for (let attempt = 0; ; attempt++) {
    let status, json
    try {
      ;({ status, json } = await httpsJson(`${API}${path}`, body))
    } catch (err) {
      // Dropped connection or cut-off body: worth another go.
      if (attempt < retries) {
        console.warn(`OpenRouter ${path}: ${err.message}; retrying`)
        await wait(3000 * (attempt + 1))
        continue
      }
      throw err
    }
    if (status >= 200 && status < 300) return json
    // Retry rate limits and upstream hiccups; fail fast on bad requests.
    if (attempt < retries && (status === 429 || status >= 500)) {
      await wait(2000 * (attempt + 1))
      continue
    }
    throw new Error(`OpenRouter ${path} ${status}: ${JSON.stringify(json).slice(0, 600)}`)
  }
}

async function readBytes(src) {
  if (src.startsWith("data:")) return Buffer.from(src.split(",")[1], "base64")
  if (/^https?:/.test(src)) {
    const res = await fetchRetry(src)
    if (!res.ok) throw new Error(`could not fetch ${src}: ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  }
  return readFileSync(resolve(src))
}

/**
 * Loads an image for use as a model input: resized to `maxWidth`, re-encoded as JPEG,
 * and optionally cropped (`scrub.trimTop`, a fraction of the height) to drop a
 * watermark band the model would otherwise copy.
 */
export async function imageInput(src, { maxWidth = 1600, scrub = null } = {}) {
  let img = sharp(await readBytes(src)).rotate().resize({ width: maxWidth, withoutEnlargement: true })
  if (scrub?.trimTop) {
    const buf = await img.jpeg().toBuffer()
    const { width, height } = await sharp(buf).metadata()
    const top = Math.round(scrub.trimTop * height)
    img = sharp(buf).extract({ left: 0, top, width, height: height - top })
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
