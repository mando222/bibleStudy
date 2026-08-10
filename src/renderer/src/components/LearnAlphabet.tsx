import { useState } from 'react'
import type { LearnLanguage } from '@/store/useAppStore'
import { GREEK_ALPHABET } from '@shared/learn/greekAlphabet'
import { HEBREW_ALPHABET } from '@shared/learn/hebrewAlphabet'

/** Browse the Greek/Hebrew alphabet, or quiz yourself on letter names. */
export default function LearnAlphabet({ language }: { language: LearnLanguage }): JSX.Element {
  const letters = language === 'greek' ? GREEK_ALPHABET : HEBREW_ALPHABET
  const [quiz, setQuiz] = useState(false)
  const [idx, setIdx] = useState(0)
  const [revealed, setRevealed] = useState(false)

  const next = (): void => {
    setRevealed(false)
    setIdx((i) => (i + 1) % letters.length)
  }

  if (quiz) {
    const l = letters[idx]
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <button
          onClick={() => setQuiz(false)}
          className="text-xs text-muted hover:text-accent mb-4"
        >
          ← Back to chart
        </button>
        <div className="rounded-xl border border-line bg-panel p-10">
          <div className="text-7xl text-ink font-serif" dir={language === 'hebrew' ? 'rtl' : 'ltr'}>
            {l.lower}
          </div>
          {revealed ? (
            <div className="mt-5">
              <div className="text-xl text-accent capitalize">{l.name}</div>
              <div className="text-sm text-muted mt-1">
                translit <span className="text-ink">{l.translit}</span> · {l.sound}
              </div>
            </div>
          ) : (
            <button
              onClick={() => setRevealed(true)}
              className="mt-6 px-4 py-1.5 rounded-md border border-line text-sm text-muted hover:bg-elevated"
            >
              Reveal
            </button>
          )}
        </div>
        <button
          onClick={next}
          className="mt-4 px-5 py-2 rounded-md bg-accent text-white text-sm hover:opacity-90"
        >
          Next letter
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted">
          {letters.length} letters
          {language === 'hebrew' ? ' · read right to left' : ''}
        </p>
        <button
          onClick={() => {
            setQuiz(true)
            setIdx(0)
            setRevealed(false)
          }}
          className="px-3 py-1 rounded-md bg-accent text-white text-sm hover:opacity-90"
        >
          Quiz me
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
        {letters.map((l) => (
          <div key={l.name} className="rounded-lg border border-line bg-panel p-3 flex items-center gap-3">
            <div
              className="text-3xl text-ink font-serif w-12 text-center shrink-0"
              dir={language === 'hebrew' ? 'rtl' : 'ltr'}
            >
              {l.lower}
            </div>
            <div className="min-w-0">
              <div className="text-sm text-ink capitalize">
                {l.name} <span className="text-faint">· {l.translit}</span>
              </div>
              <div className="text-xs text-muted truncate">{l.sound}</div>
              {l.numeric != null && <div className="text-[10px] text-faint">value {l.numeric}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
