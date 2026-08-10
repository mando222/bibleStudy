import type { VerseToken } from './types'

/** Normalize a displayed word for matching against a token surface (case- and punctuation-insensitive). */
export function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/[^\p{Letter}]/gu, '')
}

/**
 * Map each tagged word of a verse to its Strong's number, keyed by normalized surface. Lets the
 * clean reading text (rendered verbatim, not from tokens) still be clicked word-by-word to open the
 * lexicon — even when the Strong's numbers are hidden. Untagged words simply aren't in the map.
 */
export function buildWordStrongs(tokens: VerseToken[] | null | undefined): Map<string, string> {
  const m = new Map<string, string>()
  for (const t of tokens ?? []) {
    if (!t.strongs) continue
    const key = normalizeWord(t.surface)
    if (key && !m.has(key)) m.set(key, t.strongs)
  }
  return m
}
