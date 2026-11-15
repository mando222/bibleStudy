import { parsePosition, positionKey, readPosition } from '@/lib/readingPosition'
import type { VerseRef } from '@shared/types'
import { studyStorageKey } from '@/lib/studyPreferences'

const defaultProfile = 'obs-app-state'
export const phoneTextSizes = [15, 16, 17, 18, 19, 21, 24, 28]
export { positionKey } from '@/lib/readingPosition'
export const sizeKey = () => studyStorageKey() + ':phone-size'

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}
export function readSize(): number {
  const n = Number(localStorage.getItem(sizeKey()))
  return phoneTextSizes.includes(n) ? n : 17
}

/** Restore a verse anchor across different screen sizes. Absolute scroll offsets are device-local. */
export function initializePhonePreferences() {
  const key = studyStorageKey()
  const state = localStorage.getItem(key)
  let extras: Record<string, unknown> | null = null
  if (state) {
    try { extras = object(JSON.parse(state)?.phone) }
    catch { /* An older reader document can have no mobile fields. */ }
  }
  const hasPosition = localStorage.getItem(positionKey()) !== null
  if (localStorage.getItem(sizeKey()) === null) {
    const backupSize = extras?.textSize
    // The trial and early phone builds stored one shared size. Only an already visited
    // profile can inherit it. A newly restored desktop profile starts at the phone default.
    const legacy = key === defaultProfile || hasPosition ? Number(localStorage.getItem('phone.type-size')) : 0
    const size = typeof backupSize === 'number' && phoneTextSizes.includes(backupSize) ? backupSize
      : phoneTextSizes.includes(legacy) ? legacy : 17
    localStorage.setItem(sizeKey(), String(size))
  }
  if (!hasPosition) {
    const saved = parsePosition(extras?.position)
    if (saved) localStorage.setItem(positionKey(), JSON.stringify({ ...saved, scroll: null }))
  }
}

/** Desktop readers use the established state envelope. Only phones consume its optional sibling. */
export function portableReaderState(raw: string | null): string {
  const envelope = raw === null ? { state: {}, version: 1 } : JSON.parse(raw)
  if (!object(envelope) || !object(envelope.state)) throw new Error('Invalid reader settings.')
  const saved = readPosition()
  const anchor = saved ? { translation: saved.translation, book: saved.book, chapter: saved.chapter, verse: saved.verse, interlinear: saved.interlinear } : null
  return JSON.stringify({ ...envelope, phone: { textSize: readSize(), ...(anchor && { position: anchor }) } })
}

/** Trial drafts predate profile support and can only be unambiguously claimed by the default profile. */
export function verseDraftKey(ref: VerseRef): string {
  const suffix = [ref.translation, ref.book, ref.chapter, ref.verse].join('.')
  const key = studyStorageKey() + ':draft:' + suffix
  if (studyStorageKey() === defaultProfile) {
    const oldKey = 'study.draft.' + suffix
    const old = localStorage.getItem(oldKey)
    if (old !== null) {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, old)
      localStorage.removeItem(oldKey)
    }
  }
  return key
}
