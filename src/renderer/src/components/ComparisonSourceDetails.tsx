import { sourceLocation } from '@shared/sourceWords'
import type { SourceWord } from '@shared/types'

interface Props {
  source: SourceWord
  translation: string
  display: string
}

export default function ComparisonSourceDetails({ source, translation, display }: Props): JSX.Element {
  const greek = source.language === 'Greek'
  return (
    <details className="mt-2 text-xs text-muted">
      <summary className="w-fit cursor-pointer rounded-sm hover:text-ink">Source-word evidence</summary>
      <div className="mt-2 space-y-1">
        <p>
          {source.language}{' '}
          <bdi dir={greek ? 'ltr' : 'rtl'} lang={greek ? 'grc' : source.language === 'Hebrew' ? 'he' : 'arc'}
            className={greek ? 'font-greek text-base text-ink' : 'font-hebrew text-base text-ink'}>
            {source.text}
          </bdi>
          {' · '}{sourceLocation(source)}
        </p>
        {source.translit && <p>Transliteration · <bdi>{source.translit}</bdi></p>}
        {source.correspondences?.map(link => <p key={link.edition + link.rowId}>
          Corresponding occurrence · {sourceLocation(link)}{link.citation !== source.citation && ' · ' + link.citation}
        </p>)}
        {display === 'YHWH' && <p>Restore words shows YHWH for the four Hebrew consonants.</p>}
        <p>
          {source.citation ?? (source.evidence === 'corroborated'
            ? `The ${translation} word tag agrees with the Berean alignment and ${greek ? 'the Greek Textus Receptus' : 'the Masoretic text'} at this verse.`
            : `The Berean translation table links this ${translation} wording to the source form at this verse.`)}
        </p>
      </div>
    </details>
  )
}
