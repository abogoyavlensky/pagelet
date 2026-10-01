import { useEffect, useRef, type ReactNode } from 'react'

/**
 * A modal over the dashboard: the tracking code, the site settings. The
 * native <dialog> keeps focus inside and closes on Escape; a click on the
 * backdrop closes it too. The body mounts only while open, so its forms
 * start fresh each time.
 */
export default function Dialog({ open, onClose, title, children }: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} aria-label={title} onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
      className="pop m-auto w-[min(34rem,calc(100vw-2rem))] rounded-pop border border-hairline bg-surface p-0 text-ink shadow-float">
      {open && (
        <div className="p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-base font-medium">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close"
              className="-mr-2 rounded-lg px-2 text-lg leading-none text-muted transition-colors hover:text-ink">
              ×
            </button>
          </div>
          <div className="mt-4">{children}</div>
        </div>
      )}
    </dialog>
  )
}
