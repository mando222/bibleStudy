import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { KNOWN_FEATURE_TYPES } from '../src/shared/mapFeatures'
import { buildWordStrongs } from '../src/shared/wordLookup'

// Load node:sqlite at runtime — Vite's static resolver doesn't yet know this new builtin.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')

// Validates the built resources/bible.sqlite. Skips when it hasn't been built yet, so
// `npm test` works locally without the (gitignored, 300MB) DB; CI builds it first.
const DB = 'resources/bible.sqlite'
const suite = existsSync(DB) ? describe : describe.skip

suite('bible.sqlite integrity', () => {
  const db = existsSync(DB) ? new DatabaseSync(DB) : (null as never)
  const one = (sql: string, ...a: unknown[]): Record<string, unknown> =>
    db.prepare(sql).get(...a) as Record<string, unknown>
  const n = (sql: string, ...a: unknown[]): number => Number((one(sql, ...a) as { n: number }).n)
  const all = (sql: string, ...a: unknown[]): Record<string, unknown>[] =>
    db.prepare(sql).all(...a) as Record<string, unknown>[]

  it('has 66 books and a full KJV', () => {
    expect(n('SELECT COUNT(*) n FROM books')).toBe(66)
    expect(n("SELECT COUNT(*) n FROM verses WHERE translation_id='KJV'")).toBe(31102)
  })

  it('KJV John 1:1 reads correctly', () => {
    const r = one("SELECT text FROM verses WHERE translation_id='KJV' AND book_id='John' AND chapter=1 AND verse=1")
    expect(String(r.text)).toMatch(/In the beginning was the Word/i)
  })

  it('Strong’s lexicon links agapē (G26)', () => {
    const r = one("SELECT lemma FROM strongs_lexicon WHERE id='G26'")
    expect(String(r.lemma)).toMatch(/ἀγάπη/)
  })

  it('scholarly lexicons loaded (BDB + Abbott-Smith)', () => {
    expect(n("SELECT COUNT(*) n FROM lexicon_entries WHERE strongs='G26' AND lexicon='TBESG'")).toBeGreaterThan(0)
    expect(n("SELECT COUNT(*) n FROM lexicon_entries WHERE strongs='H430' AND lexicon='TBESH'")).toBeGreaterThan(0)
  })

  it('interlinear editions include the LXX and it is tagged', () => {
    expect(n("SELECT COUNT(*) n FROM editions WHERE id='LXX'")).toBe(1)
    expect(n("SELECT COUNT(*) n FROM original_tokens WHERE edition='LXX' AND strongs IS NOT NULL")).toBeGreaterThan(100000)
    const theos = one("SELECT strongs FROM original_tokens WHERE edition='LXX' AND book_id='Gen' AND chapter=1 AND verse=1 AND original LIKE 'θε%' LIMIT 1")
    expect(theos.strongs).toBe('G2316')
  })

  it('TR vs Critical actually differ (Comma Johanneum, 1 John 5:7)', () => {
    const tr = n("SELECT COUNT(*) n FROM original_tokens WHERE edition='TR' AND book_id='1John' AND chapter=5 AND verse=7")
    const na = n("SELECT COUNT(*) n FROM original_tokens WHERE edition='NA' AND book_id='1John' AND chapter=5 AND verse=7")
    expect(tr).toBeGreaterThan(na)
  })

  it('divine-name backfill left no untagged LORD in the KJV OT', () => {
    expect(
      n("SELECT COUNT(*) n FROM verse_tokens WHERE translation_id='KJV' AND surface='LORD' AND strongs IS NULL AND book_id IN (SELECT id FROM books WHERE testament='OT')")
    ).toBe(0)
  })

  it('Scripture-attested parses capture real ambiguity (χάριν = noun AND preposition)', () => {
    expect(n("SELECT COUNT(DISTINCT strongs) n FROM form_parses WHERE form='χαριν' AND lang='greek'")).toBeGreaterThanOrEqual(2)
  })

  it('places have derived year-windows and events an end-year (v0.1.2)', () => {
    expect(n('SELECT COUNT(*) n FROM places WHERE start_year IS NOT NULL')).toBeGreaterThan(50)
    expect(n('SELECT COUNT(*) n FROM events WHERE end_year IS NOT NULL')).toBeGreaterThan(50)
  })

  it('kingdoms overlay geojson is present (v0.1.2)', () => {
    expect(n("SELECT length(value) n FROM meta WHERE key='regions_geojson'")).toBeGreaterThan(200)
  })

  it('cross-references link John 3:16 (v0.1.2)', () => {
    expect(n('SELECT COUNT(*) n FROM cross_references')).toBeGreaterThan(100000)
    expect(
      n("SELECT COUNT(*) n FROM cross_references WHERE from_book='John' AND from_chapter=3 AND from_verse=16")
    ).toBeGreaterThan(0)
  })

  it('vocabulary is frequency-ranked with a plausible top Greek word (v0.1.2)', () => {
    expect(n("SELECT COUNT(*) n FROM vocab WHERE language='greek'")).toBeGreaterThan(1000)
    // ὁ / καί / αὐτός dominate; the most frequent Greek lemma should occur thousands of times.
    expect(n("SELECT MAX(frequency) n FROM vocab WHERE language='greek'")).toBeGreaterThan(1000)
  })

  it('grammar courses (Greek + Hebrew) are loaded with readings (v0.1.2)', () => {
    expect(n("SELECT COUNT(*) n FROM grammar_lessons WHERE course='koine'")).toBeGreaterThan(5)
    expect(n("SELECT COUNT(*) n FROM grammar_lessons WHERE course='hebrew'")).toBeGreaterThan(5)
    // Every lesson references at least one real verse to read.
    expect(n("SELECT COUNT(*) n FROM grammar_lessons WHERE readings_json != '[]'")).toBeGreaterThan(10)
  })

  const GREEK = /[Ͱ-Ͽἀ-῿]/
  const HEBREW = /[֐-׿]/

  it('interlinear keeps the original word and the English gloss in SEPARATE columns (John 3:16)', () => {
    // Regression: the Learn reader must render `original` (Greek), never `gloss` (English). If these
    // two columns ever held the same thing, the reader would show English words as "Greek".
    const r = one(
      "SELECT original, gloss FROM original_tokens WHERE edition='NA' AND book_id='John' AND chapter=3 AND verse=16 AND translit='ho' LIMIT 1"
    )
    expect(r, 'John 3:16 article token missing').toBeTruthy()
    expect(GREEK.test(String(r.original))).toBe(true) // ὁ
    expect(GREEK.test(String(r.gloss))).toBe(false) // the gloss is English/marker, not Greek
  })

  it('every grammar reading verse resolves to real original-language script', () => {
    const testament: Record<string, string> = {}
    for (const r of all('SELECT id, testament FROM books'))
      testament[r.id as string] = r.testament as string
    const refs: string[] = []
    for (const l of all('SELECT readings_json FROM grammar_lessons'))
      for (const rd of JSON.parse((l.readings_json as string) || '[]') as { ref: string }[])
        refs.push(rd.ref)
    expect(refs.length).toBeGreaterThan(10)
    for (const ref of refs) {
      const [book, ch, v] = ref.split('.')
      const ed = testament[book] === 'OT' ? 'MT' : 'NA'
      const row = one(
        "SELECT group_concat(original,' ') o, group_concat(gloss,' ') g FROM original_tokens WHERE edition=? AND book_id=? AND chapter=? AND verse=?",
        ed,
        book,
        Number(ch),
        Number(v)
      )
      const original = String(row?.o ?? '')
      expect(original.length, `${ref} has no ${ed} tokens`).toBeGreaterThan(0)
      expect((ed === 'MT' ? HEBREW : GREEK).test(original), `${ref} original not ${ed} script`).toBe(
        true
      )
      expect(/[A-Za-z<]/.test(String(row?.g ?? '')), `${ref} gloss missing`).toBe(true)
    }
  })

  it('key city coordinates are accurate (v0.1.2 map)', () => {
    const near = (name: string, lat: number, lon: number): void => {
      const r = one('SELECT lat, lon FROM places WHERE name=? ORDER BY verse_count DESC LIMIT 1', name)
      expect(r, `${name} missing`).toBeTruthy()
      expect(Math.abs((r.lat as number) - lat), `${name} lat`).toBeLessThan(0.2)
      expect(Math.abs((r.lon as number) - lon), `${name} lon`).toBeLessThan(0.2)
    }
    near('Jerusalem', 31.78, 35.23)
    near('Babylon', 32.54, 44.42)
    near('Nineveh', 36.36, 43.15)
  })

  it('all place feature types are known (a new type must be classified for the map)', () => {
    for (const r of all('SELECT DISTINCT feature_type ft FROM places WHERE feature_type IS NOT NULL'))
      expect(KNOWN_FEATURE_TYPES.has(r.ft as string), `unhandled feature type: ${r.ft}`).toBe(true)
  })

  it('clean-text reading can look up a tagged word by form (KJV John 1:1 → G3056)', () => {
    // Guards the regression where words were only clickable while the Strong's numbers were shown.
    const rows = all(
      "SELECT surface, strongs FROM verse_tokens WHERE translation_id='KJV' AND book_id='John' AND chapter=1 AND verse=1"
    )
    const map = buildWordStrongs(rows as unknown as Parameters<typeof buildWordStrongs>[0])
    expect(map.get('word')).toBe('G3056')
    expect(map.get('beginning')).toBe('G746')
  })
})
