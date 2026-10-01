/** "pagelet." in the display face; `className` sets the size (text-xl by default). */
export default function Wordmark({ className = 'text-xl' }: { className?: string }) {
  return (
    <span className={`font-display font-medium tracking-tight text-ink ${className}`}>
      pagelet<span className="text-accent">.</span>
    </span>
  )
}
