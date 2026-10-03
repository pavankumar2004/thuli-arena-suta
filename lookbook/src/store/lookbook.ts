"use client"

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

// What the visitor has saved. Lives in localStorage; if storage is unavailable
// (private window, blocked site data) the page still works, it just forgets.
interface Saved {
  looks: string[]
  pieces: string[]
  toggleLook: (id: string) => void
  togglePiece: (handle: string) => void
  clear: () => void
}

const toggle = (list: string[], item: string) =>
  list.includes(item) ? list.filter((x) => x !== item) : [...list, item]

const safeStorage = createJSONStorage(() => {
  try {
    const probe = "__suta_probe__"
    window.localStorage.setItem(probe, probe)
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    const memory = new Map<string, string>()
    return {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => void memory.set(k, v),
      removeItem: (k: string) => void memory.delete(k),
    }
  }
})

export const useSaved = create<Saved>()(
  persist(
    (set) => ({
      looks: [],
      pieces: [],
      toggleLook: (id) => set((s) => ({ looks: toggle(s.looks, id) })),
      togglePiece: (handle) => set((s) => ({ pieces: toggle(s.pieces, handle) })),
      clear: () => set({ looks: [], pieces: [] }),
    }),
    { name: "suta-utsav-saved", storage: safeStorage, skipHydration: true },
  ),
)

// Which overlay is open. One look sheet, one product dialog, one tray.
interface Overlays {
  look: string | null
  piece: string | null
  tray: boolean
  menu: boolean
  stylist: boolean
  openLook: (id: string | null) => void
  openPiece: (handle: string | null) => void
  setTray: (open: boolean) => void
  setMenu: (open: boolean) => void
  setStylist: (open: boolean) => void
}

export const useOverlays = create<Overlays>()((set) => ({
  look: null,
  piece: null,
  tray: false,
  menu: false,
  stylist: false,
  openLook: (look) => set({ look }),
  openPiece: (piece) => set({ piece }),
  setTray: (tray) => set({ tray }),
  setMenu: (menu) => set({ menu }),
  setStylist: (stylist) => set({ stylist }),
}))

export const useAnyOverlay = () => useOverlays((s) => Boolean(s.look || s.piece || s.tray || s.menu || s.stylist))
