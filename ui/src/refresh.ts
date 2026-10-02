// Keeping an open dashboard current: ask again every minute while the tab
// is visible, and at once when it comes back (another tab, a sleeping
// laptop, the installed app brought to the front).
import { useEffect, useRef } from 'react'

export const REFRESH_MS = 60_000

/**
 * Call `again` every REFRESH_MS while the tab is visible, and at once when
 * it becomes visible again. Not on mount: the page's own first load does
 * that. `enabled` false stops it.
 */
export function useRefresh(again: () => void, enabled = true): void {
  // The latest callback, so a re-render does not restart the timer.
  const latest = useRef(again)
  useEffect(() => { latest.current = again })

  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setInterval> | undefined
    const start = () => { if (!timer) timer = setInterval(() => latest.current(), REFRESH_MS) }
    const stop = () => { clearInterval(timer); timer = undefined }
    const onVisibility = () => {
      if (document.hidden) stop()
      else { latest.current(); start() }
    }
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [enabled])
}
