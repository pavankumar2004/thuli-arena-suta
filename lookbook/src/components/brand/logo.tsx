import { cn } from "@/lib/utils"

/**
 * Suta's needle-and-thread wordmark, used as a mask so it takes the current text colour
 * (ecru over photographs, charcoal on paper). Size it with a height class.
 */
export function Logo({ className, label = "Suta" }: { className?: string; label?: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      className={cn("inline-block aspect-[800/533] bg-current", className)}
      style={{
        WebkitMaskImage: "url(/brand/suta-logo.png)",
        maskImage: "url(/brand/suta-logo.png)",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  )
}
