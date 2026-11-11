import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, it, vi } from 'vitest'
import { bibleDb, getChapter } from '../src/main/db/bible'
import { restoredVerseSegments } from '../src/shared/sourceWords'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
const folder = mkdtempSync(join(tmpdir(), 'obs-legacy-word-bundle-'))
vi.mock('node:sqlite', () => createRequire(import.meta.url)('node:sqlite'))
vi.mock('electron', () => ({ app: { getAppPath: () => folder } }))
afterAll(() => {
  bibleDb()?.close()
  rmSync(folder, { recursive: true, force: true })
})

it('reads published verses from an older database without trusting its unversioned alignment', () => {
  mkdirSync(join(folder, 'resources'))
  const old = new DatabaseSync(join(folder, 'resources', 'bible.sqlite'))
  try {
    old.exec(readFileSync('data-pipeline/schema.sql', 'utf8'))
    old.exec(`
      INSERT INTO verses VALUES ('BSB','John',11,35,'Jesus wept.');
      INSERT INTO verse_tokens VALUES
        ('BSB','John',11,35,0,'Jesus',' ','G2424','Ἰησοῦς','Iēsous','Noun',NULL),
        ('BSB','John',11,35,1,'wept','.',NULL,NULL,NULL,NULL,NULL);
      INSERT INTO source_word_spans VALUES ('BSB','John',11,35,0,0,0,'92074','Greek');
    `)
  } finally {
    old.close()
  }
  const ref = { translation: 'BSB', book: 'John', chapter: 11 }
  const [verse] = getChapter(ref).verses
  expect(verse.tokens![0].sourceWord).toBeUndefined()
  expect(restoredVerseSegments(verse, ref, true, { G2424: true }).map(s => s.display).join('')).toBe('Jesus wept.')
})
