// Splitting a verse into word units, shared by the build pipeline and the main process.
//
// This MUST be one implementation. The pipeline stores derived word tags as a packed array indexed
// by these units (see derived_tags in schema.sql), and the main process re-splits the same verse
// text to line tags back up with words. Two subtly different splitters would silently shift every
// tag in a verse by one.

/** Compare-key for a word: letters/digits only, lower-cased. '' for punctuation-only. */
export function normSurface(w: string): string {
  return w.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

/**
 * Split verse text into word units that re-concatenate to EXACTLY the original text
 * (surface = the word, trailer = its trailing punctuation + whitespace). One unit per
 * whitespace-delimited chunk, including punctuation-only chunks, so positions are stable.
 */
export function splitVerseUnits(text: string): { surface: string; trailer: string }[] {
  const units: { surface: string; trailer: string }[] = []
  for (const chunk of text.match(/\S+\s*/gu) ?? []) {
    const m = /^(\S+?)([^\p{L}\p{N}]*)(\s*)$/u.exec(chunk)
    if (m) units.push({ surface: m[1], trailer: m[2] + m[3] })
    else {
      const body = chunk.replace(/\s+$/, '')
      units.push({ surface: body, trailer: chunk.slice(body.length) })
    }
  }
  return units
}
