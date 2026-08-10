import { useEffect, useState } from 'react'
import type { VerseToken } from '@shared/types'
import { BOOK_BY_ID } from '@shared/books'

/**
 * A "read real Greek" exercise: renders one verse of the tagged original-language New Testament
 * (from the interlinear DB), tap a word to reveal its transliteration, gloss, and parsing. Nothing
 * here is authored text — the Greek is pulled live from the bundled Scripture data.
 */
export default function LearnReading({ refKey, note }: { refKey: string; note?: string }): JSX.Element {
  const [book, chStr, vStr] = refKey.split('.')
  const chapter = Number(chStr)
  const verse = Number(vStr)
  const meta = BOOK_BY_ID[book]
  const edition = meta?.testament === 'OT' ? 'MT' : 'NA'

  const [tokens, setTokens] = useState<VerseToken[] | null>(null)
  const [sel, setSel] = useState<number | null>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    setTokens(null)
    setSel(null)
    setShowAll(false)
    window.api
      .getInterlinear(book, chapter, edition, [], false)
      .then((il) => setTokens(il.verses.find((v) => v.verse === verse)?.tokens ?? []))
      .catch(() => setTokens([]))
  }, [book, chapter, verse, edition])

  const name = meta?.name ?? book
  const rtl = edition === 'MT'

  return (
    <div className="rounded-lg border border-line bg-panel p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-ink">
          {name} {chapter}:{verse}
        </div>
        {tokens && tokens.length > 0 && (
          <button
            onClick={() => setShowAll((s) => !s)}
            className="text-[11px] text-muted hover:text-accent"
          >
            {showAll ? 'Hide glosses' : 'Show all glosses'}
          </button>
        )}
      </div>

      {note && <p className="text-xs text-muted mb-2 italic">{note}</p>}

      {tokens == null ? (
        <div className="text-xs text-faint">Loading…</div>
      ) : tokens.length === 0 ? (
        <div className="text-xs text-faint">
          Reading unavailable (build the original-language data with npm run db:build).
        </div>
      ) : (
        <div
          className={`flex flex-wrap gap-x-2 gap-y-3 text-lg leading-loose ${rtl ? 'flex-row-reverse' : ''}`}
          dir={rtl ? 'rtl' : 'ltr'}
        >
          {tokens.map((t, i) => (
            <button
              key={i}
              onClick={() => setSel(sel === i ? null : i)}
              className={`font-serif inline-flex flex-col items-center leading-tight rounded px-0.5 hover:bg-accent-soft ${
                sel === i ? 'bg-accent-soft text-accent' : 'text-ink'
              }`}
              title={t.gloss ?? undefined}
            >
              {/* For the interlinear editions, `lemma` holds the original Greek/Hebrew word and
                  `gloss` the English — NOT `surface` (which is the gloss for these editions). */}
              <span>{t.lemma ?? t.surface}</span>
              {(showAll || sel === i) && (
                <span className="text-[10px] text-muted font-sans">{t.gloss ?? '—'}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {sel != null && tokens?.[sel] && (
        <div className="mt-3 border-t border-line/60 pt-2 text-xs">
          <span className="font-serif text-base text-ink mr-2">
            {tokens[sel].lemma ?? tokens[sel].surface}
          </span>
          {tokens[sel].translit && <span className="text-muted mr-2">{tokens[sel].translit}</span>}
          <span className="text-accent">{tokens[sel].gloss ?? '—'}</span>
          {tokens[sel].morph && <span className="text-faint ml-2">· {tokens[sel].morph}</span>}
          {tokens[sel].strongs && <span className="text-faint ml-2">· {tokens[sel].strongs}</span>}
        </div>
      )}
    </div>
  )
}
