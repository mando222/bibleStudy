import { Fragment, useCallback, useState } from 'react'
import { compareGreekReadings, type GreekReadings, type MasoreticPair, type OriginalVerseReadings } from '@shared/apparatus'
import { BOOK_BY_ID } from '@shared/books'
import { defaultTextPreference, textEditionLabels } from '@shared/textPreference'
import { masoreticSourceNote } from '@shared/originalText'
import { sweteEditionLabel } from '@shared/lxxIntegrity'
import type { VerseRef } from '@shared/types'
import { useStudyQuery } from '@/hooks/useStudyQuery'
import { useAppStore } from '@/store/useAppStore'

function nativeLabel(refs: string[], chapter: number, verse: number) {
  if (!refs.length) return 'Edition numbering unavailable'
  return refs.some(ref => ref !== chapter + ':' + verse) ? 'Edition numbering ' + refs.join(', ') : ''
}

export function GreekVerseReadings({ readings, chapter, verse, onWord }: {
  readings: GreekReadings; chapter: number; verse: number; onWord?: (strongs: string) => void
}) {
  const order = useAppStore(s => s.preferredTextOrder.nt)
  const variant = compareGreekReadings(verse, readings)
  return <dl className="space-y-2">
    {order.map(id => {
      const reading = readings[id]
      const numbering = reading && nativeLabel(reading.nativeRefs, chapter, verse)
      return <div key={id}>
        <dt className="text-xs font-medium text-muted">{textEditionLabels[id]}</dt>
        <dd>{reading?.words.length ? <>
          {numbering && <div className="text-xs text-muted">{numbering}</div>}
          {reading.orderStatus && <div className="text-xs text-muted">{reading.orderStatus === 'unknown'
            ? 'This database lacks edition word-order checks.' : 'Edition word order unverified at this reference.'}</div>}
          <p lang="grc" className="font-greek text-[15px] leading-relaxed">{reading.words.map((word, i) => {
            const marked = variant?.kind === 'greek' && i >= variant.commonStart && i < reading.words.length - variant.commonEnd
            const style = marked ? 'underline decoration-accent underline-offset-4' : undefined
            return <Fragment key={i}>{i > 0 ? ' ' : ''}{onWord && word.strongs ?
              <button className={style} onClick={() => onWord(word.strongs!)} title={[word.translit, word.strongs].filter(Boolean).join(' · ')}>{word.surface}</button>
              : <span className={style}>{word.surface}</span>}</Fragment>
          })}</p>
        </> : <span className="text-xs text-muted">No reading recorded at this study reference.</span>}</dd>
      </div>
    })}
  </dl>
}

export function MasoreticPairs({ pairs, onWord }: { pairs: MasoreticPair[]; onWord?: (strongs: string) => void }) {
  const order = useAppStore(s => s.preferredTextOrder.masoretic)
  return <div className="space-y-1.5">{pairs.map((pair, i) =>
    <div key={i} className="flex flex-wrap gap-x-3 gap-y-1 items-baseline">
      {order.map(side => <div key={side} className="inline-flex items-baseline gap-1.5">
        <span className="text-xs text-muted" title={side === 'ketiv' ?
          'TAHOT records the written consonants with editorial vowel pointing.' : undefined}>{textEditionLabels[side]}</span>
        {side === 'qere' && pair.qereStrongs && onWord ?
          <button className="font-hebrew hover:text-accent" dir="rtl" title={pair.qereStrongs}
            onClick={() => onWord(pair.qereStrongs!)}>{pair.qere}</button> :
          <bdi dir="rtl" className="font-hebrew">{pair[side]}</bdi>}
      </div>)}
    </div>
  )}</div>
}

function OtReadings({ value }: { value: Extract<OriginalVerseReadings, { kind: 'ot' }> }) {
  const order = useAppStore(s => s.preferredTextOrder.ot)
  const { ref, mt, lxx } = value
  const notes = [...new Set(mt.words.map(w => masoreticSourceNote(w.sourceType ?? undefined)?.description).filter(Boolean))]
  const numbering = nativeLabel(mt.nativeRefs, ref.chapter, ref.verse)
  return <dl className="space-y-3">{order.map(id =>
    <div key={id}>
      <dt className="text-xs font-medium text-muted">{id === 'LXX' ? sweteEditionLabel(ref.book) : textEditionLabels[id]}</dt>
      <dd>{id === 'LXX' ? lxx?.text ? <>
        <div className="text-xs text-muted">{BOOK_BY_ID[lxx.ref.book]?.name} {lxx.ref.chapter}:{lxx.ref.verse}</div>
        <p lang="grc" className="font-greek text-base">{lxx.text}</p>
      </> : <p className="text-xs text-muted">{lxx?.issue ?? (lxx ? 'No text recorded at this reference.' : 'No verified Septuagint verse mapping.')}</p>
      : mt.words.length ? <>
        <div className="text-xs text-muted">TAHOT reading text{numbering && ' · ' + numbering}</div>
        <p dir="rtl" className="font-hebrew text-lg">{mt.words.map((word, i) => {
          const note = masoreticSourceNote(word.sourceType ?? undefined)
          return <Fragment key={i}>{i > 0 ? ' ' : ''}<span className={note ? 'underline decoration-dotted underline-offset-4' : undefined}
            title={note?.description}>{word.surface}</span></Fragment>
        })}</p>
        {mt.words.some(w => !w.sourceType) && <p className="text-xs text-muted">This database has no witness code for some of these words.</p>}
        {notes.map(note => <p key={note} className="text-xs text-muted">{note}</p>)}
        {mt.pairs.length > 0 && <MasoreticPairs pairs={mt.pairs} />}
        {mt.words.some(w => w.sourceType?.startsWith('Q')) && !mt.pairs.length && <p className="text-xs text-muted">No paired written form is recorded in the bundled data for this verse.</p>}
      </> : <p className="text-xs text-muted">{value.nativeLxxOnly ? 'No verified Masoretic verse mapping.' : 'No Masoretic reading recorded at this reference.'}</p>}</dd>
    </div>
  )}</dl>
}

export default function OriginalVerseComparison({ translation, book, chapter, verse }: VerseRef) {
  const [open, setOpen] = useState(false)
  const query = useStudyQuery(useCallback(() => window.api.getOriginalVerseReadings({ translation, book, chapter, verse }),
    [translation, book, chapter, verse]), open)
  const data = query.data
  return <section className="my-2">
    <button type="button" aria-expanded={open} className="text-xs text-accent hover:underline" onClick={() => setOpen(!open)}>
      {open ? 'Hide source texts' : 'Compare source texts'}
    </button>
    {open && <div className="mt-2 space-y-2" aria-label="Verse source texts">
      {query.loading && <p role="status" className="text-xs text-muted">Loading source readings…</p>}
      {query.error && <button className="text-xs text-accent" onClick={query.retry}>Source texts unavailable · Retry</button>}
      {data?.kind === 'unmapped' && <p className="text-xs text-muted">No verified source-text reference for this passage.</p>}
      {data && data.kind !== 'unmapped' && <>
        <p className="text-xs text-muted">Readings at {BOOK_BY_ID[data.ref.book]?.name} {data.ref.chapter}:{data.ref.verse} ({data.kind === 'ot' && data.nativeLxxOnly ? 'Swete numbering' : 'study numbering'}).
          {data.kind === 'greek' ? ' Greek editions as represented in STEPBible TAGNT.' : ' Masoretic reading from STEPBible TAHOT and Swete’s Greek translation.'}</p>
        {data.kind === 'greek' && defaultTextPreference.nt.every(id => data.readings[id]?.words.length) &&
          !compareGreekReadings(data.ref.verse, data.readings) && <p className="text-xs text-muted">The three bundled readings have the same sequence of Greek word forms here.</p>}
        {data.kind === 'greek' ? <GreekVerseReadings readings={data.readings} chapter={data.ref.chapter} verse={data.ref.verse} /> : <OtReadings value={data} />}
      </>}
    </div>}
  </section>
}
