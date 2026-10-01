const TINTS = [
  ['var(--color-visitors-soft)', 'var(--color-visitors-deep)'],
  ['var(--color-pageviews-soft)', 'var(--color-pageviews-deep)'],
  ['var(--color-views-soft)', 'var(--color-views-deep)'],
  ['var(--color-bounce-soft)', 'var(--color-bounce-deep)'],
]

/**
 * A site's initial on a soft tile, its tint fixed by the domain, so each
 * site keeps one colour everywhere. (No favicons: fetching them would tell
 * a third party which sites are watched.)
 */
export default function SiteMark({ domain, size = 'sm' }: { domain: string; size?: 'sm' | 'lg' }) {
  const [bg, fg] = TINTS[[...domain].reduce((n, c) => n + c.charCodeAt(0), 0) % TINTS.length]
  return (
    <span aria-hidden style={{ background: bg, color: fg }}
      className={`grid shrink-0 place-items-center font-semibold uppercase ${
        size === 'lg' ? 'size-10 rounded-xl text-base' : 'size-5 rounded-md text-[11px]'}`}>
      {domain.charAt(0)}
    </span>
  )
}
