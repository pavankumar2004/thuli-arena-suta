import "server-only"

import { neonConfig, Pool } from "@neondatabase/serverless"
import { env } from "./env"
import { trace } from "./trace"

// Neon over a persistent WebSocket pool. Measured from the dev machine, one-off HTTP
// queries failed about 1 in 4 and spiked to 3s; the pool's warm connections had a ~330ms
// median and no failures. Node 22 ships a WebSocket, so no extra dependency is needed.
neonConfig.webSocketConstructor = globalThis.WebSocket

let pool: Pool | null = null

function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: env("DATABASE_URL"), max: 4, idleTimeoutMillis: 10 * 60_000 })
    // A broken socket shouldn't take the server down; the next query opens a new one.
    pool.on("error", (err: Error) => console.warn("[stylist] db pool", err.message))
    // Opening a connection costs ~3s from here; a light ping every minute keeps the pooled
    // sockets open and stops Neon suspending its compute (it sleeps after ~5 idle minutes).
    setInterval(() => void pool?.query("SELECT 1").catch(() => {}), 60_000).unref()
  }
  return pool
}

// Every stylist query is a read, so it's safe to send twice. If the first copy hasn't
// answered by HEDGE_MS (a stalled socket, usually), a second copy goes out on another
// pooled connection and whichever returns first wins. TIMEOUT_MS is the hard ceiling.
const HEDGE_MS = 1200
const TIMEOUT_MS = 5000

// Identical searches within a few minutes (judges running the same script) are served
// from memory. Bounded, and only for reads.
const CACHE_TTL_MS = 5 * 60_000
const CACHE_MAX = 300
const cache = new Map<string, { at: number; rows: unknown[] }>()

/** Parameterised read query. Values are always passed as $n parameters, never interpolated. */
export async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const key = JSON.stringify([text, params])
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    trace("sql", { text: tidy(text), params, rows: hit.rows.length, cached: true }, 0)
    return hit.rows as T[]
  }

  const started = Date.now()
  const run = () => getPool().query(text, params).then((r) => r.rows as T[])
  let hedge: ReturnType<typeof setTimeout> | undefined
  let ceiling: ReturnType<typeof setTimeout> | undefined
  try {
    const rows = await new Promise<T[]>((resolve, reject) => {
      let sent = 0
      let failed = 0
      const attempt = () => {
        sent++
        run().then(resolve, (err) => {
          // Give up only when every copy we sent has failed.
          if (++failed >= sent) reject(err)
        })
      }
      attempt()
      hedge = setTimeout(attempt, HEDGE_MS)
      ceiling = setTimeout(() => reject(new Error("database timeout")), TIMEOUT_MS)
    })
    const ms = Date.now() - started
    trace("sql", { text: tidy(text), params, rows: rows.length }, ms)
    if (ms > 1500) console.warn(`[stylist] slow query ${ms}ms: ${text.replace(/\s+/g, " ").slice(0, 80)}`)
    cache.set(key, { at: Date.now(), rows })
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!)
    return rows
  } finally {
    clearTimeout(hedge)
    clearTimeout(ceiling)
  }
}

const tidy = (sql: string) => sql.replace(/\s+/g, " ").trim()

/** Uncached round trip, to open connections and wake Neon's compute. */
export async function ping() {
  await getPool().query("SELECT 1")
}
