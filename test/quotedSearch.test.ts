import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { expect, it, vi } from 'vitest'
import { search } from '../src/main/db/bible'
import { searchImportedText } from '../src/main/db/search'

vi.mock('node:sqlite', () => createRequire(import.meta.url)('node:sqlite'))
vi.mock('electron', () => ({ app: { getAppPath: () => process.cwd() } }))

it.skipIf(!existsSync('resources/bible.sqlite'))('distinguishes exact and prefix searches in BSB', () => {
  const count = (text: string) => search({ translation: 'BSB', text }).total
  expect(count('"shepherd"')).toBe(62)
  expect(count('“shepherd”')).toBe(62)
  expect(count('shepherd')).toBe(114)
})

it('matches quoted imported words consecutively and in order', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`CREATE TABLE imported_verses(translation_id,book_id,chapter,verse,text);
      INSERT INTO imported_verses VALUES
      ('imp_demo','John',1,1,'Good shepherd'), ('imp_demo','John',1,2,'Good and faithful shepherd'),
      ('imp_demo','John',1,3,'Shepherd was good'), ('imp_demo','John',1,4,'Good shepherds')`)
    const lookup = (text: string) => searchImportedText(db, { translation: 'imp_demo', text })
    expect(lookup('“good shepherd”').hits.map(h => h.verse)).toEqual([1])
    expect(lookup('good shepherd').total).toBe(4)
    expect(lookup('""').total).toBe(0)
  } finally { db.close() }
})
