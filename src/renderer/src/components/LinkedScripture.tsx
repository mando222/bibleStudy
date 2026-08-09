import { Fragment, useEffect, useRef, useState } from 'react'
import { parseScriptureRefs } from '@shared/refs'
import { useAppStore } from '@/store/useAppStore'
import ScriptureRef from './ScriptureRef'

// Strong's numbers written in prose, e.g. "G26", "(H0430)".
const STRONGS_RE = /\b([GH])0*(\d{1,5})\b/g
// Runs of Greek (incl. polytonic + combining marks) or Hebrew (incl. points) script.
const GREEK = '\\u0370-\\u03FF\\u1F00-\\u1FFF'
const HEBREW = '\\u0590-\\u05FF'
const ORIG_RE = new RegExp(
  `[${GREEK}][${GREEK}\\u0300-\\u036F]*|[${HEBREW}]+`,
  'gu'
)

interface Span {
  start: number
  end: number
  node: (key: string, text: string) => JSX.Element
}

/**
 * Render assistant text with clickable links: scripture references navigate the reader, and
 * Strong's numbers / original-language (Greek·Hebrew) words open their lexicon entry in the study
 * pane. Original-language words are resolved to a Strong's number by form (getLexiconByWord), so
 * only words we can actually look up become links; everything else stays plain text.
 */
export default function LinkedScripture({ text }: { text: string }): JSX.Element {
  const selectStrongs = useAppStore((s) => s.selectStrongs)
  // Cache original-word → Strong's (or null) lookups across renders / streamed updates.
  const cache = useRef<Map<string, string | null>>(new Map())
  const [, bump] = useState(0)

  useEffect(() => {
    const words = new Set<string>()
    for (const m of text.matchAll(ORIG_RE)) words.add(m[0])
    const todo = [...words].filter((w) => !cache.current.has(w))
    if (!todo.length || !window.api?.getLexiconByWord) return
    let cancelled = false
    Promise.all(
      todo.map(async (w) => {
        try {
          cache.current.set(w, await window.api.getLexiconByWord(w))
        } catch {
          cache.current.set(w, null)
        }
      })
    ).then(() => !cancelled && bump((n) => n + 1))
    return () => {
      cancelled = true
    }
  }, [text])

  const wordLink =
    (strongs: string) =>
    (key: string, label: string): JSX.Element => (
      <button
        key={key}
        onClick={() => selectStrongs(strongs)}
        title={`Look up ${strongs}`}
        className="text-accent hover:underline font-medium"
      >
        {label}
      </button>
    )

  const spans: Span[] = []
  for (const r of parseScriptureRefs(text)) {
    spans.push({
      start: r.start,
      end: r.end,
      node: (key) => (
        <ScriptureRef
          key={key}
          book={r.book}
          bookName={r.bookName}
          chapter={r.chapter}
          verse={r.verse}
          className="text-accent hover:underline font-medium"
        />
      )
    })
  }
  for (const m of text.matchAll(STRONGS_RE)) {
    const id = `${m[1]}${Number(m[2])}`
    spans.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, node: wordLink(id) })
  }
  for (const m of text.matchAll(ORIG_RE)) {
    const strongs = cache.current.get(m[0])
    if (strongs)
      spans.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, node: wordLink(strongs) })
  }

  spans.sort((a, b) => a.start - b.start)
  const kept: Span[] = []
  let last = -1
  for (const s of spans)
    if (s.start >= last) {
      kept.push(s)
      last = s.end
    }

  if (!kept.length) return <>{text}</>
  const nodes: JSX.Element[] = []
  let cursor = 0
  kept.forEach((s, i) => {
    if (s.start > cursor) nodes.push(<Fragment key={`t${i}`}>{text.slice(cursor, s.start)}</Fragment>)
    nodes.push(s.node(`s${i}`, text.slice(s.start, s.end)))
    cursor = s.end
  })
  if (cursor < text.length) nodes.push(<Fragment key="tail">{text.slice(cursor)}</Fragment>)
  return <>{nodes}</>
}
