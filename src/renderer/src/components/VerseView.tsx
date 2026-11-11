import { Fragment, useMemo } from 'react'
import type { ChapterRef, Highlight, Verse, VerseToken } from '@shared/types'
import { restoredVerseSegments } from '@shared/sourceWords'
import { useAppStore } from '@/store/useAppStore'
import { highlightVar } from '@/lib/highlights'
import { useWordComparison } from './RestoredWordComparison'

interface Props extends ChapterRef {
  v: Verse
  highlight?: Highlight
  hasNote?: boolean
  onOpenMenu: (verse: number, e: React.MouseEvent) => void
}

export default function VerseView({ v, translation, book, chapter, highlight, hasNote, onOpenMenu }: Props): JSX.Element {
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

  return (
    <span className="verse" tabIndex={-1} data-verse={v.verse}>
      <sup className="select-none align-super text-[0.62em] font-sans font-semibold text-accent/70 mr-0.5">
        <button onClick={e => onOpenMenu(v.verse, e)}
          aria-label={`Verse ${v.verse}, highlight or add a note`} title="Highlight or add a note"
          data-label={v.verse} className="reader-marker hover:text-accent" />
      </sup>
      {hasNote && <sup role="img" aria-label="Has a note" title="Has a note" data-label="✎"
        className="reader-marker select-none align-super text-[0.6em] text-accent mr-0.5" />}
      <span style={bg}>
        {parts.map(({ original, display, token }, index) => {
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
      </span>{' '}
    </span>
  )
}
