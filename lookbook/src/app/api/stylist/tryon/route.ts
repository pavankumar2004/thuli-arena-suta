import { createHash } from "node:crypto"
import { SUTA_SIGNATURE, generateImage, imageInput } from "../../../../../scripts/lib/openrouter.mjs"
import type { TryOnReply } from "@/lib/stylist/types"
import { env } from "@/lib/server/env"
import { cleanImage, clientKey, errorResponse, HttpError, rateLimit, readJson } from "@/lib/server/guard"
import { productForTryOn } from "@/lib/server/search"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

const MODEL = "google/gemini-3.1-flash-image"

// Try-ons are the one expensive call, so: a per-visitor limit, a global cap on concurrent
// generations, and a small cache so the same photo + piece is never paid for twice.
let inFlight = 0
const MAX_IN_FLIGHT = 3
const cache = new Map<string, string>()

export async function POST(req: Request) {
  const started = Date.now()
  try {
    rateLimit(`tryon:${clientKey(req)}`, 4, 10 * 60_000)
    const body = await readJson(req, 8 * 1024 * 1024)
    const handle = typeof body.product === "string" && /^[a-z0-9-]{1,120}$/.test(body.product) ? body.product : null
    if (!handle) throw new HttpError(400, "Which piece would you like to try?")
    const portrait = await cleanImage(body.portrait, 1024)

    const product = await productForTryOn(handle)
    if (!product) throw new HttpError(404, "We couldn't find that piece.")

    const key = createHash("sha256").update(portrait).update(handle).digest("hex")
    const cached = cache.get(key)
    const done = (image: string) =>
      Response.json({ image, product: { handle: product.handle, title: product.title, url: product.url }, ms: Date.now() - started } satisfies TryOnReply)
    if (cached) return done(cached)

    if (inFlight >= MAX_IN_FLIGHT) throw new HttpError(503, "Our fitting room is busy. Please try again in a minute.")
    inFlight++
    try {
      env("OPENROUTER_API_KEY")
      const garmentRefs = await Promise.all(product.images.slice(0, 2).map((src) => imageInput(src, { scrub: SUTA_SIGNATURE, maxWidth: 1024 })))
      const shot = await generateImage({
        model: MODEL,
        prompt: tryOnPrompt(product),
        references: [portrait, ...garmentRefs],
        aspectRatio: "3:4",
        resolution: "1K",
      })
      const image = `data:${shot.mediaType};base64,${shot.bytes.toString("base64")}`
      cache.set(key, image)
      if (cache.size > 50) cache.delete(cache.keys().next().value!)
      return done(image)
    } finally {
      inFlight--
    }
  } catch (err) {
    return errorResponse(err)
  }
}

function tryOnPrompt(p: NonNullable<Awaited<ReturnType<typeof productForTryOn>>>) {
  const attr = (k: string) => (p.attributes?.[k] ?? []).join(", ")
  const garment = [
    `${p.title}, a ${p.category?.replace(/s$/, "").toLowerCase() ?? "garment"} by Suta`,
    p.colours.length && `colour: ${p.colours.join(" and ")}`,
    attr("fabric") && `fabric: ${attr("fabric")}`,
    (attr("pattern") || attr("type")) && `details: ${[attr("pattern"), attr("type")].filter(Boolean).join(", ")}`,
    attr("technique") && `craft: ${attr("technique")}`,
  ]
    .filter(Boolean)
    .join("; ")
  const drape =
    p.category === "Sarees"
      ? "Drape it as a saree in the classic nivi style with neat front pleats and the pallu over the left shoulder, keeping whatever blouse colour best suits the saree."
      : "Fit it naturally on the body, as styled in the product photos."
  return [
    "High-fashion editorial portrait, realistic virtual fitting.",
    "The FIRST image is the shopper. The remaining images show one real garment from the Suta catalogue.",
    `Dress the person from the first image in this exact outfit: ${garment}. Reproduce the garment's colours, borders, motifs and texture faithfully from the garment images. ${drape}`,
    "Keep the person's face, facial features, skin tone, hair, body shape and pose exactly as in their photo, and keep their background and natural lighting. Do not beautify, slim or change their identity.",
    "Photorealistic, natural skin texture, soft natural light.",
    "Never include any text, watermark, logo or signature, and do not copy the models from the garment images.",
  ].join("\n")
}
