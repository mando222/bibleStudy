import { useEditions, useInterlinear } from '@/hooks/useInterlinear'
import { useAppStore } from '@/store/useAppStore'
import { BOOK_BY_ID } from '@shared/books'
import InterlinearVerse from './InterlinearVerse'
import { BookIcon } from './icons'

export default function InterlinearReader({
  book,
  chapter
}: {
  book: string
  chapter: number
}): JSX.Element {
  const editions = useEditions()
  const stored = useAppStore((s) => s.interlinearEdition)
  const setEdition = useAppStore((s) => s.setInterlinearEdition)
  const translations = useAppStore((s) => s.translations)
  const stack = useAppStore((s) => s.interlinearStack)
  const toggleStack = useAppStore((s) => s.toggleInterlinearStack)

  const testament = BOOK_BY_ID[book]?.testament ?? 'NT'
  const applicable = editions.filter((e) => e.testament === testament)
  // Use the stored choice if it applies to this testament, else the default (first applicable).
  const effective = applicable.find((e) => e.id === stored)?.id ?? applicable[0]?.id ?? ''

  // Translations that carry Strong's tags can be aligned word-for-word onto the original.
  const stackable = translations.filter((t) => t.hasStrongs)
  const labels = Object.fromEntries(stackable.map((t) => [t.id, t.abbrev]))

  const { data, loading, error } = useInterlinear(book, chapter, effective, stack)

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-6">
        <div className="flex items-center gap-3 mb-5">
          <span className="text-[11px] uppercase tracking-wider text-faint">
            Interlinear · base text
          </span>
          <select
            value={effective}
            onChange={(e) => setEdition(e.target.value)}
            className="bg-elevated border border-line rounded-md text-sm px-2 py-1 text-ink outline-none focus:border-accent"
          >
            {applicable.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          {data && data.verses.length > 0 && (
            <span className="text-xs text-faint">
              {data.direction === 'rtl' ? 'Hebrew · read right-to-left' : 'Greek'}
            </span>
          )}
          {stackable.length > 0 && (
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-[11px] uppercase tracking-wider text-faint">Stack</span>
              {stackable.map((t) => {
                const on = stack.includes(t.id)
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleStack(t.id)}
                    title={`Align ${t.name} under each word (by Strong's)`}
                    className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                      on
                        ? 'bg-accent-soft border-accent text-accent'
                        : 'border-line text-muted hover:bg-elevated'
                    }`}
                  >
                    {t.abbrev}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {loading ? (
          <div className="animate-pulse space-y-4 mt-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 rounded bg-line/50" style={{ width: `${80 - (i % 3) * 12}%` }} />
            ))}
          </div>
        ) : error || !data || data.verses.length === 0 ? (
          <div className="mt-16 flex flex-col items-center text-center">
            <BookIcon className="w-10 h-10 text-faint mb-3" />
            <p className="text-sm text-ink font-medium">No original text</p>
            <p className="text-sm text-muted max-w-xs mt-1">
              This edition doesn&rsquo;t cover this passage.
            </p>
          </div>
        ) : (
          data.verses.map((v) => (
            <InterlinearVerse
              key={v.verse}
              v={{ verse: v.verse, text: '', tokens: v.tokens }}
              rtl={data.direction === 'rtl'}
              stack={stack}
              labels={labels}
            />
          ))
        )}
      </div>
    </div>
  )
}
