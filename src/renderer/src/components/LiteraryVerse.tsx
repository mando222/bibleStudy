import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { LiteraryGroup } from '@shared/literaryLayout'
import type { ReviewedSpeaker } from '@shared/passageStudy'
import type { VerseSegment } from '@shared/sourceWords'
import type { VerseRef } from '@shared/types'
import VerseRefs from './VerseRefs'

interface Attribution {
  label: string
  evidence: string
  detail: string
  refs?: string[]
}

function SpeakerGuide({ sources, margin }: { sources: Attribution[]; margin: boolean }): JSX.Element {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    panel.current?.focus({ preventScroll: true })
    const closeOutside = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) setOpen(false)
    }
    const closeEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus({ preventScroll: true })
      }
    }
    const close = () => setOpen(false)
    const closeOnScroll = (event: Event) => {
      if (!(event.target instanceof Node) || !panel.current?.contains(event.target)) close()
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeEscape)
    window.addEventListener('scroll', closeOnScroll, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeEscape)
      window.removeEventListener('scroll', closeOnScroll, true)
      window.removeEventListener('resize', close)
    }
  }, [open])
  const anchor = open ? trigger.current?.getBoundingClientRect() : undefined
  const button = <button ref={trigger} type="button"
    className={`reader-marker text-accent hover:underline ${margin ? 'absolute bottom-0 [inset-inline-end:0.5em] text-sm' : ''}`}
    data-label="❝" title="Speaker and quotation guide" aria-label={`Speaker guide: ${sources.map(s => s.label).join(', ')}`}
    aria-controls={open ? id : undefined} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)} />
  return <>
    {margin ? <span data-speaker-placement="margin" className="relative inline-block w-0 align-baseline select-none font-sans">{button}</span> :
      <sup data-speaker-placement="inline" className="align-super select-none font-sans text-[0.68em] mx-0.5">{button}</sup>}
    {anchor && createPortal(
      <div ref={panel} role="dialog" id={id} tabIndex={-1} aria-label="Speaker and quotation guide"
        className="fixed z-50 w-72 max-w-[calc(100vw-1rem)] max-h-[40vh] overflow-auto rounded-md border border-line bg-panel p-3 font-sans text-sm text-ink shadow-lg"
        style={{ left: Math.max(8, Math.min(anchor.left, window.innerWidth - 296)),
          ...(anchor.bottom + window.innerHeight * 0.4 > window.innerHeight
            ? { bottom: window.innerHeight - anchor.top + 3 } : { top: anchor.bottom + 3 }) }}>
        <button className="float-right px-1 text-muted hover:text-accent" type="button" aria-label="Close speaker guide"
          onClick={() => { setOpen(false); trigger.current?.focus({ preventScroll: true }) }}>×</button>
        {sources.map((source, i) => <div key={i} className={i ? 'mt-2 pt-2 border-t border-line' : ''}>
          <div className="font-medium">{source.label}</div>
          <div className="text-xs text-muted">{source.evidence}</div>
          <p className="mt-1">{source.detail}</p>
          {source.refs && <div className="mt-2"><VerseRefs refs={source.refs} /></div>}
        </div>)}
      </div>, document.body)}
  </>
}

type Props = {
  groups: LiteraryGroup[]
  location: VerseRef
  text: string
  reviewed: ReviewedSpeaker[]
  verseControls: ReactNode
  renderParts: (parts: VerseSegment[]) => ReactNode
}

function paragraphIndent(style?: string): number {
  if (!style) return 0
  const numbered = /^(?:p[iemq]|li)(\d+)$/.exec(style)
  return numbered ? Number(numbered[1]) : /^(?:p|pmo|pm|pmc|mi)$/.test(style) ? 1 : 0
}

/** Keep speaker controls and editorial headings outside the selectable numbered verse text.
 * Each native line contains its inline speech markers, even when a speaker begins mid-line. */
export default function LiteraryVerse({ groups, location, text, reviewed, verseControls, renderParts }: Props): JSX.Element {
  const lines: LiteraryGroup[][] = []
  for (const group of groups) {
    const newLine = group.marks.some(m => m.kind !== 'speaker' && m.kind !== 'descriptive')
    if (!lines.length || newLine) lines.push([])
    lines[lines.length - 1].push(group)
  }
  return <>{lines.map((line, index) => {
    const marks = line[0].marks
    const titles = marks.filter(m => m.kind === 'heading' || m.kind === 'superscription')
    const poetry = marks.find(m => m.kind === 'poetry')
    const paragraph = marks.find(m => m.kind === 'paragraph')
    const lineBreak = marks.some(m => m.kind === 'line')
    const blankLines = marks.filter(m => m.kind === 'line' && m.blank).length
    const contents = <>{line.map((group, i) => {
      const atStart = index === 0 && i === 0
      const sources: Attribution[] = atStart ? reviewed.map(s => ({
        label: s.label, evidence: s.disputed ? 'Disputed attribution · reviewed study note' : 'Reviewed study note',
        detail: s.detail, refs: s.refs
      })) : []
      for (const mark of group.marks) {
        if (mark.kind === 'speaker') sources.push({ label: 'Jesus', evidence: `${location.translation} · edition-supplied speaker marking`,
          detail: text.slice(mark.at, mark.end) })
      }
      // A guide at a known visual line start sits in the margin. If speech begins inside
      // a flowing verse, keep its small mark beside the specific words it identifies.
      const margin = i === 0 && (!!poetry || !!paragraph || lineBreak || titles.length > 0 || (atStart && location.verse === 1))
      return <Fragment key={i}>
        {sources.length > 0 && margin && <SpeakerGuide sources={sources} margin />}
        {atStart && verseControls}
        {sources.length > 0 && !margin && <SpeakerGuide sources={sources} margin={false} />}
        {group.descriptive ? <i>{renderParts(group.parts)}</i> : renderParts(group.parts)}
      </Fragment>
    })}</>
    return <Fragment key={index}>
      {titles.map((title, n) => <span key={n} className={title.kind === 'heading'
        ? 'block mt-4 mb-1 font-sans text-sm font-medium tracking-wide text-muted'
        : 'block mb-2 italic text-start text-muted'}
        title={title.kind === 'heading' ? `Publisher heading · ${location.translation}` : `Superscription · ${location.translation}`}
        data-literary-kind={title.kind}>{title.text}</span>)}
      {poetry ? <span data-literary-kind="poetry" data-indent={poetry.indent}
        className="block text-start" style={{ paddingInlineStart: `${Math.max(0, poetry.indent - 1) * 1.15}em`,
          marginBlockStart: blankLines ? `${blankLines * 0.8}em` : paragraph ? '0.6em' : undefined }}>{contents}</span> : <>
        {(paragraph || lineBreak) && <span aria-hidden="true" data-literary-kind={paragraph ? 'paragraph' : 'line'}
          className={paragraph ? 'block mt-2' : 'block'} style={{ height: blankLines ? `${blankLines * 0.8}em` : undefined }} />}
        {paragraph && paragraphIndent(paragraph.style) > 0 &&
          <span aria-hidden="true" className="inline-block" style={{ width: `${paragraphIndent(paragraph.style)}em` }} />}
        {contents}
      </>}
    </Fragment>
  })}</>
}
