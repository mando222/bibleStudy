import { useAppStore } from '@/store/useAppStore'
import { useApparatus } from '@/hooks/useApparatus'
import { BOOK_BY_ID } from '@shared/books'
import ScriptureRef from './ScriptureRef'
import { CompareIcon } from './icons'

const CRITICAL = 'text-sky-600 dark:text-sky-400'
const TR = 'text-amber-600 dark:text-amber-400'
const QERE = 'text-emerald-600 dark:text-emerald-400'
const KETIV = 'text-amber-600 dark:text-amber-400'

export default function ApparatusPanel(): JSX.Element {
  const book = useAppStore((s) => s.book)
  const chapter = useAppStore((s) => s.chapter)
  const selectStrongs = useAppStore((s) => s.selectStrongs)
  const { data, loading } = useApparatus(book, chapter)

  const meta = BOOK_BY_ID[book]
  const bookName = meta?.name ?? book
  const isOT = meta?.testament === 'OT'

  if (loading) return <p className="text-sm text-muted">Comparing editions…</p>

  if (data.length === 0) {
    return (
      <Empty>
        {isOT
          ? `No Ketiv/Qere variants recorded in ${bookName} ${chapter}.`
          : `No differences between the Critical text and Textus Receptus in ${bookName} ${chapter}.`}
      </Empty>
    )
  }

  // ---- OT: Ketiv (written) vs Qere (read) ----
  if (isOT) {
    return (
      <div>
        <p className="text-sm text-muted leading-relaxed mb-3">
          The Masoretic scribal variants in {bookName} {chapter}: the traditional reading (
          <span className={QERE}>Qere</span>) beside the written consonantal text (
          <span className={KETIV}>Ketiv</span>). Click a word for its lexicon entry.
        </p>
        <div className="flex gap-4 text-xs mb-3">
          <span className={QERE}>■ Qere (read)</span>
          <span className={KETIV}>■ Ketiv (written)</span>
        </div>

        <div className="space-y-3">
          {data.map((v) => {
            const pairs: [(typeof v.items)[number], (typeof v.items)[number]][] = []
            for (let i = 0; i + 1 < v.items.length; i += 2) pairs.push([v.items[i], v.items[i + 1]])
            return (
              <div key={v.verse} className="border-t border-line/60 pt-2">
                <ScriptureRef
                  book={book}
                  bookName={bookName}
                  chapter={chapter}
                  verse={v.verse}
                  className="text-xs font-semibold text-accent hover:underline"
                />
                <div className="mt-1 text-[15px] leading-relaxed space-y-1.5">
                  {pairs.map(([q, k], i) => (
                    <div key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-[10px] uppercase tracking-wide text-faint">Qere</span>
                      <span
                        dir="rtl"
                        onClick={() => q.strongs && selectStrongs(q.strongs)}
                        title={q.strongs ?? undefined}
                        className={`font-hebrew ${QERE} ${q.strongs ? 'cursor-pointer' : ''}`}
                      >
                        {q.surface}
                      </span>
                      <span className="text-faint">·</span>
                      <span className="text-[10px] uppercase tracking-wide text-faint">Ketiv</span>
                      <span
                        dir="rtl"
                        onClick={() => k.strongs && selectStrongs(k.strongs)}
                        title={k.strongs ?? undefined}
                        className={`font-hebrew ${KETIV} ${k.strongs ? 'cursor-pointer' : ''}`}
                      >
                        {k.surface}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ---- NT: Critical (NA/SBL) vs Textus Receptus ----
  return (
    <div>
      <p className="text-sm text-muted leading-relaxed mb-3">
        Words that differ between the <span className={CRITICAL}>Critical text (NA/SBL)</span> and
        the <span className={TR}>Textus Receptus</span> in {bookName} {chapter}. Click a word for its
        lexicon entry.
      </p>
      <div className="flex gap-4 text-xs mb-3">
        <span className={CRITICAL}>■ Critical only</span>
        <span className={TR}>■ Textus Receptus only</span>
      </div>

      <div className="space-y-3">
        {data.map((v) => (
          <div key={v.verse} className="border-t border-line/60 pt-2">
            <ScriptureRef
              book={book}
              bookName={bookName}
              chapter={chapter}
              verse={v.verse}
              className="text-xs font-semibold text-accent hover:underline"
            />
            <div className="font-greek text-[15px] leading-relaxed mt-1">
              {v.items.map((it, i) => {
                const cls =
                  it.side === 'both'
                    ? 'text-ink'
                    : `${it.side === 'critical' ? CRITICAL : TR} underline decoration-dotted underline-offset-2`
                return (
                  <span
                    key={i}
                    onClick={() => it.strongs && selectStrongs(it.strongs)}
                    title={
                      it.side === 'critical'
                        ? `Critical only · ${it.translit ?? ''} ${it.strongs ?? ''}`
                        : it.side === 'tr'
                          ? `Textus Receptus only · ${it.translit ?? ''} ${it.strongs ?? ''}`
                          : (it.translit ?? undefined)
                    }
                    className={`${cls} ${it.strongs ? 'cursor-pointer' : ''}`}
                  >
                    {it.surface}{' '}
                  </span>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="mt-10 flex flex-col items-center text-center text-muted">
      <CompareIcon className="w-8 h-8 text-faint mb-3" />
      <p className="text-sm max-w-[17rem] leading-relaxed">{children}</p>
    </div>
  )
}
