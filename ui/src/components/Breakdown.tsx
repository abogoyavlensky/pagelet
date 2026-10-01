import { useState, type ReactNode } from 'react'
import type { EventRow, Row } from '../api'
import { count, share } from '../format'

const SHOWN = 5

type Unit = 'visitors' | 'pageviews'

/**
 * A top list in the open: no box and no row borders, a title, then one row
 * per entry with the entry's number over a thin accent rule as long as its
 * share of the longest; the rules are the list's only lines. The unit word in the header switches the number between
 * visitors and views; the order stays the server's (the top ten by
 * visitors), since re-ranking those ten by views would pass for a top ten
 * by views that it is not. Share lists (countries, devices) also show each
 * entry's percentage of the period's total. Five rows, then "Show N more".
 */
export default function Breakdown({ title, testId, rows, totals, label = (n) => n }: {
  title: ReactNode
  testId: string
  rows: Row[]
  totals?: { visitors: number; pageviews: number }
  label?: (name: string) => string
}) {
  const [unit, setUnit] = useState<Unit>('visitors')
  const other: Unit = unit === 'visitors' ? 'pageviews' : 'visitors'
  return (
    <List title={title} testId={testId}
      head={
        <button type="button" onClick={() => setUnit(other)}
          aria-label={other === 'pageviews' ? 'Show views' : 'Show visitors'}
          className="rounded-sm text-sm text-muted underline-offset-4 transition-colors hover:text-ink hover:underline focus-visible:underline">
          {unit === 'visitors' ? 'visitors' : 'views'}
        </button>
      }
      items={rows.map((r) => ({
        key: r.name,
        name: label(r.name),
        value: r[unit],
        cells: totals
          ? [<span key="n" className="num text-muted">{count(r[unit])}</span>,
             <span key="s" className="num w-11 text-right text-ink">{share(r[unit], totals[unit])}</span>]
          : [<span key="n" className="num text-ink">{count(r[unit])}</span>],
      }))} />
  )
}

/** Custom events: how many times each was sent, and by how many visitors. */
export function Events({ rows }: { rows: EventRow[] }) {
  return (
    <List title="Events" testId="events"
      head={
        <span className="flex gap-6 text-sm text-muted">
          <span>count</span>
          <span className="w-14 text-right">visitors</span>
        </span>
      }
      items={rows.map((e) => ({
        key: e.name,
        name: e.name,
        value: e.count,
        cells: [<span key="c" className="num text-ink">{count(e.count)}</span>,
                <span key="v" className="num w-14 text-right text-muted">{count(e.visitors)}</span>],
      }))} />
  )
}

type Item = { key: string; name: string; value: number; cells: ReactNode[] }

function List({ title, testId, head, items }: {
  title: ReactNode
  testId: string
  head: ReactNode
  items: Item[]
}) {
  const [all, setAll] = useState(false)
  const max = Math.max(1, ...items.map((i) => i.value))
  const shown = all ? items : items.slice(0, SHOWN)
  return (
    <section data-testid={`panel-${testId}`}>
      <header className="flex items-baseline justify-between gap-4 pb-2">
        <h2 className="font-medium text-ink">{title}</h2>
        {items.length > 0 && head}
      </header>
      {items.length === 0 ? (
        <p className="py-2 text-sm text-muted">Nothing in this period</p>
      ) : (
        <>
          <ol>
            {shown.map((i) => (
              <li key={i.key} className="relative flex items-baseline gap-6 pt-1.5 pb-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-ink" title={i.name}>{i.name}</span>
                {i.cells}
                <span aria-hidden className="absolute bottom-0 left-0 h-0.5 rounded-full bg-accent/45"
                  style={{ width: `${(i.value / max) * 100}%` }} />
              </li>
            ))}
          </ol>
          {items.length > SHOWN && (
            <button type="button" onClick={() => setAll(!all)}
              className="mt-2 text-sm text-muted underline-offset-4 transition-colors hover:text-ink hover:underline">
              {all ? 'Show fewer' : `Show ${items.length - SHOWN} more`}
            </button>
          )}
        </>
      )}
    </section>
  )
}
