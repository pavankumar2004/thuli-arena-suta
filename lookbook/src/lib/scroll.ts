import type Lenis from "lenis"

export const lenisRef: { current: Lenis | null } = { current: null }

/** Smooth-scroll to an element id, falling back to native scrolling without Lenis. */
export function scrollToId(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  if (lenisRef.current) lenisRef.current.scrollTo(el, { offset: -64 })
  else el.scrollIntoView({ behavior: "smooth", block: "start" })
}
