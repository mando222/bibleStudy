import { useMemo } from 'react'
import type { Verse, Highlight } from '@shared/types'
import { useAppStore, computeQuickReplacements } from '@/store/useAppStore'
import { buildWordStrongs, normalizeWord } from '@shared/wordLookup'
import { highlightVar } from '@/lib/highlights'

interface Props {
  v: Verse
  highlight?: Highlight
  hasNote?: boolean
  onOpenMenu: (verse: number, e: React.MouseEvent) => void
}

/** Renders one verse inline. Uses word tokens when Strong's is on OR a word-replace is
 *  active; otherwise plain (clean) text. Applies "agape" replacements per Strong's number. */
export default function VerseView({ v, highlight, hasNote, onOpenMenu }: Props): JSX.Element {
  const strongsVisible = useAppStore((s) => s.strongsVisible)
  const selectStrongs = useAppStore((s) => s.selectStrongs)
  const selected = useAppStore((s) => s.selectedStrongs)
  const replacements = useAppStore((s) => s.replacements)
  const quickReplace = useAppStore((s) => s.quickReplace)
  const quickReplaceConfig = useAppStore((s) => s.quickReplaceConfig)

  // Quick-Replace renderings are derived from the (persisted) config; manual replacements win.
  const effective = useMemo(
    () => ({ ...computeQuickReplacements(quickReplace, quickReplaceConfig), ...replacements }),
    [replacements, quickReplace, quickReplaceConfig]
  )
  const replActive = Object.keys(effective).length > 0
  const useTokens = (strongsVisible || replActive) && !!v.tokens && v.tokens.length > 0
  // Clean-text mode (Strong's numbers hidden): keep the exact verse text but let tagged words be
  // clicked to open the lexicon, by matching each word back to its token's Strong's number.
  const wordStrongs = useMemo(() => buildWordStrongs(v.tokens), [v.tokens])

  const bg = highlight
    ? {
        background: highlightVar(highlight.color),
        WebkitBoxDecorationBreak: 'clone' as const,
        boxDecorationBreak: 'clone' as const,
        borderRadius: '2px',
        padding: '0 1px'
      }
    : undefined

  return (
    <span className="verse" data-verse={v.verse}>
      <sup
        onClick={(e) => onOpenMenu(v.verse, e)}
        className="select-none cursor-pointer align-super text-[0.62em] font-sans font-semibold text-accent/70 hover:text-accent mr-0.5"
        title="Highlight or add a note"
      >
        {v.verse}
      </sup>
      {hasNote && (
        <sup className="select-none align-super text-[0.6em] text-accent mr-0.5" title="Has a note">
          ✎
        </sup>
      )}
      <span style={bg}>
        {useTokens ? (
          v.tokens!.map((tok) => {
            const clickable = !!tok.strongs
            const isSel = selected != null && selected === tok.strongs
            const replaced = tok.strongs ? effective[tok.strongs] : undefined
            return (
              <span key={tok.position}>
                <span
                  onClick={clickable ? () => selectStrongs(tok.strongs) : undefined}
                  className={
                    clickable
                      ? `cursor-pointer rounded-sm transition-colors ${
                          isSel ? 'bg-accent-soft text-accent' : 'hover:bg-accent-soft/60'
                        }`
                      : ''
                  }
                >
                  {replaced ? (
                    <span className="text-accent font-medium" title={tok.surface}>
                      {replaced}
                    </span>
                  ) : (
                    tok.surface
                  )}
                </span>
                {strongsVisible && tok.strongs && (
                  <sup
                    onClick={() => selectStrongs(tok.strongs)}
                    title={`Strong's ${tok.strongs}`}
                    className="align-super text-[0.6em] font-sans text-accent/70 hover:text-accent cursor-pointer mx-[1px]"
                  >
                    {tok.strongs.replace(/^[GH]/, '')}
                  </sup>
                )}
                {tok.trailer}
              </span>
            )
          })
        ) : wordStrongs.size > 0 ? (
          <span>
            {v.text.split(/(\s+)/).map((seg, i) => {
              if (!/\S/.test(seg)) return seg // whitespace verbatim
              const strongs = wordStrongs.get(normalizeWord(seg))
              return strongs ? (
                <span
                  key={i}
                  onClick={() => selectStrongs(strongs)}
                  className={`cursor-pointer rounded-sm transition-colors ${
                    selected === strongs ? 'bg-accent-soft text-accent' : 'hover:bg-accent-soft/60'
                  }`}
                >
                  {seg}
                </span>
              ) : (
                <span key={i}>{seg}</span>
              )
            })}{' '}
          </span>
        ) : (
          <span>{v.text} </span>
        )}
      </span>
    </span>
  )
}
