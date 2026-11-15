import { useCallback, useEffect, useMemo, useState } from 'react'
import { BOOK_BY_ID } from '@shared/books'
import type { Highlight, Note, VerseRef } from '@shared/types'
import { mapPassage } from '@shared/passageMapping'
import { readingEdition, useAppStore } from '@/store/useAppStore'
import { useStudyQuery } from '@/hooks/useStudyQuery'
import ResultPages from './ResultPages'

const pageSize = 30
const verseKey = (h: Highlight) => JSON.stringify([h.translation, h.book, h.chapter, h.verse])
const refLabel = (r: Pick<VerseRef, 'book' | 'chapter' | 'verse'>) => (BOOK_BY_ID[r.book]?.name ?? r.book) + ' ' + r.chapter + ':' + r.verse

export default function AllAnnotations({ onNavigate }: { onNavigate?: () => void }) {
  const readerEdition = useAppStore(readingEdition)
  const revision = useAppStore(s => s.userDataNonce)
  const editions = useAppStore(s => s.translations)
  const saved = useStudyQuery(useCallback(() => window.api.listAnnotations(), [revision]))
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [wording, setWording] = useState<Record<string, string>>({})
  const [reading, setReading] = useState(false)
  const [readError, setReadError] = useState(false)

  useEffect(() => {
    let current = true
    const highlights = new Map((saved.data?.highlights ?? []).map(h => [verseKey(h), h]))
    const entries = [...highlights.entries()]
    setWording({})
    setReading(entries.length > 0)
    setReadError(false)
    // A chapter can have several marks. Read each distinct native verse once, in small batches.
    const load = async () => {
      for (let i = 0; current && i < entries.length; i += 16) {
        const batch = await Promise.all(entries.slice(i, i + 16).map(async ([key, h]) => {
          try {
            const ref = { translation: h.translation, book: h.book, chapter: h.chapter, verse: h.verse }
            if (h.translation === 'NA' || h.translation === 'TR' || h.translation === 'BYZ') {
              const original = await window.api.getOriginalVerseReadings(ref)
              const reading = original.kind === 'greek' ? original.readings[h.translation] : undefined
              return [key, reading && !reading.orderStatus ? reading.words.map(w => w.surface).join(' ') : '']
            }
            const verse = await window.api.getComparisonVerse(ref)
            return [key, verse?.text ?? '']
          } catch {
            if (current) setReadError(true)
            return [key, '']
          }
        }))
        if (current) setWording(last => ({ ...last, ...Object.fromEntries(batch) }))
      }
      if (current) setReading(false)
    }
    void load()
    return () => { current = false }
  }, [saved.data, attempt])

  const rows = useMemo(() => {
    const key = query.trim().toLowerCase()
    const items = [...(saved.data?.notes ?? []), ...(saved.data?.highlights ?? [])]
    return items.map(row => {
      const note = 'body' in row
      const edition = note ? 'KJV numbering' : editions.find(t => t.id === row.translation)?.abbrev ?? row.translation
      const editionName = note ? '' : editions.find(t => t.id === row.translation)?.name ?? ''
      const type = note ? 'Note' : row.color + ' highlight'
      const native = note ? mapPassage(row, 'KJV', readerEdition) : null
      const alternateRef = native && (native.book !== row.book || native.chapter !== row.chapter || native.verse !== row.verse)
        ? refLabel(native) + ' · ' + readerEdition : ''
      const text = note ? row.body : wording[verseKey(row)] ?? ''
      return { row, label: refLabel(row), edition, editionName, type, text, alternateRef, date: note ? row.updatedAt : row.createdAt }
    }).filter(item => [item.label, item.row.book + ' ' + item.row.chapter + ':' + item.row.verse, item.edition,
      item.editionName, item.alternateRef, item.type, item.text].some(value => value.toLowerCase().includes(key)))
      .sort((a, b) => b.date - a.date || b.row.id - a.row.id)
  }, [saved.data, query, editions, readerEdition, wording])
  const start = Math.min(offset, Math.max(0, Math.ceil(rows.length / pageSize) - 1) * pageSize)
  const page = rows.slice(start, start + pageSize)

  const open = (item: Note | Highlight) => {
    const s = useAppStore.getState()
    if ('body' in item) s.goToVerse(item.book, item.chapter, item.verse, 'KJV')
    else s.openSearchHit({ ...item, bookName: BOOK_BY_ID[item.book]?.name ?? item.book, snippet: '',
      edition: ['NA', 'TR', 'BYZ'].includes(item.translation) ? item.translation : undefined })
    onNavigate?.()
  }
  return <section aria-label="All saved notes and highlights" className="space-y-2">
    <input aria-label="Search notes and highlights" type="search" value={query} placeholder="Reference, wording or highlight color…"
      onChange={e => { setQuery(e.target.value); setOffset(0) }} className="w-full rounded border border-line bg-panel px-2 py-1.5 text-sm" />
    {saved.error ? <p role="alert">{saved.error} <button onClick={saved.retry}>Retry</button></p> :
      <p role="status" className="text-xs text-muted">{saved.loading ? 'Loading annotations…' : reading && query ? 'Searching highlighted verses…' :
        rows.length ? rows.length + (rows.length === 1 ? ' annotation' : ' annotations') : query ? 'No matching annotations.' : 'No notes or highlights saved.'}</p>}
    {readError && <p role="alert" className="text-xs">Some highlighted wording could not be read. <button onClick={() => setAttempt(n => n + 1)}>Retry</button></p>}
    {page.map(({row, label, type, edition, text, alternateRef}) =>
      <button key={type + row.id} onClick={() => open(row)} className="block w-full text-left rounded border border-line bg-elevated p-2">
        <span className="text-sm text-accent">{label}</span> <span className="text-xs text-muted">{edition} · {type}</span>
        {alternateRef && <span className="block text-xs text-muted">{alternateRef}</span>}
        {text && <span dir="auto" className="block whitespace-pre-wrap text-sm line-clamp-3">{text}</span>}
      </button>)}
    <ResultPages offset={start} size={pageSize} count={page.length} total={rows.length} onPage={setOffset} />
  </section>
}
