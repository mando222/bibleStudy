import { BOOK_BY_ID } from '@shared/books'
import type { VerseRef } from '@shared/types'
import type { useAppStore } from '@/store/useAppStore'
import { studyStorageKey } from './studyPreferences'

export type ReadingPosition = VerseRef & { scroll: number | null; interlinear?: boolean; viewKey?: string }
export const positionKey = () => studyStorageKey() + (import.meta.env.VITE_STUDY_MOBILE === 'true' ? ':phone-position' : ':reading-position')

export function parsePosition(value: unknown): ReadingPosition | null {
  if (!value || typeof value !== 'object') return null
  const p = value as Partial<ReadingPosition>
  if (!p.book || !Object.prototype.hasOwnProperty.call(BOOK_BY_ID, p.book) || typeof p.translation !== 'string' || !p.translation ||
      !Number.isSafeInteger(p.chapter) || p.chapter! < 1 || !Number.isSafeInteger(p.verse) || p.verse! < 0) return null
  return { book: p.book, translation: p.translation, chapter: p.chapter!, verse: p.verse!,
    scroll: typeof p.scroll === 'number' && Number.isFinite(p.scroll) && p.scroll >= 0 ? p.scroll : null,
    interlinear: p.interlinear === true, viewKey: typeof p.viewKey === 'string' ? p.viewKey : undefined }
}

export function readPosition(): ReadingPosition | null {
  try { return parsePosition(JSON.parse(localStorage.getItem(positionKey()) ?? 'null')) }
  catch { return null }
}

export function readerViewKey(s: ReturnType<typeof useAppStore.getState>): string {
  return JSON.stringify([s.book, s.chapter, s.referenceEdition || s.primary, s.activeVerse, s.primary,
    s.parallels, s.interlinear, s.interlinearEdition])
}

export function savePosition(position: ReadingPosition) {
  localStorage.setItem(positionKey(), JSON.stringify(position))
}

export function activeChapter(el: HTMLElement): HTMLElement {
  return el.querySelector<HTMLElement>('[data-flow-active]') ?? el
}

function precedingHeight(el: HTMLElement) {
  return el.querySelector<HTMLElement>('[data-flow-before]')?.offsetHeight ?? 0
}

export function visibleVerse(el: HTMLElement, top = el.getBoundingClientRect().top): number | null {
  const first = [...el.querySelectorAll<HTMLElement>('[data-verse]')].find(row => row.getBoundingClientRect().bottom > top + 1)
  return first ? Number(first.dataset.verse) : null
}

export function recordPosition(el: HTMLElement, book: string, chapter: number, translation: string, interlinear: boolean, viewKey: string) {
  if (el.closest('[hidden]') || el.clientHeight === 0) return
  const verse = el.dataset.readerAnchor == null ? visibleVerse(activeChapter(el), el.getBoundingClientRect().top) : Number(el.dataset.readerAnchor)
  if (verse != null && Number.isInteger(verse)) savePosition({ book, chapter, translation, verse, scroll: Math.max(0, el.scrollTop - precedingHeight(el)), interlinear, viewKey })
}

/** The saved offset preserves the place within a long verse. After reflow, use its verse anchor. */
export function restorePosition(el: HTMLElement, saved: ReadingPosition) {
  const row = activeChapter(el).querySelector<HTMLElement>('[data-verse="' + saved.verse + '"]')
  if (!row) return
  if (saved.scroll != null) el.scrollTop = precedingHeight(el) + saved.scroll
  const rect = row.getBoundingClientRect(), viewport = el.getBoundingClientRect()
  if (saved.scroll == null || rect.bottom <= viewport.top || rect.top >= viewport.bottom)
    el.scrollTop += rect.top - viewport.top - 12
  el.dataset.readerAnchor = String(saved.verse)
}
