import type { VerseRef } from './types'

/** Native Swete addresses where a numbered row is immediately followed by a lettered
 * continuation under the same verse number in the bundled lxx-swete source files.
 * buildSeptuagintEdition currently imports only the numeric rows. Other Greek additions,
 * particularly in Esther, may have their own numbering and are not assigned by proximity. */
const omittedContinuations = new Map(Object.entries({
  Josh: '15:59 19:47 19:48 21:42 24:30 24:33',
  '1Kgs': '2:35 2:46 8:53 12:24 16:28',
  '2Kgs': '1:18',
  '2Chr': '35:19 36:2 36:4 36:5',
  Esth: '4:17 8:12',
  Prov: '3:16 3:22 4:27 6:8 6:11 7:1 8:21 9:12 9:18 10:4 12:11 12:13 13:9 13:13 15:18 17:6 18:22 22:8 22:9 22:14 24:22 25:10 25:29 26:11 27:20 27:21 28:17',
  Job: '2:9 19:4 36:28 42:17'
}).map(([book, refs]) => [book, new Set(refs.split(' '))] as const))

export function sweteEditionLabel(book: string): string {
  return book === 'Dan' ? 'Daniel in Theodotion’s Greek version (Swete edition)' : 'Septuagint (Greek translation, Swete edition)'
}

/** A null result means none of these known transcription issues applies. */
export function sweteReadingIssue(ref: Pick<VerseRef, 'book' | 'chapter' | 'verse'>, text: string): string | null {
  if (/^[IVXLCDM]+[.]?$/.test(text.trim())) return 'This entry contains only a chapter numeral. The Greek verse text is unavailable.'
  if (ref.book === '2Kgs' && ref.chapter === 23 && ref.verse === 31 && /\bom\b/.test(text)) {
    return 'The digital source mixes editorial notes into this verse. A reliable Greek reading is unavailable here.'
  }
  if (/[A-Za-z]/.test(text)) return 'The digital source mixes Latin characters into the Greek text. A reliable Greek reading is unavailable here.'
  if (omittedContinuations.get(ref.book)?.has(ref.chapter + ':' + ref.verse)) {
    return 'The bundled verse omits lettered sections at this address in Swete’s text. The full Greek reading is unavailable here.'
  }
  return null
}
