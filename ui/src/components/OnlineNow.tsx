import { useEffect, useState } from 'react'
import { api } from '../api'
import { count } from '../format'

const EVERY_MS = 15_000

/** Visitors in the last five minutes, polled every 15 s while the tab is visible. */
export default function OnlineNow({ siteId }: { siteId: string }) {
  const [online, setOnline] = useState<number>()

  useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setInterval> | undefined
    const poll = () => api.realtime(siteId).then((r) => { if (live) setOnline(r.online) }, () => {})
    const start = () => { if (!timer) { poll(); timer = setInterval(poll, EVERY_MS) } }
    const stop = () => { clearInterval(timer); timer = undefined }
    const onVisibility = () => (document.hidden ? stop() : start())
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => { live = false; stop(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [siteId])

  const n = online ?? 0
  return (
    <p className="flex items-center gap-2.5 text-sm" aria-live="polite" data-testid="online-now">
      <span className={`relative inline-block size-2 rounded-full ${n > 0 ? 'pulse bg-accent' : 'bg-hairline'}`} />
      <span className={n > 0 ? 'text-ink' : 'text-muted'}>
        <span className="num font-medium">{online === undefined ? '–' : count(n)}</span> online now
      </span>
    </p>
  )
}
