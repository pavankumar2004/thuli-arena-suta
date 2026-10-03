// Runs once when the Next.js server starts: open the stylist's database connections
// before the first shopper asks, so nobody waits on a cold connection.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { warm } = await import("@/lib/server/search")
  await Promise.all([warm(), warm()]).catch((err) => console.warn("[stylist] warm-up failed", err?.message))
}
