import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Logo } from "@/components/brand/logo"
import { sql } from "@/lib/foryou/db"
import { shopifyImage } from "@/lib/shopify-loader"

export const dynamic = "force-dynamic" // prices and stock are read live on every view

export const metadata: Metadata = { title: "Made for you · Suta", robots: { index: false } }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

type Look = { moment: string; occasion: string; headline: string; reason: string; photo_id: string; product_ids: string[] }
type Product = { id: string; title: string; url: string; price: string; compare_at_price: string | null; image: string;
  category: string; available: boolean; sizes_in_stock: string[] }

const inr = (v: string | number) => `₹${Math.round(Number(v)).toLocaleString("en-IN")}`

export default async function ForYouPage({ params }: PageProps<"/for/[id]">) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const db = sql()
  const [book] = await db.query(
    `SELECT l.status, l.error, l.looks, l.taste, l.handle, p.full_name
     FROM personal_lookbooks l LEFT JOIN ig_profiles p ON p.handle = l.handle WHERE l.id = $1`, [id])
  if (!book) notFound()
  if (book.status !== "done") {
    return (
      <Shell>
        <p className="font-display text-3xl">{book.status === "running" ? "Still styling…" : "We couldn't style this one."}</p>
        <Link href="/made-for-you" className="mt-6 inline-block underline underline-offset-4">Try again</Link>
      </Shell>
    )
  }

  const looks = book.looks as Look[]
  const ids = looks.flatMap((l) => l.product_ids)
  const rows = (await db.query(
    `SELECT id::text, title, url, price::text, compare_at_price::text, images[1] AS image, category, available, sizes_in_stock
     FROM products WHERE id::text = ANY($1)`, [ids])) as Product[]
  const products = new Map(rows.map((p) => [p.id, p]))
  const photos = new Map(
    (await db.query(`SELECT id::text, post_url, caption FROM ig_photos WHERE id = ANY($1::uuid[])`,
      [looks.map((l) => l.photo_id)])).map((r) => [r.id as string, r]))
  const name = (book.full_name as string) || `@${book.handle}`
  const taste = book.taste as { summary: string; palette: string[]; vibe: string[] }

  return (
    <Shell>
      <p className="text-[11px] uppercase tracking-[0.3em] text-stone">Made for</p>
      <h1 className="mt-2 font-display text-5xl leading-none sm:text-6xl">{name}</h1>
      <p className="mx-auto mt-6 max-w-2xl font-display text-xl italic leading-snug text-charcoal/80">{taste.summary}</p>
      <p className="mt-4 text-xs uppercase tracking-[0.2em] text-stone">
        {[...taste.palette.slice(0, 4), ...taste.vibe.slice(0, 3)].join(" · ")}
      </p>

      <div className="mt-16 space-y-24 text-left">
        {looks.map((look, i) => {
          const pieces = look.product_ids.map((pid) => products.get(pid)).filter(Boolean) as Product[]
          const photo = photos.get(look.photo_id)
          const total = pieces.filter((p) => p.available).reduce((s, p) => s + Number(p.price), 0)
          return (
            <article key={i} className="grid gap-8 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-14">
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/foryou/photo/${look.photo_id}`} alt={`${name}'s post`} width={640} height={800}
                  className="aspect-[4/5] w-full bg-kora object-cover" loading={i ? "lazy" : "eager"} />
                <figcaption className="mt-3 text-xs leading-relaxed text-stone">
                  Your post{photo?.caption ? `: “${String(photo.caption).replace(/\s+/g, " ").slice(0, 110)}…”` : ""}{" "}
                  {photo?.post_url && (
                    <a href={photo.post_url as string} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">View on Instagram</a>
                  )}
                </figcaption>
              </figure>
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-rust">Look {i + 1} · {look.moment}</p>
                <h2 className="mt-3 font-display text-4xl leading-tight">{look.headline}</h2>
                <p className="mt-4 font-display text-lg italic leading-relaxed text-charcoal/85">{look.reason}</p>
                <ul className="mt-8 divide-y divide-border border-y border-border">
                  {pieces.map((p) => (
                    <li key={p.id} className="flex gap-5 py-5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={shopifyImage(p.image, 256)} alt={p.title} width={96} height={128}
                        className="aspect-[3/4] w-24 shrink-0 bg-kora object-cover" loading="lazy" />
                      <div className="min-w-0">
                        <p className="text-sm uppercase tracking-[0.14em]">{p.title}</p>
                        <p className="text-sm text-stone">{p.category}</p>
                        {p.available ? (
                          <p className="mt-1">
                            {inr(p.price)}
                            {p.compare_at_price && <span className="ml-2 text-sm text-stone line-through">{inr(p.compare_at_price)}</span>}
                          </p>
                        ) : (
                          <p className="mt-1 text-rust">Just sold out</p>
                        )}
                        {p.available && p.sizes_in_stock.length > 0 && p.sizes_in_stock[0] !== "Free Size" && (
                          <p className="text-xs text-stone">In stock: {p.sizes_in_stock.join(" · ")}</p>
                        )}
                        <a href={p.url} target="_blank" rel="noopener" className="mt-2 inline-block border-b border-charcoal pb-0.5 text-xs uppercase tracking-[0.18em]">
                          Shop on suta.in
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 flex justify-between text-sm"><span className="uppercase tracking-[0.2em] text-stone">The look</span><span>{inr(total)}</span></p>
              </div>
            </article>
          )
        })}
      </div>
      <p className="mt-24 text-xs text-stone">
        Every piece is a real Suta product; prices and stock are read live from the catalogue.{" "}
        <Link href="/made-for-you" className="underline underline-offset-2">Style another handle</Link>
      </p>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-ecru px-4 py-12 text-center text-charcoal sm:px-8">
      <Link href="/" aria-label="Suta lookbook"><Logo className="mx-auto h-10" /></Link>
      <div className="mx-auto mt-14 max-w-5xl">{children}</div>
    </main>
  )
}
