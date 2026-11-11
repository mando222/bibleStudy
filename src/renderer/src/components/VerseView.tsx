import { Fragment, useMemo } from 'react'
import type { ChapterRef, Highlight, Verse, VerseToken } from '@shared/types'
import { restoredVerseSegments, type VerseSegment } from '@shared/sourceWords'
import { useAppStore } from '@/store/useAppStore'
import { highlightVar } from '@/lib/highlights'
import { getReviewedSpeakers } from '@shared/passageStudy'
import { literaryGroups } from '@shared/literaryLayout'
import LiteraryVerse from './LiteraryVerse'
import { useWordComparison } from './RestoredWordComparison'

interface Props extends ChapterRef {
  v: Verse
  literary?: boolean
  speakers?: boolean
  headings?: boolean
  verseNumbers?: boolean
  highlight?: Highlight
  hasNote?: boolean
  onOpenMenu: (verse: number, e: React.MouseEvent) => void
}

export default function VerseView({ v, translation, book, chapter, literary = false, speakers = false, headings = literary, verseNumbers = true, highlight, hasNote, onOpenMenu }: Props): JSX.Element {
  const strongsVisible = useAppStore(s => s.strongsVisible)
  const selectStrongs = useAppStore(s => s.selectStrongs)
  const selected = useAppStore(s => s.selectedStrongs)
  const enabled = useAppStore(s => s.restoreSourceWords)
  const terms = useAppStore(s => s.sourceWordTerms)
  const comparison = useWordComparison()
  const parts = useMemo(() => restoredVerseSegments(v, { translation, book, chapter }, enabled, terms),
    [v, translation, book, chapter, enabled, terms])
  const inspect = (token: VerseToken): void => {
    if (!token.strongs || window.getSelection()?.isCollapsed === false) return
    selectStrongs(token.strongs, {
      translation, book, chapter, verse: v.verse, surface: token.sourceWord?.english ?? token.surface,
      derived: !!token.derived, sourceWord: token.sourceWord
    })
  }
  const bg = highlight ? {
    background: highlightVar(highlight.color),
    WebkitBoxDecorationBreak: 'clone' as const,
    boxDecorationBreak: 'clone' as const,
    borderRadius: '2px',
    padding: '0 1px'
  } : undefined

  const groups = useMemo(() => literaryGroups(parts, v.layout ?? [], literary, speakers, headings),
    [parts, v.layout, literary, speakers, headings])
  const reviewed = useMemo(() => speakers ? getReviewedSpeakers(translation, book, chapter, v.verse) : [],
    [speakers, translation, book, chapter, v.verse])
  const verseControls = <>
    <sup className={`select-none align-super text-[0.62em] font-sans font-semibold text-accent/70 ${verseNumbers ? 'mr-0.5' : 'relative inline-block w-0'}`}>
      <button type="button" data-verse-action="" onClick={e => onOpenMenu(v.verse, e)}
        aria-label={`Verse ${v.verse}, highlight or add a note`} title="Highlight or add a note"
        data-label={verseNumbers ? v.verse : '⋯'}
        className={`reader-marker hover:text-accent ${verseNumbers ? '' : 'absolute z-10 bottom-0 start-0 rounded bg-panel px-1 leading-tight opacity-0 group-hover/verse:opacity-100 focus-visible:opacity-100'}`} />
    </sup>
    {hasNote && <sup role="img" aria-label="Has a note" title="Has a note" data-label="✎"
      className="reader-marker select-none align-super text-[0.6em] text-accent mr-0.5" />}
  </>
  const renderParts = (pieces: VerseSegment[]) => (
    <span style={bg}>
      {pieces.map(({ original, display, token }, index) => {
        const linked = token?.strongs ? token : undefined
        const changed = original !== display
        const source = changed ? linked?.sourceWord : undefined
        const preview = (anchor: HTMLElement, mode: 'hover' | 'focus' | 'explore') => {
          if (source) comparison?.show({ anchor, source, translation, display }, mode)
        }
        return (
          <Fragment key={index}>
            <span data-scripture-part="" data-published={changed ? original : undefined}
              title={token?.derived ? 'Inferred word mapping' : undefined}
              data-restored-word={source ? '' : undefined}
              aria-haspopup={source ? 'dialog' : undefined}
              aria-description={source ? 'Down Arrow explores translations. Enter opens the lexicon.' : undefined}
              onMouseEnter={source ? e => { if (!e.buttons) preview(e.currentTarget, 'hover') } : undefined}
              onMouseLeave={source ? e => comparison?.leave(e.relatedTarget) : undefined}
              onPointerDown={source ? () => comparison?.dismiss() : undefined}
              onFocus={source ? e => { if (e.currentTarget.matches(':focus-visible')) preview(e.currentTarget, 'focus') } : undefined}
              onBlur={source ? e => comparison?.leave(e.relatedTarget) : undefined}
              role={linked ? 'button' : undefined} tabIndex={linked ? 0 : undefined}
              onClick={linked ? () => inspect(linked) : undefined}
              onKeyDown={linked ? e => {
                if (source && e.key === 'ArrowDown') { e.preventDefault(); preview(e.currentTarget, 'explore') }
                else if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  if (source) comparison?.dismiss()
                  inspect(linked)
                }
              } : undefined}
              className={linked ? `cursor-pointer rounded-sm hover:bg-accent-soft/60 ${changed ? 'text-accent font-medium' : ''}
                ${selected === linked.strongs ? 'bg-accent-soft text-accent' : ''}
                ${token?.derived ? 'underline decoration-dotted decoration-accent/40 underline-offset-4' : ''}` : undefined}>
              {display}
            </span>
            {strongsVisible && token?.strongs && (
              <sup onClick={() => inspect(token)} data-label={token.strongs.replace(/^[GH]/, '')}
                aria-label={`Strong's ${token.strongs}`} title={`Strong's ${token.strongs}${token.derived ? ' (inferred)' : ''}`}
                className={`reader-marker select-none align-super text-[0.6em] font-sans cursor-pointer mx-[1px] hover:text-accent ${token.derived ? 'text-faint italic' : 'text-accent/70'}`} />
            )}
          </Fragment>
        )
      })}
    </span>
  )
  return (
    <span className="verse group/verse" tabIndex={-1} data-verse={v.verse}>
      {literary || speakers || v.layout?.some(m => m.kind === 'superscription' || (headings && m.kind === 'heading')) ? <LiteraryVerse groups={groups} location={{ translation, book, chapter, verse: v.verse }}
        text={v.text} reviewed={reviewed} verseControls={verseControls} renderParts={renderParts} /> :
        <>{verseControls}{renderParts(parts)}</>}{' '}
    </span>
  )
}
