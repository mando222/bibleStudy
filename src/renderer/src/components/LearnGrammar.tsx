import { useEffect, useState } from 'react'
import type { GrammarLesson } from '@shared/types'
import type { LearnLanguage } from '@/store/useAppStore'
import LearnReading from './LearnReading'

/** Interactive "read real Greek/Hebrew" course: grammar + real readings + exercises + progress. */
export default function LearnGrammar({ language }: { language: LearnLanguage }): JSX.Element {
  const course = language === 'greek' ? 'koine' : 'hebrew'
  const [lessons, setLessons] = useState<GrammarLesson[]>([])
  const [sel, setSel] = useState<GrammarLesson | null>(null)
  const [done, setDone] = useState<Record<string, string>>({})
  const [revealed, setRevealed] = useState<Record<number, boolean>>({})

  useEffect(() => {
    window.api.getGrammarLessons().then(setLessons).catch(() => setLessons([]))
    window.api.getLearnProgress('grammar').then(setDone).catch(() => undefined)
  }, [])

  const courseLessons = lessons.filter((l) => l.course === course)

  // Select this course's first lesson when the language (course) changes or lessons load.
  useEffect(() => {
    setSel(courseLessons[0] ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course, lessons])

  // Collapse revealed answers when switching lessons.
  useEffect(() => setRevealed({}), [sel])

  const markDone = async (l: GrammarLesson): Promise<void> => {
    await window.api.setLearnProgress('grammar', String(l.id), 'done')
    setDone((d) => ({ ...d, [l.id]: 'done' }))
  }

  if (!courseLessons.length) {
    return (
      <div className="p-10 text-center text-muted">
        <p className="text-sm max-w-sm mx-auto leading-relaxed">
          No {language === 'greek' ? 'Greek' : 'Hebrew'} lessons loaded. The course is bundled by
          <code className="mx-1 text-ink">npm run db:build</code>.
        </p>
      </div>
    )
  }

  return (
    <div className="h-full flex">
      <div className="w-56 shrink-0 border-r border-line overflow-y-auto bg-panel">
        {courseLessons.map((l) => (
          <button
            key={l.id}
            onClick={() => setSel(l)}
            className={`w-full text-left px-3 py-2 border-b border-line/40 text-sm hover:bg-elevated ${
              sel?.id === l.id ? 'bg-accent-soft text-accent' : 'text-ink'
            }`}
          >
            <span className="text-faint mr-1.5">{l.chapterNo}.</span>
            {l.title}
            {done[l.id] && <span className="text-emerald-500 ml-1">✓</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto p-6">
        {sel && (
          <div className="max-w-2xl">
            <h1 className="font-serif text-2xl text-ink">
              Lesson {sel.chapterNo}: {sel.title}
            </h1>

            <div className="mt-4 text-sm text-ink leading-relaxed space-y-3">
              {sel.bodyMd.split(/\n\n+/).map((para, i) => (
                <p key={i} className="whitespace-pre-wrap">
                  {para}
                </p>
              ))}
            </div>

            {sel.vocab.length > 0 && (
              <div className="mt-6">
                <div className="text-[11px] uppercase tracking-wider text-faint mb-2">Vocabulary</div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  {sel.vocab.map((v, i) => (
                    <div key={i} className="flex justify-between border-b border-line/40 py-0.5">
                      <span className="text-ink font-serif">{v.lemma}</span>
                      <span className="text-muted">{v.gloss}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sel.readings.length > 0 && (
              <div className="mt-6">
                <div className="text-[11px] uppercase tracking-wider text-faint mb-2">
                  Read real {language === 'greek' ? 'Greek' : 'Hebrew'} — tap a word
                </div>
                <div className="space-y-3">
                  {sel.readings.map((r, i) => (
                    <LearnReading key={i} refKey={r.ref} note={r.note} />
                  ))}
                </div>
              </div>
            )}

            {sel.exercises.length > 0 && (
              <div className="mt-6">
                <div className="text-[11px] uppercase tracking-wider text-faint mb-2">Exercises</div>
                <ol className="space-y-2 text-sm">
                  {sel.exercises.map((ex, i) => (
                    <li key={i} className="rounded-md border border-line bg-panel p-2.5">
                      <div className="text-ink">{ex.prompt}</div>
                      {revealed[i] ? (
                        <div className="text-accent mt-1">{ex.answer}</div>
                      ) : (
                        <button
                          onClick={() => setRevealed((r) => ({ ...r, [i]: true }))}
                          className="text-xs text-muted hover:text-accent mt-1"
                        >
                          Show answer
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <button
              onClick={() => markDone(sel)}
              disabled={done[sel.id] === 'done'}
              className="mt-6 px-4 py-1.5 rounded-md bg-accent text-white text-sm hover:opacity-90 disabled:opacity-50"
            >
              {done[sel.id] === 'done' ? 'Completed ✓' : 'Mark complete'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
