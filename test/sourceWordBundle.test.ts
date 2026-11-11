import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, it, vi } from 'vitest'
import { bibleDb, getChapter, getInterlinear, getSourceWordCoverage } from '../src/main/db/bible'
import { restoredVerseSegments, SOURCE_WORD_ALIGNMENT_VERSION } from '../src/shared/sourceWords'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
const folder = mkdtempSync(join(tmpdir(), 'obs-legacy-word-bundle-'))
vi.mock('node:sqlite', () => createRequire(import.meta.url)('node:sqlite'))
vi.mock('electron', () => ({ app: { getAppPath: () => folder } }))
afterAll(() => {
  bibleDb()?.close()
  rmSync(folder, { recursive: true, force: true })
})

it('distinguishes unversioned alignments from verified legacy rows without standalone certification', async () => {
  mkdirSync(join(folder, 'resources'))
  const old = new DatabaseSync(join(folder, 'resources', 'bible.sqlite'))
  try {
    old.exec(readFileSync('data-pipeline/schema.sql', 'utf8'))
    old.exec(`
      DROP TABLE source_word_singletons;
      DROP TABLE source_word_coverage;
      DROP TABLE greek_order_uncertainties;
      ALTER TABLE original_tokens DROP COLUMN source_type;
      INSERT INTO editions(id,name,language,testament) VALUES ('MT','Masoretic Text','hbo','OT');
      INSERT INTO original_tokens(edition,book_id,chapter,verse,position,original) VALUES
        ('MT','1Chr',1,11,2,'אֶת־'),('MT','1Chr',1,11,3,'לוּדִ֧ים');
      INSERT INTO ketiv_qere(book_id,chapter,verse,position,qere,ketiv) VALUES
        ('1Chr',1,11,3,'לוּדִ֧ים','לוּדִיִּים');
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
  const chapter = getInterlinear('1Chr', 1, 'MT')
  expect(chapter.masoreticAttestationAvailable).toBe(false)
  expect(chapter.verses[0].tokens[0].sourceType).toBeUndefined()
  expect(chapter.verses[0].tokens[1]).toMatchObject({ sourceType: 'Q', ketiv: 'לוּדִיִּים' })
  expect(getInterlinear('Jude', 1, 'NA').uncertainOrderVerses).toBeUndefined()
  const [verse] = getChapter(ref).verses
  expect(verse.tokens![0].sourceWord).toBeUndefined()
  expect(getSourceWordCoverage('G2424')).toEqual([])
  expect(restoredVerseSegments(verse, ref, true, { G2424: true }).map(s => s.display).join('')).toBe('Jesus wept.')
  const legacy = new DatabaseSync(join(folder, 'resources', 'bible.sqlite'))
  legacy.prepare("INSERT INTO meta VALUES ('source_word_alignment_version', ?)").run(SOURCE_WORD_ALIGNMENT_VERSION)
  legacy.close()
  vi.resetModules()
  const reopened = await import('../src/main/db/bible')
  try {
    expect(reopened.getChapter(ref).verses[0].tokens![0].sourceWord).toMatchObject({ text: 'Ἰησοῦς', canReplaceAlone: false })
    expect(reopened.getSourceWordCoverage('G2424')).toEqual([{ translation: 'BSB', occurrences: 1 }])
  } finally { reopened.bibleDb()?.close() }
})
