import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'

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
})
