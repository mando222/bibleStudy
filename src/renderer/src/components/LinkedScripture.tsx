import { Fragment } from 'react'
import { parseScriptureRefs } from '@shared/refs'
import ScriptureRef from './ScriptureRef'

/**
 * Render text with any scripture references turned into clickable links that navigate the reader.
 * Used for assistant answers (and reusable for note bodies). Non-reference text is preserved
 * verbatim so the parent's `whitespace-pre-wrap` keeps the model's formatting.
 */
export default function LinkedScripture({ text }: { text: string }): JSX.Element {
  const refs = parseScriptureRefs(text)
  if (!refs.length) return <>{text}</>

  const nodes: JSX.Element[] = []
  let cursor = 0
  refs.forEach((r, i) => {
    if (r.start > cursor) nodes.push(<Fragment key={`t${i}`}>{text.slice(cursor, r.start)}</Fragment>)
    nodes.push(
      <ScriptureRef
        key={`r${i}`}
        book={r.book}
        bookName={r.bookName}
        chapter={r.chapter}
        verse={r.verse}
        className="text-accent hover:underline font-medium"
      />
    )
    cursor = r.end
  })
  if (cursor < text.length) nodes.push(<Fragment key="tail">{text.slice(cursor)}</Fragment>)
  return <>{nodes}</>
}
