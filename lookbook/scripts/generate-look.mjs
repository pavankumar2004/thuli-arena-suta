// Generates one lookbook photograph from a shot spec.
//
//   node scripts/generate-look.mjs scripts/shots/agomoni-01-shiuli.json
//
// A spec names the real catalogue products the muse wears; their Shopify photos are
// sent as reference images (with Suta's corner signature blurred out) so the garment
// in the picture is the actual piece, the lookbook's grounding rule. The spec's prompt
// is followed by the shared house style (scripts/shots/house-style.json), which keeps
// light, finish and the "never" list consistent across every shot.
//
// Output: public/images/looks/<id>-v<version>.jpg. Every run is logged with prompt,
// model and cost in scripts/shots/log.jsonl. Promote a take by setting the look's
// "image" in src/data/looks.json to { "src": "/images/looks/<file>" }.

import { readFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { SUTA_SIGNATURE, generateImage, imageInput, logRun, saveImage } from "./lib/openrouter.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const specPath = process.argv[2]
if (!specPath) {
  console.error("usage: node scripts/generate-look.mjs <shot.json>")
  process.exit(1)
}

const spec = JSON.parse(readFileSync(resolve(specPath), "utf8"))
const house = JSON.parse(readFileSync(resolve(root, "scripts/shots/house-style.json"), "utf8"))
const catalogue = JSON.parse(readFileSync(resolve(root, "src/data/products.json"), "utf8")).products

const references = await Promise.all(
  spec.references.map(({ product, index }) => {
    const p = catalogue[product]
    if (!p) throw new Error(`reference "${product}" is not in products.json; add it to a look and run npm run data`)
    if (!p.images[index]) throw new Error(`"${product}" has no image ${index}`)
    return imageInput(p.images[index], { scrub: SUTA_SIGNATURE })
  }),
)

const lines = (x) => (Array.isArray(x) ? x.join("\n") : x)
const prompt = [lines(spec.prompt), "", lines(house.style), "", lines(house.never)].join("\n")

const shot = await generateImage({
  model: spec.model ?? house.model,
  prompt,
  references,
  aspectRatio: spec.aspect_ratio ?? "3:4",
  resolution: spec.resolution ?? "2K",
})

const out = await saveImage(shot, resolve(root, `public/images/looks/${spec.id}-v${spec.version}.jpg`))
const entry = {
  id: spec.id,
  version: spec.version,
  model: spec.model ?? house.model,
  file: relative(root, out).replaceAll("\\", "/"),
  seconds: shot.seconds,
  cost: shot.cost,
  notes: spec.notes ?? null,
  prompt,
}
logRun(resolve(root, "scripts/shots/log.jsonl"), entry)
console.log(JSON.stringify({ ...entry, prompt: `${prompt.length} chars` }, null, 2))
