export default function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-display text-xl font-medium tracking-tight text-ink ${className}`}>
      pagelet<span className="text-accent">.</span>
    </span>
  )
}
