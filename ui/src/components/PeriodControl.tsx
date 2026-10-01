import { useState } from 'react'
import type { Period } from '../api'
import { periodLabel, utcDay } from '../format'
import { Segmented } from './Card'
import Popover from './Popover'

type Preset = 'today' | '7d' | '30d'
const OPTIONS: { value: Preset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
]

/**
 * The period, always visible: three presets side by side, then a custom
 * range of UTC days in a small popover. The page keys this on the period,
 * so Back and Forward reset the date fields too.
 */
export default function PeriodControl({ value, onChange, className = '' }: {
  value: Period
  onChange: (p: Period) => void
  className?: string
}) {
  const [from, setFrom] = useState(value.period === 'custom' ? value.from : utcDay(-6))
  const [to, setTo] = useState(value.period === 'custom' ? value.to : utcDay())
  const valid = from !== '' && to !== '' && from <= to
  const custom = value.period === 'custom'
  const field = 'num w-full rounded-lg border border-hairline bg-paper px-2.5 py-1.5 text-sm text-ink outline-none focus-visible:outline-none focus:border-accent'

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <Segmented label="Period" value={custom ? undefined : value.period} options={OPTIONS}
        onChange={(p) => onChange({ period: p })} className="flex-1 sm:flex-none" />
      <Popover label="Custom range" align="right" role="dialog"
        className={`h-9 rounded-[10px] px-3 text-sm font-medium ${custom
          ? 'bg-surface text-ink ring-1 ring-hairline'
          : 'bg-track text-muted hover:text-ink'}`}
        trigger={<span className="whitespace-nowrap">{custom ? periodLabel(value) : 'Custom'}</span>}>
        {(close) => (
          <form className="grid w-60 gap-3 p-2"
            onSubmit={(e) => { e.preventDefault(); if (valid) { onChange({ period: 'custom', from, to }); close() } }}>
            <label className="grid gap-1 text-sm text-muted">
              From
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={field} />
            </label>
            <label className="grid gap-1 text-sm text-muted">
              To
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={field} />
            </label>
            <button type="submit" disabled={!valid}
              className="rounded-lg bg-ink py-2 text-sm font-medium text-paper transition-opacity disabled:opacity-40">
              Show this range
            </button>
            <p className="text-xs text-muted">Days are UTC.</p>
          </form>
        )}
      </Popover>
    </div>
  )
}
