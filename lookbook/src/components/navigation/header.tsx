"use client"

import { useEffect, useState } from "react"
import { Bookmark, Menu } from "lucide-react"
import { cn } from "@/lib/utils"
import { scrollToId } from "@/lib/scroll"
import { useOverlays, useSaved } from "@/store/lookbook"
import { AudioToggle } from "./audio-toggle"
import { Logo } from "@/components/brand/logo"

interface NavChapter {
  id: string
  numeral: string
  name: string
}

export function Header({ chapters }: { chapters: NavChapter[] }) {
  const [solid, setSolid] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const saved = useSaved((s) => s.looks.length + s.pieces.length)
  const setTray = useOverlays((s) => s.setTray)
  const setMenu = useOverlays((s) => s.setMenu)

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > window.innerHeight * 0.7)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    const sections = [...chapters.map((c) => c.id), "prologue", "index"]
      .map((id) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[]
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id)
      },
      { rootMargin: "-45% 0px -50% 0px" },
    )
    sections.forEach((s) => io.observe(s))
    return () => io.disconnect()
  }, [chapters])

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 transition-[background-color,color,box-shadow] duration-500",
        solid
          ? "bg-ecru/90 text-charcoal shadow-[0_1px_0_0_var(--color-border)] backdrop-blur-md"
          : "bg-transparent text-ecru",
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-8">
        <button onClick={() => scrollToId("top")} className="flex items-center gap-4" title="Back to the cover">
          <Logo className="h-9" label="Suta" />
          <span className={cn("eyebrow hidden transition-opacity duration-500 sm:inline", solid ? "opacity-60" : "opacity-0")}>Utsav</span>
        </button>

        {/* Kept off the cover so the landing stays quiet; it arrives once you start reading. */}
        <nav
          aria-label="Chapters"
          className={cn("hidden transition-opacity duration-500 lg:block", solid ? "opacity-100" : "pointer-events-none opacity-0")}
        >
          <ul className="flex items-center gap-6">
            {chapters.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => scrollToId(c.id)}
                  className={cn(
                    "group flex items-baseline gap-1.5 py-2 text-[0.8rem] tracking-wide transition-opacity",
                    active === c.id ? "opacity-100" : "opacity-60 hover:opacity-100",
                  )}
                  aria-current={active === c.id ? "true" : undefined}
                >
                  <span className="font-display text-sm italic">{c.numeral}</span>
                  <span className="relative">
                    {c.name}
                    <span
                      className={cn(
                        "absolute -bottom-1 left-0 h-px bg-current transition-all duration-500",
                        active === c.id ? "w-full" : "w-0 group-hover:w-full",
                      )}
                    />
                  </span>
                </button>
              </li>
            ))}
            <li>
              <button
                onClick={() => scrollToId("index")}
                className={cn("eyebrow py-2 transition-opacity", active === "index" ? "opacity-100" : "opacity-60 hover:opacity-100")}
              >
                Index
              </button>
            </li>
          </ul>
        </nav>

        <div className="flex items-center gap-1">
          <AudioToggle />
          <button
            onClick={() => setTray(true)}
            className="relative flex size-10 items-center justify-center rounded-full transition-colors hover:bg-current/10"
            aria-label={saved > 0 ? "Your almanac (has saved looks)" : "Your almanac"}
          >
            <Bookmark className="size-[18px]" strokeWidth={1.5} />
            {saved > 0 && <span className="absolute top-2 right-2 size-1.5 rounded-full bg-rust" />}
          </button>
          <button
            onClick={() => setMenu(true)}
            className="flex size-10 items-center justify-center rounded-full transition-colors hover:bg-current/10 lg:hidden"
            aria-label="Open chapters"
          >
            <Menu className="size-5" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </header>
  )
}
