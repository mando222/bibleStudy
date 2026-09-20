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

// ---- derived-tag wire format ------------------------------------------------
// `derived_tags.strongs` holds one slot per word unit above. A slot is:
//
//   "-"      the word carries no tag, and stands as its own token
//   "H3068"  the word carries this tag and STARTS a token
//   "+"      the word continues the previous token
//
// The continuation marker exists because the Berean tags phrases, not words: "of the LORD" is a
// single token carrying H3068. Without it, every word of that phrase becomes its own token holding
// H3068, and Quick Replace substitutes once per token — rendering "Yahweh Yahweh Yahweh". Marking
// continuations keeps a phrase one token, exactly as the scholar-tagged translations store it,
// while still letting two genuinely separate occurrences ("LORD, LORD") stay two tokens.

export interface DerivedTag {
  strongs: string | null
  /** This word belongs to the same source token as the word before it. */
  continues: boolean
}

export function packTags(tags: DerivedTag[]): string {
  return tags.map((t) => (t.continues ? '+' : (t.strongs ?? '-'))).join(' ')
}

export function unpackTags(packed: string): DerivedTag[] {
  const out: DerivedTag[] = []
  for (const slot of packed.split(' ')) {
    if (slot === '+' && out.length) out.push({ strongs: out[out.length - 1].strongs, continues: true })
    else out.push({ strongs: slot === '-' || slot === '+' ? null : slot, continues: false })
  }
  return out
}
