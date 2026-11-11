interface Props {
  offset: number
  size: number
  count: number
  total: number
  onPage: (offset: number) => void
}

export default function ResultPages({ offset, size, count, total, onPage }: Props): JSX.Element | null {
  if (total <= size) return null
  return (
    <nav aria-label="Result pages" className="flex flex-wrap items-center gap-2 py-1 text-xs text-muted">
      <button disabled={!offset} onClick={() => onPage(Math.max(0, offset - size))}
        className="text-accent disabled:text-faint">Previous</button>
      <span>{(offset + 1).toLocaleString()}–{(offset + count).toLocaleString()} of {total.toLocaleString()}</span>
      <button disabled={offset + count >= total} onClick={() => onPage(offset + size)}
        className="text-accent disabled:text-faint">Next</button>
    </nav>
  )
}
