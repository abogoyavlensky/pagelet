import { useState } from 'react'
import type { Period } from '../api'
import { utcDay } from '../format'

const PRESETS = [
  { period: 'today', label: 'Today' },
  { period: '7d', label: '7 days' },
  { period: '30d', label: '30 days' },
] as const

export default function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const [from, setFrom] = useState(value.period === 'custom' ? value.from : utcDay(-6))
  const [to, setTo] = useState(value.period === 'custom' ? value.to : utcDay())
  // Custom mode follows the URL, plus a local flag for "Custom clicked, not
  // applied yet"; the page keys this component on the period, so the date
  // fields also reset when Back or Forward changes it.
  const [picking, setPicking] = useState(false)
  const custom = picking || value.period === 'custom'
  const valid = from !== '' && to !== '' && from <= to

  const tab = (active: boolean) =>
    `relative px-3 py-1.5 text-sm transition-colors ${
      active ? 'text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-accent' : 'text-muted hover:text-ink'
    }`

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
      <div role="group" aria-label="Period" className="flex border-b border-hairline">
        {PRESETS.map((p) => (
          <button key={p.period} aria-pressed={!custom && value.period === p.period}
            onClick={() => { setPicking(false); onChange({ period: p.period }) }}
            className={tab(!custom && value.period === p.period)}>
            {p.label}
          </button>
        ))}
        <button aria-pressed={custom} onClick={() => setPicking(true)} className={tab(custom)}>
          Custom
        </button>
      </div>
      {custom && (
        <form className="flex items-center gap-2 text-sm"
          onSubmit={(e) => { e.preventDefault(); if (valid) onChange({ period: 'custom', from, to }) }}>
          <input type="date" aria-label="From" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
            className="num border-b border-hairline bg-transparent px-1 py-1 outline-none focus:border-accent" />
          <span className="text-muted">to</span>
          <input type="date" aria-label="To" value={to} min={from} onChange={(e) => setTo(e.target.value)}
            className="num border-b border-hairline bg-transparent px-1 py-1 outline-none focus:border-accent" />
          <button type="submit" disabled={!valid}
            className="ml-1 px-2 py-1 text-accent transition-colors hover:bg-accent-soft disabled:opacity-40">
            Apply
          </button>
        </form>
      )}
    </div>
  )
}
