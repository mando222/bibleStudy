export interface NoteDraft {
  text: string
  /** null means the verse had no note. A legacy draft has no recorded baseline. */
  base?: string | null
}

export function readNoteDraft(storage: Storage, key: string, legacy: 'plain' | 'json'): NoteDraft | null {
  const raw = storage.getItem(key)
  if (raw === null) return null
  try {
    const value = JSON.parse(raw)
    if (value && typeof value.text === 'string' && (typeof value.base === 'string' || value.base == null)) return value
    if (legacy === 'json' && typeof value === 'string') return { text: value }
  } catch { /* Earlier desktop drafts were plain text. */ }
  return legacy === 'plain' ? { text: raw } : null
}

export function draftNeedsReview(draft: NoteDraft, saved: string | null): boolean {
  return saved !== null && saved !== draft.text && saved !== draft.base
}
