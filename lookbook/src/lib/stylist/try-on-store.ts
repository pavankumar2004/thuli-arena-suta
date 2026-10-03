// Try-on images, kept in this browser's IndexedDB so a shopper who closes the fitting room
// (or reloads) can still find and download them from the chat. They never leave the device.
// Every call is best-effort: private windows or blocked storage just mean nothing is kept.

export interface SavedTryOn {
  id: string
  handle: string
  title: string
  url: string
  image: string // data URL
  createdAt: number
}

const DB = "suta-stylist"
const STORE = "try-ons"
const KEEP = 12

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open()
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req ? req.result : undefined)
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function saveTryOn(t: SavedTryOn) {
  try {
    await run("readwrite", (s) => s.put(t))
    const all = (await run<SavedTryOn[]>("readonly", (s) => s.getAll())) ?? []
    const old = all.sort((a, b) => b.createdAt - a.createdAt).slice(KEEP)
    if (old.length) await run("readwrite", (s) => old.forEach((o) => s.delete(o.id)))
  } catch {}
}

export async function loadTryOn(id: string): Promise<SavedTryOn | null> {
  try {
    return (await run<SavedTryOn>("readonly", (s) => s.get(id))) ?? null
  } catch {
    return null
  }
}

export async function clearTryOns() {
  try {
    await run("readwrite", (s) => s.clear())
  } catch {}
}
