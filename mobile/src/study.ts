import { registerPlugin } from '@capacitor/core'
import { BOOK_BY_ID } from '@shared/books'
import { normalizeTextPreference, type TextPreference } from '@shared/textPreference'
import type { ChapterContent, ChapterRef, SearchQuery, SearchResponse } from '@shared/types'

export const ENGLISH = { BSB: 'Berean Standard Bible', KJV: 'King James Version' } as const
export type Edition = keyof typeof ENGLISH
export type Location = {
  translation: Edition
  book: string
  chapter: number
  verse: number
  scroll: number
}
interface StudyPlugin {
  getChapter(ref: ChapterRef): Promise<ChapterContent>
  search(query: SearchQuery): Promise<SearchResponse>
  shareText(args: { text: string }): Promise<void>
  copyText(args: { text: string }): Promise<void>
}
export const Study = registerPlugin<StudyPlugin>('Study')
export function loadLocal<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem('study.' + key) ?? 'null') ?? fallback
  } catch {
    return fallback
  }
}
export function initialLocation(): Location {
  const initial: Location = { translation: 'BSB', book: 'Gen', chapter: 1, verse: 1, scroll: 0 }
  const r = loadLocal('location', initial)
  const book = BOOK_BY_ID[r.book]
  if (
    !book ||
    !Object.hasOwn(ENGLISH, r.translation) ||
    !Number.isInteger(r.chapter) ||
    r.chapter < 1 ||
    r.chapter > book.chapters
  )
    return initial
  return {
    ...r,
    verse: Number.isInteger(r.verse) && r.verse > 0 ? r.verse : 1,
    scroll: Number.isFinite(r.scroll) ? Math.max(0, r.scroll) : 0
  }
}
export type Preferences = {
  restore: boolean
  ids: string[]
  terms: Record<string, boolean>
  order: TextPreference
  layout: boolean
  size: number
}
export function initialPreferences(): Preferences {
  const saved = loadLocal<Partial<Preferences>>('settings', {})
  return {
    restore: saved.restore === true,
    ids: Array.isArray(saved.ids)
      ? saved.ids.filter((x) => typeof x === 'string' && /^[GH][1-9]\d*$/.test(x))
      : [],
    terms: saved.terms ?? {},
    order: normalizeTextPreference(saved.order),
    layout: saved.layout === true,
    size: [18, 21, 24, 28].includes(saved.size ?? 0) ? saved.size! : 21
  }
}
