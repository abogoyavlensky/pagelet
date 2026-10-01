import { useState } from 'react'
import type { Period } from '../api'
import { periodLabel, utcDay } from '../format'
import Popover, { Chevron, MenuDivider, MenuItem } from './Popover'

const PRESETS = [{ period: 'today' }, { period: '7d' }, { period: '30d' }] as const

/**
 * The period: three presets and a custom range of UTC days. The page keys
 * this on the period, so Back and Forward reset the date fields too.
 */
export default function PeriodMenu({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const [picking, setPicking] = useState(false)
  const [from, setFrom] = useState(value.period === 'custom' ? value.from : utcDay(-6))
  const [to, setTo] = useState(value.period === 'custom' ? value.to : utcDay())
  const valid = from !== '' && to !== '' && from <= to
  const label = periodLabel(value)

  const field = 'num rounded-lg border border-hairline bg-paper px-2 py-1 text-sm text-ink outline-none focus-visible:outline-none focus:border-accent'

  return (
    <Popover label={`Period, ${label}`} align="right" className="px-1 text-sm text-ink" onOpen={() => setPicking(false)}
      trigger={<><span>{label}</span><Chevron /></>}>
      {(close) => picking ? (
        <form className="grid gap-3 p-2"
          onSubmit={(e) => { e.preventDefault(); if (valid) { onChange({ period: 'custom', from, to }); close() } }}>
          <label className="grid gap-1 text-muted">
            From
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={field} />
          </label>
          <label className="grid gap-1 text-muted">
            To
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={field} />
          </label>
          <div className="flex items-center justify-between gap-3 pt-1">
            <button type="button" onClick={() => setPicking(false)} className="text-muted transition-colors hover:text-ink">
              Back
            </button>
            <button type="submit" disabled={!valid}
              className="rounded-lg bg-ink px-3 py-1.5 font-medium text-paper transition-opacity disabled:opacity-40">
              Apply
            </button>
          </div>
          <p className="text-xs text-muted">Days are UTC</p>
        </form>
      ) : (
        <>
          {PRESETS.map((p) => (
            <MenuItem key={p.period} checked={value.period === p.period} onClick={() => onChange(p)}>
              {periodLabel(p)}
            </MenuItem>
          ))}
          <MenuDivider />
          <MenuItem keepOpen checked={value.period === 'custom'} onClick={() => setPicking(true)}>
            Custom range
          </MenuItem>
          <p className="px-3 pt-1.5 pb-1 text-xs text-muted">Days are UTC</p>
        </>
      )}
    </Popover>
  )
}
