import type { ReactNode } from 'react'

/** A bento tile: white, a hairline, generous corners, a title row. */
export default function Card({ title, action, children, className = '', testId }: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  testId?: string
}) {
  return (
    <section data-testid={testId} className={`rounded-card border border-hairline bg-surface p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <header className="mb-3 flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {typeof title === 'string' ? <h2 className="text-[15px] font-semibold text-ink">{title}</h2> : title}
          {action && <div className="ml-auto">{action}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

/** A row of choices where one is on: Today | 7 days, Visitors | Pageviews, ... */
export function Segmented<T extends string>({ label, value, options, onChange, size = 'md', className = '' }: {
  label: string
  value: T | undefined
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={`inline-flex rounded-[10px] bg-track p-0.5 ${className}`}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg font-medium whitespace-nowrap transition-colors ${
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'
          } ${value === o.value
            ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(22_24_29/0.08),0_0_0_1px_rgb(22_24_29/0.04)]'
            : 'text-muted hover:text-ink'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
