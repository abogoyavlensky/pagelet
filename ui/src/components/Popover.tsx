import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'

const CloseContext = createContext<() => void>(() => {})

/**
 * A button that opens a small panel under it: the site switcher, the period,
 * who is online, the site actions. Outside pointer-down, Escape and choosing
 * an item close it; Escape hands focus back to the button. As a menu, the
 * arrow keys move between items and the first one takes focus on open.
 */
export default function Popover({
  label,
  trigger,
  children,
  align = 'left',
  role = 'menu',
  className = '',
  testId,
  onOpen,
}: {
  label: string
  trigger: ReactNode
  children: ReactNode | ((close: () => void) => ReactNode)
  align?: 'left' | 'right'
  role?: 'menu' | 'dialog'
  className?: string
  testId?: string
  onOpen?: () => void
}) {
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const id = useId()
  const [shift, setShift] = useState(0)
  const close = () => setOpen(false)

  // On a narrow screen the trigger's row wraps, so a panel aligned to it
  // can stick out of the viewport; nudge it back inside, 8px from the edge.
  useLayoutEffect(() => {
    if (!open || !panel.current) { setShift(0); return }
    const { left, right } = panel.current.getBoundingClientRect()
    const edge = 8
    if (left < edge) setShift(edge - left)
    else if (right > window.innerWidth - edge) setShift(window.innerWidth - edge - right)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        button.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    panel.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const onArrows = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const items = [...(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    if (items.length === 0) return
    e.preventDefault()
    const at = items.indexOf(document.activeElement as HTMLElement)
    const next = e.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length
    items[next].focus()
  }

  return (
    <div ref={wrapper} className="relative">
      <button ref={button} type="button" aria-label={label} aria-haspopup={role} aria-expanded={open}
        aria-controls={open ? id : undefined} data-testid={testId}
        onClick={() => { if (!open) onOpen?.(); setOpen(!open) }}
        className={`flex items-center gap-1.5 rounded-lg py-1 transition-colors hover:text-ink ${className}`}>
        {trigger}
      </button>
      {open && (
        <div ref={panel} id={id} role={role} aria-label={label} onKeyDown={onArrows}
          style={shift ? { translate: `${shift}px 0` } : undefined}
          className={`pop absolute top-full z-20 mt-2 max-w-[calc(100vw-1rem)] min-w-56 rounded-pop border border-hairline bg-surface p-1.5 text-sm shadow-float ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}>
          <CloseContext.Provider value={close}>
            {typeof children === 'function' ? children(close) : children}
          </CloseContext.Provider>
        </div>
      )}
    </div>
  )
}

const item = 'flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-ink transition-colors hover:bg-accent-soft focus-visible:bg-accent-soft focus-visible:outline-none'

/**
 * One choice in a menu: a link (`to`) or a button (`onClick`). Choosing it
 * closes the menu, unless it only changes what the menu shows (`keepOpen`).
 */
export function MenuItem({ to, onClick, checked, keepOpen, children }: {
  to?: string
  onClick?: () => void
  checked?: boolean
  keepOpen?: boolean
  children: ReactNode
}) {
  const close = useContext(CloseContext)
  const body = (
    <>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {checked !== undefined && (
        <span aria-hidden className={`text-xs ${checked ? 'text-ink' : 'invisible'}`}>✓</span>
      )}
    </>
  )
  if (to) {
    return (
      <Link to={to} role="menuitem" aria-current={checked ? 'page' : undefined} className={item}
        onClick={() => { close(); onClick?.() }}>
        {body}
      </Link>
    )
  }
  return (
    <button type="button" role="menuitem" aria-checked={checked} className={item}
      onClick={() => { if (!keepOpen) close(); onClick?.() }}>
      {body}
    </button>
  )
}

export function MenuDivider() {
  return <div role="separator" className="my-1.5 h-px bg-hairline" />
}

/** The small chevron after a menu button's text. */
export function Chevron() {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className="size-3 text-faint">
      <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
