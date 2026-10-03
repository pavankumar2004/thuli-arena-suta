import { sql } from "@/lib/foryou/db"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// A person's photo, only when a finished lookbook cites it. Ids are random; there is no
// way to list photos or fetch them by handle.
export async function GET(_request: Request, ctx: RouteContext<"/api/foryou/photo/[id]">) {
  const { id } = await ctx.params
  if (!UUID.test(id)) return new Response("Not found", { status: 404 })
  const rows = await sql().query(
    `SELECT encode(ph.image, 'base64') AS image FROM ig_photos ph
     WHERE ph.id = $1 AND EXISTS (
       SELECT 1 FROM personal_lookbooks l
       WHERE l.status = 'done' AND l.looks @> jsonb_build_array(jsonb_build_object('photo_id', $1::text)))`,
    [id])
  if (!rows.length) return new Response("Not found", { status: 404 })
  return new Response(Buffer.from(rows[0].image as string, "base64"), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400, immutable" },
  })
}
