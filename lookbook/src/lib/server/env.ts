import "server-only"

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

// Secrets live in the repo-root .env (shared with the Task 1 scraper) or in
// lookbook/.env.local. They are read here, on the server only, and never reach the
// client bundle: nothing in this module is NEXT_PUBLIC_.
const KEYS = ["DATABASE_URL", "OPENROUTER_API_KEY"] as const
type Key = (typeof KEYS)[number]

let loaded = false
function load() {
  if (loaded) return
  loaded = true
  for (const file of [resolve(process.cwd(), ".env.local"), resolve(process.cwd(), "../.env")]) {
    if (!existsSync(/*turbopackIgnore: true*/ file)) continue
    const text = readFileSync(/*turbopackIgnore: true*/ file, "utf8")
    for (const key of KEYS) {
      if (process.env[key]) continue
      const m = text.match(new RegExp(`^${key}\\s*=\\s*"?([^"\\r\\n]+)"?`, "m"))
      if (m) process.env[key] = m[1].trim()
    }
  }
}

export function env(key: Key): string {
  load()
  const value = process.env[key]
  if (!value) throw new Error(`${key} is not configured`)
  return value
}
