import "server-only"
import sharp from "sharp"

// Instagram usernames: letters, digits, "." and "_", at most 30, no leading, trailing or
// doubled dots. Anything else is rejected before a single request is made.
const HANDLE = /^(?!\.)(?!.*\.\.)[a-z0-9._]{1,30}(?<!\.)$/
const IG_HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"])
const IMAGE_HOSTS = [".cdninstagram.com", ".fbcdn.net"]
const APP_ID = "936619743392459" // Instagram web app id, sent by instagram.com itself
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"
export const MAX_PHOTOS = 40
const MAX_IMAGE_BYTES = 6_000_000

export type FailStatus = "invalid" | "not_found" | "private" | "empty" | "unavailable"

export class InstagramError extends Error {
  constructor(public status: FailStatus, message: string) {
    super(message)
  }
}

/** "@Vidya.Balan", "instagram.com/vidya.balan/" → "vidya.balan"; otherwise throws "invalid". */
export function normaliseHandle(raw: unknown): string {
  let text = typeof raw === "string" ? raw.trim() : ""
  if (text.includes("/")) {
    try {
      const url = new URL(text.includes("//") ? text : `https://${text}`)
      text = IG_HOSTS.has(url.hostname.toLowerCase()) ? url.pathname.split("/").filter(Boolean)[0] ?? "" : ""
    } catch {
      text = ""
    }
  }
  text = text.replace(/^@+/, "").trim().toLowerCase()
  if (!HANDLE.test(text)) {
    throw new InstagramError("invalid", "That doesn't look like an Instagram handle. Try something like @balanvidya.")
  }
  return text
}

export type FetchedPhoto = {
  caption: string
  postUrl: string | null
  takenAt: Date | null
  isVideo: boolean
  imageUrl: string
}

export type FetchedProfile = {
  fullName: string
  verified: boolean
  followers: number | null
  postCount: number | null
  photos: FetchedPhoto[]
}

function headers(handle: string): HeadersInit {
  const cookie = process.env.IG_SESSION ?? ""
  const csrf = /csrftoken=([^;]+)/.exec(cookie)?.[1] ?? ""
  return {
    "User-Agent": USER_AGENT,
    "x-ig-app-id": APP_ID,
    "x-csrftoken": csrf,
    "x-requested-with": "XMLHttpRequest",
    Referer: `https://www.instagram.com/${handle}/`,
    Cookie: cookie,
    Accept: "*/*",
  }
}

async function igJson(url: string, handle: string) {
  const res = await fetch(url, { headers: headers(handle), redirect: "manual", signal: AbortSignal.timeout(12_000) })
  if (res.status === 404) throw new InstagramError("not_found", `We couldn't find @${handle}. Check the spelling?`)
  if (res.status !== 200) {
    // 3xx to /accounts/login (session expired), 401, 429 (rate limited), 5xx.
    throw new InstagramError("unavailable", "Instagram isn't answering right now. Please try again in a minute.")
  }
  return res.json()
}

type Candidate = { url: string; width: number }
type FeedItem = {
  code?: string
  taken_at?: number
  media_type?: number
  caption?: { text?: string } | null
  image_versions2?: { candidates?: Candidate[] }
  carousel_media?: FeedItem[]
}

/** A rendition about 640px wide: enough to read an outfit, small to download. */
function pick(candidates: Candidate[] | undefined): string | null {
  if (!candidates?.length) return null
  const sorted = [...candidates].sort((a, b) => a.width - b.width)
  return (sorted.find((c) => c.width >= 600) ?? sorted.at(-1))!.url
}

/**
 * Read a public profile with the logged-in session in IG_SESSION (a cookie header).
 * Profile info first, then feed pages until MAX_PHOTOS images (first 3 frames per carousel).
 */
async function fetchWithSession(handle: string): Promise<FetchedProfile> {
  const info = await igJson(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${handle}`, handle)
  const user = info?.data?.user
  if (!user) throw new InstagramError("not_found", `We couldn't find @${handle}. Check the spelling?`)
  if (user.is_private) throw new InstagramError("private", `@${handle} is private, so we can't see their posts.`)

  const photos: FetchedPhoto[] = []
  let maxId: string | undefined
  for (let page = 0; page < 5 && photos.length < MAX_PHOTOS; page++) {
    const feed = await igJson(
      `https://www.instagram.com/api/v1/feed/user/${user.id}/?count=12${maxId ? `&max_id=${maxId}` : ""}`,
      handle,
    )
    for (const item of (feed.items ?? []) as FeedItem[]) {
      const frames = item.carousel_media?.length ? item.carousel_media.slice(0, 3) : [item]
      for (const frame of frames) {
        const url = pick(frame.image_versions2?.candidates)
        if (!url || photos.length >= MAX_PHOTOS) continue
        photos.push({
          caption: item.caption?.text ?? "",
          postUrl: item.code ? `https://www.instagram.com/p/${item.code}/` : null,
          takenAt: item.taken_at ? new Date(item.taken_at * 1000) : null,
          isVideo: frame.media_type === 2,
          imageUrl: url,
        })
      }
    }
    if (!feed.more_available || !feed.next_max_id) break
    maxId = String(feed.next_max_id)
  }
  if (!photos.length) throw new InstagramError("empty", `@${handle} hasn't posted anything we can read yet.`)
  return {
    fullName: user.full_name ?? "",
    verified: Boolean(user.is_verified),
    followers: user.edge_followed_by?.count ?? null,
    postCount: user.edge_owner_to_timeline_media?.count ?? null,
    photos,
  }
}

// The public profile embed (the widget other websites use) needs no login. Its HTML carries
// the profile and the latest 6 posts as a JSON string in "contextJSON". Instagram serves that
// version of the page to requests that look like a browser navigation.
const NAVIGATION_HEADERS: HeadersInit = {
  "User-Agent": USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
}

type EmbedMedia = {
  shortcode?: string
  is_video?: boolean
  display_url?: string
  display_resources?: { src: string; config_width: number }[]
  taken_at_timestamp?: number
  edge_media_to_caption?: { edges?: { node?: { text?: string } }[] }
}

async function fetchEmbed(handle: string): Promise<FetchedProfile> {
  const res = await fetch(`https://www.instagram.com/${handle}/embed/`, {
    headers: NAVIGATION_HEADERS, redirect: "manual", signal: AbortSignal.timeout(12_000),
  })
  if (res.status === 404) throw new InstagramError("not_found", `We couldn't find @${handle}. Check the spelling?`)
  if (res.status !== 200) {
    throw new InstagramError("unavailable", "Instagram isn't answering right now. Please try again in a minute.")
  }
  const html = await res.text()
  const literal = /"contextJSON":("(?:[^"\\]|\\.)*")/.exec(html)?.[1]
  if (!literal) {
    // Unknown and private accounts both get a "broken" embed with contextJSON: null.
    if (/"contextJSON":null|EmbedBroken/.test(html)) {
      throw new InstagramError("not_found",
        `We couldn't find @${handle}, or the account is private. Check the spelling?`)
    }
    throw new InstagramError("unavailable", "Instagram isn't answering right now. Please try again in a minute.")
  }
  const ctx = JSON.parse(JSON.parse(literal))?.context ?? {}
  if ((ctx.username ?? "").toLowerCase() !== handle) {
    throw new InstagramError("not_found", `We couldn't find @${handle}. Check the spelling?`)
  }
  const media = ((ctx.graphql_media ?? []) as { shortcode_media?: EmbedMedia }[])
    .map((m) => m.shortcode_media).filter((m): m is EmbedMedia => Boolean(m))
  const photos: FetchedPhoto[] = media.flatMap((m) => {
    const url = pick(m.display_resources?.map((r) => ({ url: r.src, width: r.config_width }))) ?? m.display_url
    return url ? [{
      caption: m.edge_media_to_caption?.edges?.[0]?.node?.text ?? "",
      postUrl: m.shortcode ? `https://www.instagram.com/p/${m.shortcode}/` : null,
      takenAt: m.taken_at_timestamp ? new Date(m.taken_at_timestamp * 1000) : null,
      isVideo: Boolean(m.is_video),
      imageUrl: url,
    }] : []
  })
  if (!photos.length) {
    throw new InstagramError("private", `@${handle} is private or has no public posts we can read.`)
  }
  return {
    fullName: ctx.full_name ?? "",
    verified: Boolean(ctx.is_verified ?? ctx.verified),
    followers: ctx.followers_count ?? null,
    postCount: ctx.posts_count ?? null,
    photos,
  }
}

/**
 * The person's recent photos. With IG_SESSION: up to MAX_PHOTOS via the logged-in API; if
 * Instagram rate-limits us or the session has expired, the public embed's latest 6 posts.
 * "Not found" and "private" answers are final either way.
 */
export async function fetchProfile(
  handle: string,
  onFallback: (reason: string) => void = () => {},
): Promise<FetchedProfile & { source: "session" | "embed" }> {
  if (process.env.IG_SESSION) {
    try {
      return { ...(await fetchWithSession(handle)), source: "session" }
    } catch (err) {
      if (!(err instanceof InstagramError) || err.status !== "unavailable") throw err
      onFallback("Instagram is busy, so we're reading your latest posts")
    }
  }
  return { ...(await fetchEmbed(handle)), source: "embed" }
}

/** Download one image: https, Instagram's CDN only, no redirects, size-capped; → 640px JPEG. */
export async function downloadJpeg(src: string): Promise<Buffer | null> {
  let url: URL
  try {
    url = new URL(src)
  } catch {
    return null
  }
  if (url.protocol !== "https:" || !IMAGE_HOSTS.some((h) => url.hostname.endsWith(h))) return null
  try {
    const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10_000) })
    if (res.status !== 200) return null
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.length > MAX_IMAGE_BYTES) return null
    return await sharp(bytes).rotate().resize(640, 640, { fit: "inside" }).jpeg({ quality: 82 }).toBuffer()
  } catch {
    return null
  }
}
