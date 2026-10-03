"use client"

import { Bookmark } from "lucide-react"
import { cn } from "@/lib/utils"
import { useSaved } from "@/store/lookbook"

export function SaveButton({
  kind,
  id,
  label,
  className,
  withText = false,
}: {
  kind: "look" | "piece"
  id: string
  label: string
  className?: string
  withText?: boolean
}) {
  const saved = useSaved((s) => (kind === "look" ? s.looks : s.pieces).includes(id))
  const toggle = useSaved((s) => (kind === "look" ? s.toggleLook : s.togglePiece))
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        toggle(id)
      }}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${label} from your almanac` : `Save ${label} to your almanac`}
      className={cn(
        "inline-flex items-center gap-2 rounded-full p-2 transition-colors hover:bg-current/10",
        withText && "px-3",
        className,
      )}
    >
      <Bookmark className={cn("size-[18px] transition-all", saved && "fill-rust text-rust")} strokeWidth={1.5} />
      {withText && <span className="text-xs">{saved ? "Kept" : "Keep"}</span>}
    </button>
  )
}
