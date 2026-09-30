import { useState } from 'react'

/** The script tag to paste into a site, with a copy button. */
export default function Snippet() {
  const tag = `<script defer src="${window.location.origin}/p.js"></script>`
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(tag)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }
  return (
    <div className="flex items-stretch border border-hairline bg-card">
      <code className="flex-1 overflow-x-auto px-4 py-3 font-mono text-[13px] whitespace-nowrap text-ink">
        {tag}
      </code>
      <button onClick={copy}
        className="border-l border-hairline px-4 text-sm text-accent transition-colors hover:bg-accent-soft">
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}
