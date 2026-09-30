export default function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-display text-2xl font-semibold tracking-tight text-ink ${className}`}>
      pagelet<span className="text-accent">.</span>
    </span>
  )
}
