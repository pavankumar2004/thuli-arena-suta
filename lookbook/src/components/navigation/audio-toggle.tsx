"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

type Ambience = { start: () => void; stop: () => void }

/** Rain and tanpura, off until asked for. Four bars that breathe while it plays. */
export function AudioToggle() {
  const [on, setOn] = useState(false)
  const ambience = useRef<Ambience | null>(null)

  useEffect(() => () => ambience.current?.stop(), [])

  const toggle = async () => {
    if (!ambience.current) {
      const { createAmbience } = await import("@/lib/ambience")
      ambience.current = createAmbience()
    }
    if (on) ambience.current.stop()
    else ambience.current.start()
    setOn(!on)
  }

  return (
    <button
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? "Mute the rain and tanpura" : "Play rain and tanpura"}
      title={on ? "Mute" : "Rain & tanpura"}
      className="flex h-10 items-center gap-2 rounded-full px-3 transition-colors hover:bg-current/10"
    >
      <span className="flex h-3.5 items-end gap-[2px]" aria-hidden>
        {[0.55, 1, 0.7, 0.4].map((h, i) => (
          <span
            key={i}
            className={cn("w-[2px] origin-bottom bg-current transition-transform duration-500")}
            style={{
              height: "100%",
              transform: `scaleY(${on ? h : 0.2})`,
              animation: on ? `eq ${0.9 + i * 0.25}s ease-in-out ${i * 0.12}s infinite` : undefined,
            }}
          />
        ))}
      </span>
      <span className="eyebrow hidden sm:inline">{on ? "Sound on" : "Sound"}</span>
    </button>
  )
}
