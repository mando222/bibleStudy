import { defaultTextPreference, type NtText } from './textPreference'

export interface ApparatusWord {
  surface: string
  strongs: string | null
  translit: string | null
  gloss: string | null
}

export interface GreekReading {
  words: ApparatusWord[]
  nativeRefs: string[]
  orderStatus?: 'unverified' | 'unknown'
}

export type GreekReadings = Partial<Record<NtText, GreekReading>>

export interface MasoreticPair { qere: string; ketiv: string; qereStrongs: string | null }
export interface StudyRef { book: string; chapter: number; verse: number }
export interface SweteReading { ref: StudyRef; text: string | null; issue?: string }
export type OriginalVerseReadings =
  | { kind: 'unmapped' }
  | { kind: 'greek'; ref: StudyRef; readings: GreekReadings }
  | { kind: 'ot'; ref: StudyRef; nativeLxxOnly?: true;
      mt: { words: { surface: string; sourceType: string | null }[]; nativeRefs: string[]; pairs: MasoreticPair[] };
      lxx: SweteReading | null }

export type VerseVariant =
  | { kind: 'greek'; verse: number; readings: GreekReadings; commonStart: number; commonEnd: number }
  | { kind: 'masoretic'; verse: number; pairs: MasoreticPair[] }

/** Compare the attested word sequences. Keep inflections, accents and elisions distinct.
 * Punctuation and paragraph marks are ignored only for comparison; display uses the stored text. */
export function compareGreekReadings(verse: number, readings: GreekReadings): VerseVariant | null {
  const forms = defaultTextPreference.nt.flatMap(id => {
    const reading = readings[id]
    return reading?.words.length ? [reading.words.map(w => w.surface.normalize('NFC').replace(/[.,;··:!?¶]+$/u, ''))] : []
  })
  if (!forms.length) return null
  const shortest = Math.min(...forms.map(words => words.length))
  let start = 0
  while (start < shortest && forms.every(words => words[start] === forms[0][start])) start++
  if (forms.length === defaultTextPreference.nt.length && forms.every(words => words.length === start)) return null
  let end = 0
  while (end < shortest - start && forms.every(words => words[words.length - 1 - end] === forms[0][forms[0].length - 1 - end])) end++
  return { kind: 'greek', verse, readings, commonStart: start, commonEnd: end }
}
