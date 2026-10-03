import "server-only"
import sharp from "sharp"
import { sql } from "./db"
import { downloadJpeg, fetchProfile, InstagramError, type FailStatus } from "./instagram"
import { chatJson, image, jpeg, MODELS, text, type Part } from "./openrouter"
import { STYLIST, TAGGER, TASTE } from "./prompts"
import { ANCHORS, Pick, PhotoTags, Taste, type Wardrobe } from "./schemas"

export type Event =
  | { type: "stage"; stage: string; message: string }
  | { type: "error"; status: FailStatus; message: string }
  | { type: "done"; id: string }

type Emit = (e: Event) => void

const TAG_BATCH = 5      // small batches, all in parallel: tagging is the slowest stage
const TAG_SIDE = 384     // the tagger only needs to recognise a garment and its colours
const TASTE_PHOTOS = 10
const TAG_LIMIT = 40      // newest photos only: enough signal, keeps a run well under a minute
const CANDIDATES = 6
const DEPARTMENTS: Record<Wardrobe, string[]> = { womenswear: ["Sarees", "Women"], menswear: ["Men"] }

type Photo = { id: string; position: number; caption: string; is_outfit: boolean | null; worn_by_owner: boolean | null;
  garment: string | null; colours: string[] | null; occasion: string | null; image?: Uint8Array }
type Moment = Taste["moments"][number] & { photo_id: string }
type StoredTaste = Omit<Taste, "moments"> & { moments: Moment[] }
type Candidate = { id: string; handle: string; title: string; image: string; garment: string; colours: string[];
  fabric_look: string | null; silhouette: string | null; pairs_with: string[] }

/** Fetch image bytes only for the photos a stage needs (they're the bulk of each row). */
async function withImages(photos: Photo[]): Promise<Photo[]> {
  const missing = photos.filter((p) => !p.image)
  if (missing.length) {
    const rows = await sql().query(
      `SELECT id::text, encode(image, 'base64') AS b64 FROM ig_photos WHERE id = ANY($1::uuid[])`,
      [missing.map((p) => p.id)])
    const byId = new Map(rows.map((r) => [r.id as string, r.b64 as string]))
    for (const p of missing) p.image = new Uint8Array(Buffer.from(byId.get(p.id) ?? "", "base64"))
  }
  return photos
}

/** Stage 1: the person's photos, from Neon if we have them, else live from Instagram. */
async function ensurePhotos(handle: string, emit: Emit): Promise<Photo[]> {
  const db = sql()
  const cached = await db.query(
    `SELECT id::text, position, caption, is_outfit, worn_by_owner, garment, colours, occasion
     FROM ig_photos WHERE handle = $1 ORDER BY position`, [handle])
  if (cached.length) {
    emit({ type: "stage", stage: "photos", message: `Opening @${handle}'s saved posts` })
    return cached as Photo[]
  }
  emit({ type: "stage", stage: "photos", message: `Reading @${handle} on Instagram` })
  const profile = await fetchProfile(handle, (message) => emit({ type: "stage", stage: "photos", message }))
  emit({ type: "stage", stage: "photos", message: `Saving ${profile.photos.length} photos` })
  const images = await Promise.all(profile.photos.map((p) => downloadJpeg(p.imageUrl)))
  await db.query(
    `INSERT INTO ig_profiles (handle, full_name, verified, followers, post_count, source, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (handle) DO UPDATE SET full_name = excluded.full_name, verified = excluded.verified,
       followers = excluded.followers, post_count = excluded.post_count, source = excluded.source, fetched_at = now()`,
    [handle, profile.fullName, profile.verified, profile.followers, profile.postCount, `live-${profile.source}`])
  const rows = profile.photos.map((p, i) => ({ p, img: images[i], i })).filter((x) => x.img)
  if (!rows.length) throw new InstagramError("empty", `We couldn't download any photos from @${handle}.`)
  await db.query(
    `INSERT INTO ig_photos (handle, position, post_url, caption, taken_at, is_video, image)
     SELECT $1, * FROM unnest($2::int[], $3::text[], $4::text[], $5::timestamptz[], $6::bool[], $7::bytea[])`,
    [handle, rows.map((r) => r.i), rows.map((r) => r.p.postUrl), rows.map((r) => r.p.caption),
     rows.map((r) => r.p.takenAt?.toISOString() ?? null), rows.map((r) => r.p.isVideo),
     rows.map((r) => `\\x${r.img!.toString("hex")}`)])
  return ensurePhotos(handle, () => {})
}

/** Stage 2: tag every untagged photo with the fast vision model, in parallel batches. */
async function tagPhotos(photos: Photo[], emit: Emit): Promise<number> {
  const todo = photos.slice(0, TAG_LIMIT).filter((p) => p.is_outfit === null)
  if (!todo.length) return 0
  emit({ type: "stage", stage: "tag", message: `Looking at ${todo.length} photos` })
  await withImages(todo)
  let cost = 0
  const batches = Array.from({ length: Math.ceil(todo.length / TAG_BATCH) }, (_, i) =>
    todo.slice(i * TAG_BATCH, (i + 1) * TAG_BATCH))
  await Promise.all(batches.map(async (batch) => {
    const small = await Promise.all(batch.map((p) =>
      sharp(p.image!).resize(TAG_SIDE, TAG_SIDE, { fit: "inside" }).jpeg({ quality: 75 }).toBuffer()))
    const content: Part[] = batch.flatMap((p, k) => [
      text(`Photo ${k + 1}. Caption: ${p.caption.replace(/\s+/g, " ").slice(0, 200) || "(none)"}`),
      jpeg(small[k]),
    ])
    const { data, cost: c } = await chatJson({ models: MODELS.tagger, system: TAGGER, content, schema: PhotoTags, maxTokens: 2000 })
    cost += c
    for (const t of data.photos) {
      const p = batch[t.n - 1]
      if (!p) continue
      Object.assign(p, { is_outfit: t.is_outfit, worn_by_owner: t.worn_by_owner, garment: t.garment, colours: t.colours, occasion: t.occasion })
      await sql().query(
        `UPDATE ig_photos SET is_outfit = $2, worn_by_owner = $3, garment = $4, colours = $5, occasion = $6, note = $7 WHERE id = $1`,
        [p.id, t.is_outfit, t.worn_by_owner, t.garment, t.colours, t.occasion, t.note])
    }
  }))
  return cost
}

const count = (xs: (string | null | undefined)[]) =>
  Object.entries(xs.reduce<Record<string, number>>((acc, x) => (x ? { ...acc, [x]: (acc[x] ?? 0) + 1 } : acc), {}))
    .sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ")

/** Stage 3: the taste profile from their best outfit photos (strong vision model). */
async function readTaste(handle: string, photos: Photo[], emit: Emit): Promise<{ taste: StoredTaste; cost: number }> {
  const saved = await sql().query(`SELECT taste FROM wardrobes WHERE handle = $1`, [handle])
  if (saved.length) return { taste: saved[0].taste as StoredTaste, cost: 0 }

  const outfits = photos.filter((p) => p.is_outfit && p.worn_by_owner)
  if (!outfits.length) throw new InstagramError("empty", `We couldn't find any outfits on @${handle} yet.`)
  emit({ type: "stage", stage: "taste", message: `Reading your style from ${outfits.length} outfit${outfits.length === 1 ? "" : "s"}` })
  // With few outfit photos (e.g. the 6-post embed of a feed full of film posters), also show
  // their other posts, so the three moments can come from different posts and captions.
  const extra = outfits.length >= 3 ? [] : photos.filter((p) => !outfits.includes(p) && p.is_outfit !== null)
  const shown = await withImages([...outfits, ...extra].slice(0, TASTE_PHOTOS))
  const others = photos.filter((p) => !shown.includes(p) && p.caption).slice(0, 30)
  const content: Part[] = [
    text(`Instagram @${handle}. Across ${outfits.length} outfit photos they wear: ${count(outfits.map((p) => p.garment))}. ` +
      `Colours: ${count(outfits.flatMap((p) => p.colours ?? []))}. Occasions: ${count(outfits.map((p) => p.occasion))}.`),
    ...shown.flatMap((p, k) => [
      text(`Photo ${k + 1}. Caption: ${p.caption.replace(/\s+/g, " ").slice(0, 300) || "(none)"}`),
      jpeg(p.image!),
    ]),
    text(`Other captions:\n${others.map((p) => `- ${p.caption.replace(/\s+/g, " ").slice(0, 160)}`).join("\n")}`),
  ]
  const { data, cost } = await chatJson({ models: MODELS.stylist, system: TASTE, content, schema: Taste, maxTokens: 1800, timeoutMs: 40_000 })
  const taste: StoredTaste = {
    ...data,
    moments: data.moments.map((m) => ({ ...m, photo_id: (shown[m.photo - 1] ?? shown[0]).id })),
  }
  await sql().query(
    `INSERT INTO wardrobes (handle, taste, model) VALUES ($1, $2, $3)
     ON CONFLICT (handle) DO UPDATE SET taste = excluded.taste, model = excluded.model, created_at = now()`,
    [handle, JSON.stringify(taste), MODELS.stylist[0]])
  return { taste, cost }
}

/** Stage 4: real, in-stock candidates for one moment. Pure SQL, no AI. */
async function shortlist(handle: string, taste: StoredTaste, m: Moment, exclude: string[]): Promise<Candidate[]> {
  const anchors = [...ANCHORS[taste.wardrobe]]
  return (await sql().query(
    `SELECT p.id::text, p.handle, p.title, p.images[1] AS image, t.garment, t.colours, t.fabric_look,
            t.silhouette, p.pairs_with
     FROM products p JOIN product_tags t ON t.product_id = p.id
     WHERE p.available AND p.price > 0 AND p.department = ANY($1) AND t.garment = ANY($2)
       AND NOT t.colours && $3::text[] AND NOT t.garment = ANY($4) AND NOT p.id::text = ANY($5)
     ORDER BY (CASE WHEN t.garment = ANY($6) THEN 4 ELSE 0 END)
            + (CASE WHEN t.occasion = $7 THEN 3 ELSE 0 END)
            + 2 * cardinality(ARRAY(SELECT unnest(t.colours) INTERSECT SELECT unnest($8::text[])))
            + cardinality(ARRAY(SELECT unnest(t.colours) INTERSECT SELECT unnest($9::text[])))
            + ('x' || substr(md5($10 || p.id::text), 1, 6))::bit(24)::int / 16777215.0 DESC
     LIMIT $11`,
    [DEPARTMENTS[taste.wardrobe], anchors, taste.avoid.colours, taste.avoid.garments, exclude,
     m.garments, m.occasion, m.colours, taste.palette, handle, CANDIDATES])) as Candidate[]
}

const thumb = (src: string) => `${src}${src.includes("?") ? "&" : "?"}width=384`

/** Stage 5: the strong model sees their photo and the candidates, and picks one. */
async function pickOne(taste: StoredTaste, m: Moment, photo: Photo, cands: Candidate[]) {
  const content: Part[] = [
    text(`Their style: ${taste.summary} Moment: ${m.name} (${m.occasion}). Why: ${m.why}\n` +
      `Their post caption: ${photo.caption.replace(/\s+/g, " ").slice(0, 300) || "(none)"}\nTheir photo:`),
    jpeg(photo.image!),
    ...cands.flatMap((c, k) => [
      text(`c${k + 1}: ${c.title}: ${c.garment}, ${c.colours.join("/")}, ${c.fabric_look ?? ""}, ${c.silhouette ?? ""}`),
      image(thumb(c.image)),
    ]),
  ]
  try {
    const { data, cost } = await chatJson({ models: MODELS.stylist, system: STYLIST, content, schema: Pick, maxTokens: 500 })
    const chosen = cands[Number(data.choice.slice(1)) - 1]
    if (chosen) return { chosen, headline: data.headline, reason: data.reason, cost }
  } catch {
    // fall through to a grounded default
  }
  return { chosen: cands[0], headline: m.name, reason: `Picked because of your post: ${m.why}`, cost: 0 }
}

/** The whole "Made for you" run for one handle. Every stage is persisted, so a retry resumes. */
export async function run(handle: string, emit: Emit): Promise<void> {
  const db = sql()
  const started = Date.now()
  const timings: Record<string, number> = {}
  const mark = (k: string) => (timings[k] = Math.round((Date.now() - started) / 100) / 10)
  const [{ id }] = await db.query(
    `INSERT INTO personal_lookbooks (handle, status, stage) VALUES ($1, 'running', 'photos') RETURNING id::text`, [handle])
  let cost = 0
  try {
    const photos = await ensurePhotos(handle, emit); mark("photos")
    cost += await tagPhotos(photos, emit); mark("tag")
    const { taste, cost: c } = await readTaste(handle, photos, emit); cost += c; mark("taste")

    emit({ type: "stage", stage: "shortlist", message: "Finding pieces from Suta's racks" })
    const lists: Candidate[][] = []
    for (const m of taste.moments) lists.push(await shortlist(handle, taste, m, lists.flat().map((c) => c.id)))
    if (lists.some((l) => !l.length)) throw new InstagramError("empty", "We couldn't find in-stock pieces for this style right now.")
    mark("shortlist")

    emit({ type: "stage", stage: "style", message: "Styling your three looks" })
    const byId = new Map(photos.map((p) => [p.id, p]))
    await withImages(taste.moments.map((m) => byId.get(m.photo_id) ?? photos[0]))
    const picks = await Promise.all(taste.moments.map((m, i) => pickOne(taste, m, byId.get(m.photo_id) ?? photos[0], lists[i])))
    // Partners complete an outfit (blouse, bottoms, dupatta, jewellery); never a second main garment.
    const partnerRows = await db.query(
      `SELECT id::text, handle FROM products WHERE available AND handle = ANY($1)
         AND category NOT IN ('Sarees', 'Lehengas', 'Dresses', 'Co-ords & Kurta Sets', 'Kurtas', 'Shirts', 'Jackets')`,
      [picks.flatMap((p) => p.chosen.pairs_with)])
    const partnerId = new Map(partnerRows.map((r) => [r.handle as string, r.id as string]))
    const looks = picks.map((p, i) => ({
      moment: taste.moments[i].name,
      occasion: taste.moments[i].occasion,
      headline: p.headline,
      reason: p.reason,
      photo_id: taste.moments[i].photo_id,
      product_ids: [p.chosen.id, ...p.chosen.pairs_with.map((h) => partnerId.get(h)).filter(Boolean)],
    }))
    cost += picks.reduce((s, p) => s + p.cost, 0)
    mark("style")
    await db.query(
      `UPDATE personal_lookbooks SET status = 'done', stage = 'done', looks = $2, taste = $3, cost_usd = $4, timings = $5 WHERE id = $1`,
      [id, JSON.stringify(looks), JSON.stringify(taste), cost.toFixed(4), JSON.stringify(timings)])
    emit({ type: "done", id })
  } catch (err) {
    const status: FailStatus = err instanceof InstagramError ? err.status : "unavailable"
    const message = err instanceof InstagramError ? err.message : "Something went wrong while styling. Please try again."
    await db.query(`UPDATE personal_lookbooks SET status = 'error', error = $2, cost_usd = $3 WHERE id = $1`, [id, status, cost.toFixed(4)])
    if (!(err instanceof InstagramError)) console.error("foryou pipeline", err)
    emit({ type: "error", status, message })
  }
}
