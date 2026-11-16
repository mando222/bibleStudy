import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { bibleDb, getChapter, getComparisonVerse, getConcordance, getInterlinear, search } from '../src/main/db/bible'
import { countSourceSpans } from '../src/main/db/sourceWordCoverage'
import { restoredVerseSegments, publishedWording, sameSourceOccurrence } from '../src/shared/sourceWords'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
const folder = mkdtempSync(join(tmpdir(), 'obs-edition-reader-'))
vi.mock('node:sqlite', () => createRequire(import.meta.url)('node:sqlite'))
vi.mock('electron', () => ({ app: { getAppPath: () => folder } }))
const ref = { translation: 'WEB', book: 'John', chapter: 11 }
const form = 'ἐδάκρυσεν'

beforeAll(() => {
  mkdirSync(join(folder, 'resources'))
  const db = new DatabaseSync(join(folder, 'resources', 'bible.sqlite'))
  try {
    db.exec(readFileSync('data-pipeline/schema.sql', 'utf8'))
    db.exec(`
      INSERT INTO meta VALUES ('edition_pack_version','1');
      INSERT INTO books VALUES ('John','JHN','John','NT',43,21);
      INSERT INTO editions(id,name,language,testament) VALUES ('BYZ','Byzantine','grc','NT'),('TR','TR','grc','NT');
      INSERT INTO verses VALUES ('WEB','John',11,35,'Jesus wept.'),('WEB','John',11,36,'They wept.');
      INSERT INTO verse_tokens VALUES
        ('WEB','John',11,35,0,'Jesus',' ','G2424',NULL,NULL,NULL,NULL),
        ('WEB','John',11,35,1,'wept','.','G1145',NULL,NULL,NULL,NULL);
      INSERT INTO edition_token_evidence VALUES
        ('WEB','John',11,35,0,'inferred','Inference from parallel wording'),
        ('WEB','John',11,35,1,'corroborated','WEB distributor word tag and a reviewed Greek occurrence');
      INSERT INTO derived_tags VALUES ('WEB','John',11,35,'G2316 G1145'),('WEB','John',11,36,'- G1145');
      INSERT INTO original_tokens(edition,book_id,chapter,verse,position,original,strongs) VALUES
        ('BYZ','John',11,35,0,'ἐδάκρυσεν','G1145'),('BYZ','John',11,35,1,'ἐδάκρυσεν','G1145'),
        ('TR','John',11,35,0,'ἐδάκρυσεν','G1145');
      INSERT INTO edition_occurrences(translation_id,book_id,chapter,verse,start_position,end_position,english,
        source_edition,source_revision,source_book,source_chapter,source_verse,source_row,source_position,
        language,form,translit,strongs,morph,evidence,citation,standalone,unique_form) VALUES
        ('WEB','John',11,35,1,1,'wept','BYZ','reviewed-revision','John',11,35,'JHN.11.35.1',1,
         'Greek','ἐδάκρυσεν',NULL,'G1145','Verb','corroborated','WEB tag and Byzantine occurrence','1','0');
    `)
  } finally { db.close() }
})
afterAll(() => { bibleDb()?.close(); rmSync(folder, { recursive: true, force: true }) })

it('resolves evidence at each English occurrence and preserves the edition’s printed wording', () => {
  const [aligned, inferred] = getChapter(ref).verses
  expect(aligned.tokens![0]).toMatchObject({ derived: true, tagCitation: 'Inference from parallel wording' })
  const verified = aligned.tokens![1].sourceWord!
  expect(verified).toMatchObject({ translation: 'WEB', edition: 'BYZ', rowId: 'JHN.11.35.1', text: form,
    citation: 'WEB tag and Byzantine occurrence', sourceRef: { book: 'John', chapter: 11, verse: 35, position: 1 } })
  const parts = restoredVerseSegments(aligned, ref, true, {}, ['G1145'])
  const word = parts.find(p => p.display === form)!
  expect(publishedWording(word)).toBe('wept')
  expect(parts.map(p => p.original).join('')).toBe('Jesus wept.')
  expect(inferred.tokens?.[1]).toMatchObject({ derived: true, strongs: 'G1145' })
  expect(restoredVerseSegments(inferred, ref, true, {}, ['G1145']).map(p => p.display).join('')).toBe('They wept.')
  expect(getComparisonVerse({ ...ref, verse: 35 })!.tokens![1].sourceWord).toEqual(verified)
  expect(countSourceSpans(bibleDb()!, 'G1145').get('G1145')?.get('WEB')).toBe(1)
})

it('compares only the same source position in the same revision, across native English addresses', () => {
  const source = getChapter(ref).verses[0].tokens![1].sourceWord!
  expect(sameSourceOccurrence(source, { ...source, translation: 'ASV', verse: 34 })).toBe(true)
  expect(sameSourceOccurrence(source, { ...source, sourceRevision: 'other-revision' })).toBe(false)
  expect(sameSourceOccurrence(source, { ...source, sourceRef: { ...source.sourceRef!, position: 0 } })).toBe(false)
  const correspondence = { edition: 'BSB', rowId: '92072', sourceRevision: 'publisher-revision',
    sourceRef: { book: 'John', chapter: 11, verse: 35 }, citation: 'Reviewed publisher row 92072' }
  const other = { ...source, ...correspondence, translation: 'BSB' }
  expect(sameSourceOccurrence(source, other)).toBe(false)
  expect(sameSourceOccurrence({ ...source, correspondences: [correspondence] }, other)).toBe(true)
  const tokens = getInterlinear('John', 11, 'BYZ', ['WEB']).verses[0].tokens
  expect(tokens[0].aligned).toBeUndefined()
  expect(tokens[1].aligned?.WEB).toBe('wept')
  const otherText = getInterlinear('John', 11, 'TR', ['WEB']).verses[0]
  expect(otherText.tokens[0].aligned).toBeUndefined()
  expect(otherText.lines?.[0]?.text).toBe('Jesus wept.')
})

it('combines source levels without counting the replaced lookup index or exposing its stale IDs', () => {
  const concordance = getConcordance('G1145', { translation: 'WEB' })
  expect(concordance.total).toBe(2)
  expect(concordance.hits.map(h => [h.verse, h.snippet, h.tagEvidence])).toEqual([
    [35, 'Jesus {{wept}}.', undefined], [36, 'They {{wept}}.', 'inferred']
  ])
  expect(search({ translation: 'WEB', text: 'G1145', offset: 1, limit: 1 }).hits[0].tagEvidence).toBe('inferred')
  expect(getConcordance('G2424', { translation: 'WEB' }).hits[0].tagEvidence).toBe('inferred')
  expect(getConcordance('G2316', { translation: 'WEB' }).total).toBe(0)
})
