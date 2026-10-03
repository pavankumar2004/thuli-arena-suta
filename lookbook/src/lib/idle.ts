/** Runs `fn` when the browser is idle (or after `timeout` ms). Returns a cancel function. */
export function whenIdle(fn: () => void, timeout = 3000) {
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(fn, { timeout })
    return () => window.cancelIdleCallback(id)
  }
  const id = setTimeout(fn, Math.min(timeout, 1500))
  return () => clearTimeout(id)
}
