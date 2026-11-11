export const WORD_FREQUENCY_VERSION = '1'
export const WORD_FREQUENCY_PUNCTUATION = /^H901[4-9]$/

export type WordFrequencyEdition = 'MT' | 'NA' | 'TR' | 'BYZ'

export interface WordFrequencyQuery {
  id: string
  edition: WordFrequencyEdition
  form?: string | null
}

export interface WordFrequencyPassageQuery extends WordFrequencyQuery {
  book: string
  chapter: number
}

export interface WordFrequencyCounts {
  occurrences: number
  verses: number
  tagged: number
}

export interface WordFrequencyChapter extends WordFrequencyCounts {
  chapter: number
}

export interface WordFrequencyBook extends WordFrequencyCounts {
  book: string
  name: string
  chapters: WordFrequencyChapter[]
}

export interface WordFrequencyForm {
  id: string
  text: string
  morph: string
  translit: string | null
  count: number
}

export interface WordFrequency extends WordFrequencyCounts {
  id: string
  /** Included occurrences for which this ID is a publisher's alternate lexical tag. */
  alternateOccurrences: number
  edition: WordFrequencyEdition
  language: string
  coverage: 'complete' | 'partial' | 'unavailable'
  notice: string | null
  /** Always lists every form recorded for this entry in this edition. */
  forms: WordFrequencyForm[]
  books: WordFrequencyBook[]
}

export interface WordFrequencyVerse {
  /** Book, chapter and verse follow the selected edition's own numbering. */
  book: string
  chapter: number
  verse: number
  occurrences: number
  tokens: { text: string; matching: boolean; spaceBefore: boolean }[]
  /** Reader coordinates of the first matching occurrence in this native verse. */
  readerRef: { book: string; chapter: number; verse: number } | null
}
