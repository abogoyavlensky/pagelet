import { count } from '../format'

type Item = { name: string; a: number; b: number }

/**
 * A panel of the top ten: each row's name over a bar proportional to the
 * list's largest first column, then two right-aligned counts. Pages,
 * referrers, browsers, OS and devices show visitors and pageviews; events
 * show count and visitors.
 */
export default function RankedList({ title, columns, items, style }: {
  title: string
  columns: [string, string]
  items: Item[]
  style?: React.CSSProperties
}) {
  const max = Math.max(1, ...items.map((i) => i.a))
  return (
    <section className="rise" style={style} data-testid={`panel-${title.toLowerCase()}`}>
      <header className="flex items-baseline justify-between border-b border-ink pb-2">
        <h2 className="font-display text-xl tracking-tight">{title}</h2>
        <span className="flex gap-0 text-xs font-medium tracking-[0.12em] text-muted uppercase">
          <span className="w-20 text-right">{columns[0]}</span>
          <span className="w-20 text-right">{columns[1]}</span>
        </span>
      </header>
      {items.length === 0 ? (
        <p className="py-6 text-sm text-muted">No data for this period</p>
      ) : (
        <ol>
          {items.map((item) => (
            <li key={item.name} className="relative flex items-center border-b border-hairline/70 text-sm">
              <span aria-hidden className="absolute inset-y-1 left-0 rounded-r-[4px] bg-accent-soft"
                style={{ width: `${(item.a / max) * 100}%` }} />
              <span className="relative min-w-0 flex-1 truncate py-2 pr-3 pl-2 text-ink" title={item.name}>
                {item.name}
              </span>
              <span className="num relative w-20 text-right text-ink">{count(item.a)}</span>
              <span className="num relative w-20 text-right text-muted">{count(item.b)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
