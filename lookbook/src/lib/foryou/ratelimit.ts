import "server-only"
import { sql } from "./db"

const PER_IP = 5            // new lookbooks per IP per window
const WINDOW_MINUTES = 10
const MAX_RUNNING = 6       // across everyone: Instagram and the model bill are shared

/** Returns a reason string when the request should be refused, else null. */
export async function limit(ip: string): Promise<string | null> {
  const db = sql()
  const [{ running }] = await db.query(
    `SELECT count(*)::int AS running FROM personal_lookbooks
     WHERE status = 'running' AND created_at > now() - interval '2 minutes'`)
  if (running >= MAX_RUNNING) return "We're styling a lot of people right now. Please try again in a minute."
  const [{ hits }] = await db.query(
    `INSERT INTO rate_limits (key, bucket, hits)
     VALUES ($1, date_bin($2::interval, now(), timestamptz '2026-01-01'), 1)
     ON CONFLICT (key, bucket) DO UPDATE SET hits = rate_limits.hits + 1
     RETURNING hits`,
    [`foryou:${ip}`, `${WINDOW_MINUTES} minutes`])
  return hits > PER_IP ? "You've made a few lookbooks already. Please try again in a few minutes." : null
}
