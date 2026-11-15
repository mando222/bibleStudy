import { createContext } from 'react'
import type { Highlight, Note, SourceWord, VerseRef } from '@shared/types'

export interface ReaderVerseAction extends VerseRef {
  text: string
  highlight?: Highlight
  notes: Note[]
}

export interface ReaderWordAction {
  source: SourceWord
  translation: string
  display: string
  published: string
  alongside: boolean
}

/** Touch readers present these actions in a sheet and use the same occurrence as the desktop reader. */
export const ReaderActions = createContext<{
  openLexicon: () => void
  verse: (action: ReaderVerseAction) => void
  compare: (action: ReaderWordAction) => void
} | null>(null)
