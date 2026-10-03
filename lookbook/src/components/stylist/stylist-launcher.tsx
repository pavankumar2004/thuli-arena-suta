"use client"

import dynamic from "next/dynamic"
import { useState } from "react"
import { AnimatePresence, m } from "framer-motion"
import { Sparkles } from "lucide-react"
import { useOverlays } from "@/store/lookbook"

// The panel, its cards and the fitting room load on first open, not with the page.
const StylistPanel = dynamic(() => import("./stylist-panel").then((x) => x.StylistPanel), { ssr: false })

/** A quiet floating button: "Ask the stylist". */
export function StylistLauncher() {
  const open = useOverlays((s) => s.stylist)
  const setOpen = useOverlays((s) => s.setStylist)
  const [loaded, setLoaded] = useState(false)

  return (
    <>
      <AnimatePresence>
        {!open && (
          <m.button
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.6 }}
            onClick={() => {
              setLoaded(true)
              setOpen(true)
            }}
            onPointerEnter={() => setLoaded(true)}
            className="group fixed right-4 bottom-4 z-40 flex items-center gap-2.5 rounded-full bg-ink py-3 pr-5 pl-4 text-ecru shadow-[0_16px_40px_-12px_rgba(28,42,58,0.65)] transition-colors hover:bg-charcoal sm:right-6 sm:bottom-6"
          >
            <Sparkles className="size-4 text-haldi transition-transform duration-500 group-hover:rotate-12" strokeWidth={1.5} />
            <span className="font-display text-lg leading-none italic">Ask the stylist</span>
          </m.button>
        )}
      </AnimatePresence>
      {(loaded || open) && <StylistPanel />}
    </>
  )
}
