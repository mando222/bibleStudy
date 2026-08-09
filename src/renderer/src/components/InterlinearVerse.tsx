import type { Verse } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'

/** Word-by-word interlinear: each word is a vertical cell —
 *  original (Greek/Hebrew) / transliteration / English gloss / stacked translations / Strong's / morphology. */
export default function InterlinearVerse({
  v,
  rtl,
  stack = [],
  labels = {},
  lines = []
}: {
  v: Verse
  rtl?: boolean
  stack?: string[]
  labels?: Record<string, string>
  lines?: { id: string; text: string }[]
}): JSX.Element {
  const selectStrongs = useAppStore((s) => s.selectStrongs)
  const selected = useAppStore((s) => s.selectedStrongs)
  const searchFor = useAppStore((s) => s.searchFor)

  return (
    <div className="mb-4">
      <div dir={rtl ? 'rtl' : 'ltr'} className="flex flex-wrap gap-x-2.5 gap-y-3 items-start">
        <span className="text-xs font-sans font-semibold text-accent/70 pt-1.5 tabular-nums">
          {v.verse}
        </span>
        {(v.tokens ?? []).map((tok) => {
        const isHeb = tok.strongs?.startsWith('H') ?? false
        const isSel = selected != null && selected === tok.strongs
        return (
          <button
            key={tok.position}
            onClick={() => {
              if (tok.strongs) selectStrongs(tok.strongs)
              else {
                const w = (tok.surface || tok.lemma || '').trim()
                if (w) searchFor(w)
              }
            }}
            title={tok.strongs ? undefined : 'Search for this word'}
            className={`flex flex-col items-center text-center rounded-md px-1.5 py-1 min-w-[2.5rem] hover:bg-elevated cursor-pointer ${
              isSel ? 'bg-accent-soft' : ''
            }`}
          >
            {tok.lemma && (
              <span
                dir={isHeb ? 'rtl' : 'ltr'}
                className={`text-xl leading-tight text-ink ${isHeb ? 'font-hebrew' : 'font-greek'}`}
              >
                {tok.lemma}
              </span>
            )}
            {tok.translit && <span className="text-xs italic text-muted mt-0.5">{tok.translit}</span>}
            <span className="text-xs text-ink mt-0.5">{tok.surface}</span>
            {stack.map((tid) => (
              <span key={tid} className="text-xs text-ink/80 mt-0.5">
                <span className="text-[9px] uppercase text-faint mr-1">{labels[tid] ?? tid}</span>
                {tok.aligned?.[tid] ?? '·'}
              </span>
            ))}
            {tok.strongs && (
              <span className="text-[10px] text-accent tabular-nums mt-0.5">{tok.strongs}</span>
            )}
            {tok.morph && (
              <span className="text-[9px] text-faint mt-0.5 max-w-[8rem] truncate" title={tok.morph}>
                {tok.morph}
              </span>
            )}
          </button>
          )
        })}
      </div>
      {lines.length > 0 && (
        <div className="mt-2 ml-5 space-y-0.5">
          {lines.map((ln) => (
            <div key={ln.id} className="text-sm text-muted leading-snug">
              <span className="text-[10px] uppercase text-faint mr-2 tabular-nums">
                {labels[ln.id] ?? ln.id}
              </span>
              {ln.text}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
