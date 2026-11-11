import { useEffect, useRef, useState } from 'react'
import { readingFeatures, type ReadingFeature } from '@shared/readingDisplay'
import { getStudyStructures, type StudyRange } from '@shared/passageStudy'
import { useAppStore } from '@/store/useAppStore'

const features = Object.keys(readingFeatures) as ReadingFeature[]
const action = 'rounded px-1.5 py-1 text-xs text-muted hover:text-accent hover:bg-elevated focus-visible:outline-accent'

const interlinearFeatures: ReadingFeature[] = ['chapterNumbers', 'verseNumbers']

export function ReadingDisplay({ editionIds, interlinear = false }: { editionIds: string[]; interlinear?: boolean }) {
  const defaults = useAppStore(s => s.displayDefaults)
  const overrides = useAppStore(s => s.displayOverrides)
  const setDefault = useAppStore(s => s.setDisplayDefault)
  const setOverride = useAppStore(s => s.setDisplayOverride)
  const [open, setOpen] = useState(false)
  const [which, setWhich] = useState('')
  const edition = editionIds.includes(which) ? which : ''
  const holder = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => { if (!holder.current?.contains(e.target as Node)) setOpen(false) }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  return <div ref={holder} className="relative">
      <button ref={trigger} className={action} aria-expanded={open} onClick={() => setOpen(!open)}>Reading display ▾</button>
      {open && <div className="absolute top-full left-0 z-40 w-64 rounded-md border border-line bg-panel shadow-xl p-3 text-xs text-ink" role="group" aria-label="Reading display preferences">
        <label className="flex items-center justify-between gap-2 mb-2">Apply to
          <select className="max-w-40 bg-elevated rounded border border-line px-1 py-1" value={edition} onChange={e => setWhich(e.target.value)}>
            <option value="">All translations</option>{editionIds.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        {(interlinear ? interlinearFeatures : features).map(f => <label className="flex items-center justify-between gap-2 py-1" key={f}>{readingFeatures[f]}
          {edition ? <select className="bg-elevated border border-line rounded px-1" value={overrides[edition]?.[f] == null ? 'default' : overrides[edition][f] ? 'on' : 'off'} onChange={e => setOverride(edition, f, e.target.value === 'default' ? null : e.target.value === 'on')}>
            <option value="default">Use default ({defaults[f] ? 'on' : 'off'})</option><option value="on">On</option><option value="off">Off</option>
          </select> : <input type="checkbox" className="accent-accent" checked={defaults[f]} onChange={e => setDefault(f, e.target.checked)} />}
        </label>)}
      </div>}
    </div>
}

export function ReadingTools({ range }: { range: StudyRange }) {
  const parallels = useAppStore(s => s.parallels)
  const inspect = useAppStore(s => s.inspectStudy)
  return <div className="flex flex-wrap items-center gap-x-1 px-2 border-b border-line bg-panel">
    <ReadingDisplay editionIds={parallels} />
    <button className={action} onClick={() => inspect({ mode: 'context', range })}>Context</button>
    {parallels.length >= 2 && <button className={action} onClick={() => inspect({ mode: 'compare', range })}>Compare layout</button>}
  </div>
}

export function StructuredPassages({ edition, book, chapter, verses }: { edition: string; book: string; chapter: number; verses: number[] }) {
  const go = useAppStore(s => s.goToVerse)
  const outlines = getStudyStructures(edition, book, chapter)
  const available = new Set(verses)
  return <>{outlines.map(outline => {
    const rows = outline.rows.filter(row => available.has(row.firstVerse) && available.has(row.lastVerse))
    if (!rows.length) return null
    return <details key={outline.title} className="my-2 rounded border border-line px-2 py-1 text-xs text-muted">
      <summary className="cursor-pointer text-ink">{outline.title}</summary>
      <p className="my-1">{outline.source}</p>
      <ul>{rows.map(row => <li key={row.firstVerse + row.label} className="py-0.5"><button className="text-accent hover:underline text-left" onClick={() => go(book, chapter, row.firstVerse, edition)}>{row.label} · {chapter}:{row.firstVerse}{row.lastVerse !== row.firstVerse && `–${row.lastVerse}`}</button></li>)}</ul>
    </details>
  })}</>
}
