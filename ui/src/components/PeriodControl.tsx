import { useState } from 'react'
import type { Period } from '../api'
import { localDay, periodLabel, zone } from '../format'
import Popover from './Popover'

// Each preset with its short label for the narrowest phones.
const PRESETS = [
  { period: 'today', long: 'Today', short: 'Today' },
  { period: '7d', long: '7 days', short: '7d' },
  { period: '30d', long: '30 days', short: '30d' },
] as const

const segment = (on: boolean) =>
  `flex h-8 w-full flex-auto items-center justify-center rounded-lg px-2.5 text-sm font-medium whitespace-nowrap transition-colors sm:px-3 ${
    on ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(22_24_29/0.08),0_0_0_1px_rgb(22_24_29/0.04)]' : 'text-muted hover:text-ink'}`

/**
 * The period as one row of four segments: three presets and "Custom", which
 * opens two date fields (days in the browser's zone) and then shows the chosen range in its
 * place. The page keys this on the period, so Back and Forward reset the
 * date fields too.
 */
export default function PeriodControl({ value, onChange, className = '' }: {
  value: Period
  onChange: (p: Period) => void
  className?: string
}) {
  const [from, setFrom] = useState(value.period === 'custom' ? value.from : localDay(-6))
  const [to, setTo] = useState(value.period === 'custom' ? value.to : localDay())
  const valid = from !== '' && to !== '' && from <= to
  const custom = value.period === 'custom'
  // iOS Safari gives date inputs an intrinsic minimum width and centres the
  // value; without its native appearance and with min-w-0 they fit the popup.
  const field = 'num block h-10 w-full min-w-0 max-w-full appearance-none rounded-lg border border-hairline bg-paper px-2.5 text-sm text-ink outline-none focus-visible:outline-none focus:border-accent [&::-webkit-date-and-time-value]:text-left'

  return (
    <div role="group" aria-label="Period" className={`flex items-center gap-0.5 rounded-[10px] bg-track p-0.5 ${className}`}>
      {PRESETS.map((p) => (
        <button key={p.period} type="button" aria-pressed={value.period === p.period}
          onClick={() => onChange({ period: p.period })} className={`${segment(value.period === p.period)} sm:w-auto`}>
          <span className="min-[360px]:hidden">{p.short}</span>
          <span className="hidden min-[360px]:inline">{p.long}</span>
        </button>
      ))}
      <Popover label={custom ? `Custom range, ${periodLabel(value)}` : 'Custom range'} align="right" role="dialog"
        wrapperClassName="flex flex-auto" className={`${segment(custom)} py-0 sm:w-auto`}
        trigger={<span>{custom ? periodLabel(value) : 'Custom'}</span>}>
        {(close) => (
          <form className="grid w-64 max-w-full grid-cols-1 gap-3 p-2"
            onSubmit={(e) => { e.preventDefault(); if (valid) { onChange({ period: 'custom', from, to }); close() } }}>
            <label className="grid min-w-0 gap-1 text-sm text-muted">
              From
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={field} />
            </label>
            <label className="grid min-w-0 gap-1 text-sm text-muted">
              To
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={field} />
            </label>
            <button type="submit" disabled={!valid}
              className="rounded-lg bg-ink py-2 text-sm font-medium text-paper transition-opacity disabled:opacity-40">
              Show this range
            </button>
            <p className="text-xs text-muted">Days are in {zone()} time.</p>
          </form>
        )}
      </Popover>
    </div>
  )
}
