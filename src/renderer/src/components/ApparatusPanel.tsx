import { BOOK_BY_ID } from '@shared/books'
import { mapPassage } from '@shared/passageMapping'
import { useAppStore } from '@/store/useAppStore'
import { useApparatus } from '@/hooks/useApparatus'
import { readerChapter } from '@/lib/passage'
import OriginalVerseComparison, { GreekVerseReadings, MasoreticPairs } from './OriginalVerseComparison'

export default function ApparatusPanel(): JSX.Element {
  const sourceBook = useAppStore(s => s.book)
  const sourceChapter = useAppStore(s => s.chapter)
  const sourceEdition = useAppStore(s => s.referenceEdition || s.primary)
  const verse = useAppStore(s => s.activeVerse)
  const native = sourceEdition.startsWith('imp_') ? null : readerChapter(sourceBook, sourceChapter, verse, sourceEdition, 'KJV')
  const book = native?.book ?? sourceBook
  const chapter = native?.chapter ?? sourceChapter
  const selected = verse == null || !native ? null : mapPassage({ book: sourceBook, chapter: sourceChapter, verse }, sourceEdition, 'KJV')
  const selectStrongs = useAppStore(s => s.selectStrongs)
  const goToVerse = useAppStore(s => s.goToVerse)
  const query = useApparatus(book, chapter, !!native)
  const meta = BOOK_BY_ID[book]
  const isOT = meta?.testament === 'OT'
  const name = meta?.name ?? book

  if (!native) return <section>
    <p className="text-sm text-muted">No verified equivalent in the textual apparatus.</p>
    {sourceEdition === 'LXX' && <OriginalVerseComparison book={sourceBook} chapter={sourceChapter} verse={verse ?? 1} translation="LXX" />}
  </section>
  if (query.loading) return <p role="status" className="text-sm text-muted">Comparing editions…</p>
  if (query.error) return <button className="text-sm text-accent" onClick={query.retry}>Comparison unavailable · Retry</button>
  const data = query.data ?? []
  const firstOpen = data.find(v => v.verse === selected?.verse)?.verse ?? data[0]?.verse
  return <section>
    <p className="text-sm text-muted mb-2">{isOT ? 'Written and read forms recorded in the Masoretic tradition by STEPBible TAHOT.'
      : 'Greek readings from STEPBible TAGNT, in your preferred order. Underlining spans the first through last difference between the recorded sequences. The comparison ignores final punctuation and paragraph marks.'}</p>
    <OriginalVerseComparison key={[sourceBook, sourceChapter, verse, sourceEdition].join('/')}
      book={sourceBook} chapter={sourceChapter} verse={verse ?? 1} translation={sourceEdition} />
    {data.length === 0 ? <p className="mt-3 text-sm text-muted">{isOT
      ? 'No Ketiv/Qere pairs recorded' : 'No differences in the bundled Greek word forms recorded'} for {name} {chapter}.</p> :
      data.map(v => <details key={book + ':' + chapter + ':' + v.verse} open={v.verse === firstOpen}
        className="border-t border-line/60 py-2">
        <summary className="cursor-pointer text-sm font-medium">{name} {chapter}:{v.verse}</summary>
        <div className="mt-2">{v.kind === 'greek' ?
          <GreekVerseReadings readings={v.readings} chapter={chapter} verse={v.verse} onWord={selectStrongs} /> :
          <MasoreticPairs pairs={v.pairs} onWord={selectStrongs} />}</div>
        <button className="mt-2 text-xs text-accent hover:underline" onClick={() => goToVerse(book, chapter, v.verse)}>Open verse in reader</button>
      </details>)}
  </section>
}
