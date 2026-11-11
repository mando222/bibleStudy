import type { DatabaseSync } from 'node:sqlite'
import { isProtectedSourceName, isSourceForm, presetForm } from '../../shared/sourceWords'
import type { SourceWord, SourceWordCoverage } from '../../shared/types'

/** Strip editorial separators only. Preserve the source edition's letters, accents and vowel points. */
export function publisherForm(text: string, language: SourceWord['language']): string | null {
  const form = language === 'Greek' ? text : text.replace(/׃[פס]$/u, '').replace(/^[־׀׃]+|[־׀׃]+$/gu, '')
  return isSourceForm(language, form) ? form : null
}

type Span = {
  translation_id: SourceWordCoverage['translation']
  language: SourceWord['language']
  strongs: string
  text: string
  translit: string
  morph: string
  english: string
  trailer: string
  source_row: string
}

function canShow(span: Span): boolean {
  if (!span.translit?.trim() || !span.text || !/^[1-9]\d*(?:\.\d+)?$/.test(span.source_row) ||
      /^['’]/u.test(span.trailer) || span.strongs.startsWith('G') !== (span.language === 'Greek')) return false
  const form = publisherForm(span.text, span.language)
  if (!form) return false
  return !isProtectedSourceName(span.strongs) || !!presetForm({ ...span, text: form }, span.english)
}

/** Build counts, or recover one ID's counts from older, versioned occurrence tables. */
export function countSourceSpans(db: DatabaseSync, id?: string): Map<string, Map<Span['translation_id'], number>> {
  const fields = 's.translation_id, s.source_row, s.language, b.strongs, b.lemma AS text, b.translit, b.morph'
  // Each BSB span is one publisher token. KJV can span more than one printed token. The source
  // builder verified its full English range, including the limited case-insensitive "The LORD".
  const bsb = `SELECT ${fields}, b.surface AS english, b.trailer
    FROM verse_tokens b JOIN source_word_spans s ON s.translation_id=b.translation_id AND s.book_id=b.book_id
      AND s.chapter=b.chapter AND s.verse=b.verse AND s.end_position=b.position AND s.bsb_position=b.position
    WHERE b.translation_id='BSB' ${id ? 'AND b.strongs=?' : ''}`
  // The eligible KJV span table is much smaller than the independent English concordance.
  const kjv = `SELECT ${fields}, b.surface AS english, t.trailer
    FROM source_word_spans s CROSS JOIN verse_tokens b ON b.translation_id='BSB' AND b.book_id=s.book_id
      AND b.chapter=s.chapter AND b.verse=s.verse AND b.position=s.bsb_position
    JOIN verse_tokens t ON t.translation_id=s.translation_id AND t.book_id=s.book_id
      AND t.chapter=s.chapter AND t.verse=s.verse AND t.position=s.end_position AND t.strongs=b.strongs
    WHERE s.translation_id='KJV' ${id ? 'AND b.strongs=?' : ''}`
  const counts = new Map<string, Map<Span['translation_id'], number>>()
  const rows = db.prepare(bsb + ' UNION ALL ' + kjv).iterate(...(id ? [id, id] : []))
  for (const row of rows) {
    const span = row as unknown as Span
    if (!canShow(span)) continue
    const editions = counts.get(span.strongs) ?? new Map<Span['translation_id'], number>()
    editions.set(span.translation_id, (editions.get(span.translation_id) ?? 0) + 1)
    counts.set(span.strongs, editions)
  }
  return counts
}
