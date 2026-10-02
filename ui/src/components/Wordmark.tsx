/** The mark (a small rising line on a soft tile) and the name. */
export default function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 font-semibold tracking-tight text-ink ${className}`}>
      <svg aria-hidden viewBox="0 0 32 32" className="size-7 shrink-0">
        <rect width="32" height="32" rx="9" fill="var(--color-visitors-soft)" />
        <path d="M8 21 L13 15 L18 18 L24 10" fill="none" stroke="var(--color-visitors)" strokeWidth="3"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>Pagelet</span>
    </span>
  )
}
