import type { Verse } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'

/** Word-by-word interlinear: each word is a vertical cell —
 *  original (Greek/Hebrew) / transliteration / English gloss / stacked translations / Strong's / morphology. */
export default function InterlinearVerse({
  v,
  rtl,
  stack = [],
  labels = {}
}: {
  v: Verse
  rtl?: boolean
  stack?: string[]
  labels?: Record<string, string>
}): JSX.Element {
  const selectStrongs = useAppStore((s) => s.selectStrongs)
  const selected = useAppStore((s) => s.selectedStrongs)

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="flex flex-wrap gap-x-2.5 gap-y-3 items-start mb-4">
      <span className="text-xs font-sans font-semibold text-accent/70 pt-1.5 tabular-nums">
        {v.verse}
      </span>
      {(v.tokens ?? []).map((tok) => {
        const isHeb = tok.strongs?.startsWith('H') ?? false
        const isSel = selected != null && selected === tok.strongs
        return (
          <button
            key={tok.position}
            onClick={() => tok.strongs && selectStrongs(tok.strongs)}
            className={`flex flex-col items-center text-center rounded-md px-1.5 py-1 min-w-[2.5rem] ${
              tok.strongs ? 'hover:bg-elevated cursor-pointer' : 'cursor-default'
            } ${isSel ? 'bg-accent-soft' : ''}`}
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
  )
}
