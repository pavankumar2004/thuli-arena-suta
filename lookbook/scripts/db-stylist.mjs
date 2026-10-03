// Applies db/stylist.sql to the Neon database in DATABASE_URL (env, lookbook/.env or ../.env).
//   npm run db:stylist

import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { neon } from "@neondatabase/serverless"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  for (const p of [resolve(root, ".env"), resolve(root, "../.env")]) {
    if (!existsSync(p)) continue
    const m = readFileSync(p, "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m)
    if (m) return m[1].trim()
  }
  throw new Error("DATABASE_URL is not set")
}

const sql = neon(databaseUrl())
const statements = readFileSync(resolve(root, "db/stylist.sql"), "utf8")
  .split(/;\s*$/m)
  .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
  .filter(Boolean)

for (const statement of statements) {
  const started = Date.now()
  await sql.query(statement)
  console.log(`${Date.now() - started}ms  ${statement.split("\n")[0]}`)
}
