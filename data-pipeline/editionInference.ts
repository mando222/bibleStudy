import type { DatabaseSync } from 'node:sqlite'
import { deriveVerseTags, packTags, type PivotWord, stemWord, wordKey, splitVerseUnits } from './lib'
import { mapPassage } from '../src/shared/passageMapping'

function referenceKey(r: { book_id: string; chapter: number; verse: number }, edition: string) {
  const ref = mapPassage({ book: r.book_id, chapter: r.chapter, verse: r.verse }, edition, 'KJV')
  return ref ? `${ref.book}|${ref.chapter}|${ref.verse}` : null
}

export function buildDerivedTags(db: DatabaseSync): {
  coverage: { id: string; pct: number }[]
  agreement: number
} {
  // Pivot: the BSB is 99% tagged and aligned to the originals.
  const pivot = new Map<string, PivotWord[]>()
  for (const r of db
    .prepare(
      `SELECT book_id, chapter, verse, position, surface, strongs FROM verse_tokens
        WHERE translation_id = 'BSB' ORDER BY book_id, chapter, verse, position`
    )
    .all() as {
    book_id: string
    chapter: number
    verse: number
    position: number
    surface: string
    strongs: string | null
  }[]) {
    const k = referenceKey(r, 'BSB')
    if (!k) continue
    let arr = pivot.get(k)
    if (!arr) pivot.set(k, (arr = []))
    // Every word of a multi-word Berean token carries that token's position, so the words it maps
    // to stay ONE token downstream — otherwise "of the LORD" becomes three tokens all holding
    // H3068, and Quick Replace renders "Yahweh Yahweh Yahweh".
    for (const w of r.surface.split(/\s+/)) {
      const key = wordKey(w)
      if (key) arr.push({ key, strongs: r.strongs, token: r.position })
    }
  }

  // Which Strong's numbers each verse actually contains, and which English words are attested for
  // each number. Both are learned from the tagged translations plus each entry's KJV usage list.
  const candidates = new Map<string, Set<string>>()
  const attested = new Map<string, Set<string>>()
  const add = (m: Map<string, Set<string>>, k: string, v: string): void => {
    let s = m.get(k)
    if (!s) m.set(k, (s = new Set()))
    s.add(v)
  }
  for (const r of db
    .prepare(
      `SELECT book_id, chapter, verse, surface, strongs, translation_id FROM verse_tokens
        WHERE strongs IS NOT NULL AND translation_id IN ('KJV','BSB')`
    )
    .all() as {
    book_id: string
    chapter: number
    verse: number
    surface: string
    strongs: string
    translation_id: string
  }[]) {
    const key = referenceKey(r, r.translation_id)
    if (key) add(candidates, key, r.strongs)
    for (const w of r.surface.split(/\s+/)) {
      const k = wordKey(w)
      if (k) add(attested, r.strongs, stemWord(k))
    }
  }
  for (const r of db.prepare('SELECT id, kjv_def FROM strongs_lexicon WHERE kjv_def IS NOT NULL').all() as {
    id: string
    kjv_def: string
  }[]) {
    for (const w of r.kjv_def.match(/[A-Za-z]+/g) ?? []) {
      const k = stemWord(wordKey(w))
      if (k.length > 2) add(attested, r.id, k)
    }
  }

  const targets = db
    .prepare(
      "SELECT id FROM translations WHERE is_original=0 AND language='eng' AND id NOT IN ('KJV','BSB') ORDER BY sort_order"
    )
    .all()
    .map((row) => String(row.id))

  const ins = db.prepare(
    'INSERT OR REPLACE INTO derived_tags (translation_id, book_id, chapter, verse, strongs) VALUES (?,?,?,?,?)'
  )
  const coverage: { id: string; pct: number }[] = []
  db.exec('BEGIN')
  for (const id of targets) {
    let words = 0
    let hits = 0
    for (const r of db
      .prepare('SELECT book_id, chapter, verse, text FROM verses WHERE translation_id = ?')
      .all(id) as { book_id: string; chapter: number; verse: number; text: string }[]) {
      const k = referenceKey(r, id) ?? ''
      const units = splitVerseUnits(r.text).map((u) => u.surface)
      const tags = deriveVerseTags(units, pivot.get(k) ?? [], candidates.get(k) ?? new Set(), attested)
      words += units.length
      hits += tags.filter((x) => x.strongs).length
      ins.run(id, r.book_id, r.chapter, r.verse, packTags(tags))
    }
    coverage.push({ id, pct: words ? Math.round((100 * hits) / words) : 0 })
  }
  db.exec('COMMIT')

  // Score agreement with KJV tagging, which also contributes candidates and attested forms. Tagger
  // tokens can span several words, so expand them to line up word-for-word with the derivation.
  let scored = 0
  let agreed = 0
  const kjvVerses = db
    .prepare("SELECT DISTINCT book_id, chapter, verse FROM verse_tokens WHERE translation_id='KJV'")
    .all() as { book_id: string; chapter: number; verse: number }[]
  const kjvToks = db.prepare(
    "SELECT surface, strongs FROM verse_tokens WHERE translation_id='KJV' AND book_id=? AND chapter=? AND verse=? ORDER BY position"
  )
  for (const v of kjvVerses) {
    const words: string[] = []
    const truth: (string | null)[] = []
    for (const tok of kjvToks.all(v.book_id, v.chapter, v.verse) as {
      surface: string
      strongs: string | null
    }[]) {
      for (const w of tok.surface.split(/\s+/)) {
        if (!w) continue
        words.push(w)
        truth.push(tok.strongs)
      }
    }
    const k = `${v.book_id}|${v.chapter}|${v.verse}`
    const got = deriveVerseTags(words, pivot.get(k) ?? [], candidates.get(k) ?? new Set(), attested)
    for (let i = 0; i < truth.length; i++) {
      if (!truth[i] || !got[i]?.strongs) continue
      scored++
      if (got[i].strongs === truth[i]) agreed++
    }
  }
  return { coverage, agreement: scored ? Math.round((1000 * agreed) / scored) / 10 : 0 }
}
