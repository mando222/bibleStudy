import { foldLatinHomoglyphs } from '@shared/originalText'

/** Transfer FTS boundaries only when the complete index key agrees with the printed Greek. */
function markedGreek(text: string, key: string): string {
  const pieces = key.split(/(\{\{|\}\})/)
  const boundaries = new Map<number, string>()
  let folded = ''
  for (const piece of pieces) {
    if (piece === '{{' || piece === '}}') boundaries.set(folded.length, piece)
    else folded += piece
  }
  let offset = 0
  let marked = ''
  for (const [cluster] of text.matchAll(/\P{M}\p{M}*|\p{M}+/gu)) {
    const normalized = foldLatinHomoglyphs(cluster).normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ς/g, 'σ')
    if (!folded.startsWith(normalized, offset)) return text
    marked += (boundaries.get(offset) ?? '') + cluster
    offset += normalized.length
  }
  return offset === folded.length ? marked + (boundaries.get(offset) ?? '') : text
}

/** Renders text with {{…}} match markers as highlighted spans. */
export default function Snippet({ text, markedGreekKey }: { text: string; markedGreekKey?: string }): JSX.Element {
  const parts = (markedGreekKey ? markedGreek(text, markedGreekKey) : text).split(/\{\{|\}\}/)
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-accent-soft text-accent rounded px-0.5">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  )
}
