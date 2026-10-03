import { Logo } from "./logo"

/**
 * Opening curtain: the needle draws the wordmark, then the curtain lifts.
 * Pure CSS (see .intro-* in globals.css), so it plays before any JavaScript runs and
 * never blocks the page underneath; reduced-motion visitors skip it.
 */
export function Intro() {
  return (
    <div aria-hidden className="intro-curtain fixed inset-0 z-[70] flex flex-col items-center justify-center bg-ink text-ecru">
      <div className="intro-logo">
        <Logo className="h-28 sm:h-36" label="" />
      </div>
      <p className="intro-line eyebrow mt-8 text-ecru/70">presents · Utsav</p>
    </div>
  )
}
