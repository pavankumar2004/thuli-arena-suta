import "server-only"
import { neon, type NeonQueryFunction } from "@neondatabase/serverless"

// Neon's HTTP driver: one fetch per query, no sockets to keep alive, so it suits
// serverless functions (and runs on Node 20 locally, where WebSocket isn't built in).
let client: NeonQueryFunction<false, false> | null = null

export function sql() {
  if (!client) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error("DATABASE_URL is not set")
    client = neon(url)
  }
  return client
}
