import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'

const library = 'resources/bible.sqlite'
const sqlite = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
let db: DatabaseSync

describe.skipIf(!existsSync(library))('compiled English edition packs', () => {
  beforeAll(() => {
    db = new sqlite.DatabaseSync(library, { readOnly: true })
  })
  afterAll(() => db?.close())

  it('identifies the exact nine pinned manifests used to build the library', () => {
    for (const id of ['KJV', 'BSB', 'WEB', 'ASV', 'YLT', 'JuliaSmith', 'TNT', 'GNV', 'WYC']) {
      const bytes = readFileSync('data/editions/' + id.toLowerCase() + '/manifest.json')
      const digest = createHash('sha256').update(bytes).digest('hex')
      expect(
        db.prepare('SELECT value FROM meta WHERE key=?').get('edition_manifest_sha256.' + id)?.value
      ).toBe(digest)
    }
  })

  it('restores independently reviewed John 11 readings at their exact English offset', () => {
    for (const [edition, source] of [
      ['WEB', 'BYZ'],
      ['ASV', 'NA'],
      ['KJV', 'TR']
    ]) {
      const occurrence = db
        .prepare(
          `SELECT t.surface,o.*,x.source_row AS berean_row
        FROM edition_occurrences o JOIN verse_tokens t USING(translation_id,book_id,chapter,verse)
        JOIN edition_correspondences x USING(translation_id,book_id,chapter,verse,end_position)
        WHERE t.position=o.end_position AND o.translation_id=? AND o.book_id='John'
        AND o.chapter=11 AND o.verse=35 AND o.strongs='G1145' AND x.source_edition='BSB'`
        )
        .get(edition)
      expect(occurrence).toMatchObject({
        source_edition: source,
        source_position: 0,
        source_row: 'John.11.35/0',
        source_book: 'John',
        source_chapter: 11,
        source_verse: 35,
        english: 'wept',
        surface: 'wept',
        strongs: 'G1145',
        form: 'ἐδάκρυσεν',
        standalone: 1,
        preserve_preset: 0,
        berean_row: '92072'
      })
    }
  })

  it('withholds the conflicting WEB tag and keeps independently sourced and inferred lookups', () => {
    const rows = db
      .prepare(
        `SELECT t.surface,t.strongs,e.kind FROM verse_tokens t JOIN edition_token_evidence e
      USING(translation_id,book_id,chapter,verse,position)
      WHERE t.translation_id='WEB' AND t.book_id='Gen' AND t.chapter=1 AND t.verse=1`
      )
      .all()
    expect(rows.find((row) => row.surface === 'God')).toMatchObject({ strongs: null, kind: 'unlinked' })
    expect(rows.find((row) => row.surface === 'created')).toMatchObject({
      strongs: 'H1254',
      kind: 'published'
    })
    expect(
      db
        .prepare(
          `SELECT 1 FROM edition_token_evidence WHERE translation_id='WEB' AND kind='inferred' LIMIT 1`
        )
        .get()
    ).toBeTruthy()
    expect(
      db
        .prepare(
          `SELECT 1 FROM derived_tags d WHERE d.translation_id='WEB' AND NOT EXISTS (
      SELECT 1 FROM verse_tokens t WHERE t.translation_id=d.translation_id AND t.book_id=d.book_id
      AND t.chapter=d.chapter AND t.verse=d.verse) LIMIT 1`
        )
        .get()
    ).toBeTruthy()
  })

  it('binds every added restoration to a pinned original token and a cited English span', () => {
    const rows = db
      .prepare(
        `SELECT o.*,t.original,t.morph AS token_morph,t.strongs AS token_strongs
      FROM edition_occurrences o LEFT JOIN original_tokens t ON
      t.edition=o.source_edition AND t.book_id=o.source_book AND t.chapter=o.source_chapter
      AND t.verse=o.source_verse AND t.position=o.source_position WHERE o.preserve_preset=0`
      )
      .iterate()
    let count = 0
    for (const row of rows) {
      const printed = String(row.original)
        .replace(/[.,;··:!?]+$/u, '')
        .normalize('NFC')
      if (
        !row.citation ||
        !row.english ||
        !/^[0-9a-f]{64}$/.test(String(row.source_revision)) ||
        printed !== String(row.form).normalize('NFC') ||
        row.token_strongs !== row.strongs ||
        row.token_morph !== row.morph
      )
        throw Error('Unverified original token: ' + JSON.stringify(row))
      count++
    }
    expect(count).toBeGreaterThan(2)
  })

  it('reconstructs each newly materialized verse including punctuation and margins', () => {
    const rows = db
      .prepare(
        `SELECT translation_id,book_id,chapter,verse FROM (
      SELECT t.translation_id,t.book_id,t.chapter,t.verse,group_concat(t.surface||t.trailer,''
        ORDER BY position) AS rendered,v.text AS published FROM verse_tokens t JOIN verses v
      USING(translation_id,book_id,chapter,verse) WHERE t.translation_id IN ('WEB','ASV')
      GROUP BY t.translation_id,t.book_id,t.chapter,t.verse
      HAVING rendered!=published) LIMIT 1`
      )
      .all()
    expect(rows).toEqual([])
  })
})
