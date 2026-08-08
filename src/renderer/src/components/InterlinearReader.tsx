import { useChapter } from '@/hooks/useChapter'
import InterlinearVerse from './InterlinearVerse'
import { BookIcon } from './icons'

// The BSB word-alignment carries the actual original-language text (WLC Hebrew / Nestle-TR Greek),
// so the interlinear is anchored on it regardless of the reading translation selected.
const ORIGINAL_SOURCE = 'BSB'

export default function InterlinearReader({
  book,
  chapter
}: {
  book: string
  chapter: number
}): JSX.Element {
  const { data, loading, error } = useChapter(ORIGINAL_SOURCE, book, chapter)
  const hasOriginal = !!data?.verses.some((v) => v.tokens?.some((t) => t.lemma))

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-6">
        <div className="text-[11px] uppercase tracking-wider text-faint mb-5">
          Interlinear · original Greek / Hebrew — gloss &amp; alignment from BSB
        </div>

        {loading ? (
          <div className="animate-pulse space-y-4 mt-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 rounded bg-line/50" style={{ width: `${80 - (i % 3) * 12}%` }} />
            ))}
          </div>
        ) : error || !data || !hasOriginal ? (
          <div className="mt-16 flex flex-col items-center text-center">
            <BookIcon className="w-10 h-10 text-faint mb-3" />
            <p className="text-sm text-ink font-medium">Original text unavailable</p>
            <p className="text-sm text-muted max-w-xs mt-1">
              Original-language data isn&rsquo;t available for this passage yet.
            </p>
          </div>
        ) : (
          data.verses.map((v) =>
            v.tokens && v.tokens.length > 0 ? <InterlinearVerse key={v.verse} v={v} /> : null
          )
        )}
      </div>
    </div>
  )
}
