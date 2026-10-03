"use client"

import { useEffect } from "react"
import type Lenis from "lenis"
import { LazyMotion, MotionConfig, domAnimation } from "framer-motion"
import { useAnyOverlay, useOverlays, useSaved } from "@/store/lookbook"
import { lenisRef } from "@/lib/scroll"
import { whenIdle } from "@/lib/idle"

export function Providers({ children }: { children: React.ReactNode }) {
  const overlay = useAnyOverlay()

  useEffect(() => {
    useSaved.persist.rehydrate()
  }, [])

  // Momentum scrolling is for wheels and trackpads; touch scrolling is already smooth.
  // Lenis loads after the page is idle so it never competes with the first paint.
  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (!fine || reduced) return
    let lenis: Lenis | null = null
    let cancelled = false
    const cancelIdle = whenIdle(async () => {
      const { default: Lenis } = await import("lenis")
      if (cancelled) return
      lenis = new Lenis({ duration: 1.15, anchors: { offset: -64 }, autoRaf: true })
      lenisRef.current = lenis
      const { look, piece, tray, menu } = useOverlays.getState()
      if (look || piece || tray || menu) lenis.stop()
    })
    return () => {
      cancelled = true
      cancelIdle()
      lenis?.destroy()
      lenisRef.current = null
    }
  }, [])

  // Hand scrolling to the open sheet or dialog.
  useEffect(() => {
    const lenis = lenisRef.current
    if (!lenis) return
    if (overlay) lenis.stop()
    else lenis.start()
  }, [overlay])

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  )
}
