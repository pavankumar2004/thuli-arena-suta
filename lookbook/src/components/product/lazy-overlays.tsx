"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { useAnyOverlay } from "@/store/lookbook"
import { whenIdle } from "@/lib/idle"

// Drawers, dialogs and the full product data load once the page is idle, or the
// moment someone opens one, whichever comes first. They are not needed to read.
const Overlays = dynamic(() => import("./overlays").then((m) => m.Overlays), { ssr: false })

export function LazyOverlays() {
  const wanted = useAnyOverlay()
  const [idle, setIdle] = useState(false)
  useEffect(() => whenIdle(() => setIdle(true), 3500), [])
  return idle || wanted ? <Overlays /> : null
}
