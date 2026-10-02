import { useState, type ReactNode } from 'react'
import type { EventRow, PageRow, Row } from '../api'
import { count, duration, share } from '../format'
import Card from './Card'

const SHOWN = 7

type Item = { key: string; name: string; bar: number; cells: ReactNode[] }

/**
 * A top list on a card: column labels in the header, then rows over soft
 * bars as long as each row's visitors against the top one. Seven rows,
 * then "Show all".
 */
function List({ title, testId, columns, items, className = '' }: {
  title: ReactNode
  testId: string
  columns: string[]
  items: Item[]
  className?: string
}) {
  const [all, setAll] = useState(false)
  const max = Math.max(1, ...items.map((i) => i.bar))
  const shown = all ? items : items.slice(0, SHOWN)
  return (
    <Card className={className} testId={`panel-${testId}`} title={title}
      action={items.length > 0 && (
        <span className="flex gap-1 text-xs font-medium text-muted">
          {columns.map((c) => <span key={c} className="w-16 text-right">{c}</span>)}
        </span>
      )}>
      {items.length === 0 ? (
        <p className="rounded-xl bg-paper px-3 py-6 text-center text-sm text-muted">Nothing in this period</p>
      ) : (
        <>
          <ol className="grid grid-cols-1 gap-1">
            {shown.map((i) => (
              <li key={i.key} className="relative flex h-9 items-center gap-1 text-sm">
                <span aria-hidden className="absolute inset-y-0 left-0 rounded-lg bg-visitors-soft"
                  style={{ width: `${Math.max(2, (i.bar / max) * 100)}%` }} />
                <span className="relative min-w-0 flex-1 truncate px-2.5 text-ink" title={i.name}>{i.name}</span>
                {i.cells}
              </li>
            ))}
          </ol>
          {items.length > SHOWN && (
            <button type="button" onClick={() => setAll(!all)}
              className="mt-2 w-full rounded-lg py-1.5 text-sm font-medium text-muted transition-colors hover:bg-paper hover:text-ink">
              {all ? 'Show fewer' : `Show all ${items.length}`}
            </button>
          )}
        </>
      )}
    </Card>
  )
}

const cell = (key: string, v: ReactNode, strong = true) => (
  <span key={key} className={`num relative w-16 text-right ${strong ? 'font-medium text-ink' : 'text-muted'}`}>{v}</span>
)

/** Pages, sources and the like: visitors and views for each. */
export default function Breakdown({ title, testId, rows, label = (n) => n, share: whole, className }: {
  title: ReactNode
  testId: string
  rows: Row[]
  label?: (name: string) => string
  /** Total visitors: show each row's share of them instead of its views. */
  share?: number
  className?: string
}) {
  return (
    <List title={title} testId={testId} className={className}
      columns={whole === undefined ? ['Visitors', 'Views'] : ['Visitors', 'Share']}
      items={rows.map((r) => ({
        key: r.name,
        name: label(r.name),
        bar: r.visitors,
        cells: [cell('v', count(r.visitors)),
          whole === undefined ? cell('p', count(r.pageviews), false) : cell('s', share(r.visitors, whole), false)],
      }))} />
  )
}

/** Top pages: visitors, views, and the visible time per measured visitor ("–" when none). */
export function Pages({ rows, className }: { rows: PageRow[]; className?: string }) {
  return (
    <List title="Pages" testId="pages" className={className} columns={['Visitors', 'Views', 'Time']}
      items={rows.map((r) => ({
        key: r.name,
        name: r.name,
        bar: r.visitors,
        cells: [cell('v', count(r.visitors)), cell('p', count(r.pageviews), false),
          cell('t', r.time === null ? '–' : duration(r.time), false)],
      }))} />
  )
}

/** Custom events: how many times each was sent, and by how many visitors. */
export function Events({ rows, className }: { rows: EventRow[]; className?: string }) {
  if (rows.length === 0) {
    return (
      <Card title="Events" testId="panel-events" className={className}>
        <p className="text-sm text-muted">No custom events in this period. Send one from your site:</p>
        <code className="mt-3 block rounded-lg bg-paper px-3 py-2 font-mono text-[13px] text-ink">pagelet("signup")</code>
      </Card>
    )
  }
  return (
    <List title="Events" testId="events" className={className} columns={['Count', 'Visitors']}
      items={rows.map((e) => ({
        key: e.name, name: e.name, bar: e.count,
        cells: [cell('c', count(e.count)), cell('v', count(e.visitors), false)],
      }))} />
  )
}
