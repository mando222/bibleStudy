import { app } from 'electron'
import {
  getChapter,
  getSourceWordCoverage,
  getStrongs,
  listEditions,
  getInterlinear,
  getConcordance,
  getLexiconEntries,
  getChapterApparatus,
  getOriginalVerseReadings,
  getMapRegions,
  getVocab,
  getGrammarLessons
} from './db/bible'
import { getPeople, getPerson, getPlaces, getEvents } from './db/graph'
import { getMappedPeople, getPassageContext, getPersonMap } from './db/passageStudy'
import { aiDb } from './ai/vectors'
import { openUserDb } from './db/user'
import { getWordFrequency, getWordFrequencyPassages } from './db/wordFrequency'
import { restoredVerseSegments } from '../shared/sourceWords'

/**
 * Post-package smoke test (run with `--smoke-test`). Exercises the REAL packaged code paths a
 * release depends on — bundled DB queries, the LXX/parse layer, the native sqlite-vec extension,
 * and the writable user DB — then exits 0 (all good) or 1 (a release would be broken). This is
 * the gate that catches packaging bugs unit tests can't, e.g. a native binary that won't load.
 */
export async function runSmokeTest(): Promise<void> {
  const checks: [string, () => unknown][] = [
    [
      'KJV John 1:1 loads from bundled DB',
      () => {
        if (!getChapter({ translation: 'KJV', book: 'John', chapter: 1 }).verses.length)
          throw new Error('no verses')
      }
    ],
    ['Strong’s lexicon (G26)', () => { if (!getStrongs('G26')) throw new Error('no G26') }],
    ['Extended Hebrew suffix has a published dictionary entry', () => {
      if (getStrongs('H9033')?.lexiconSource !== 'STEP' || !getLexiconEntries('H9033')[0]?.entries[0]?.body)
        throw new Error('missing Hebrew suffix entry')
    }],
    ['Word frequency totals resolve to source occurrences', () => {
      const f = getWordFrequency({ id: 'G26', edition: 'NA' })
      const verses = getWordFrequencyPassages({ id: 'G26', edition: 'NA', book: '1John', chapter: 4 })
      if (f.occurrences !== 116 || f.forms.length !== 5 || verses.find(v => v.verse === 16)?.occurrences !== 3)
        throw new Error('Greek word frequency index missing or inconsistent')
    }],
    ['Two uses of G264 keep their own Greek form and the published negation', () => {
      const ref = { translation: 'BSB', book: '1John', chapter: 2 }
      const verse = getChapter(ref).verses.find(v => v.verse === 1)
      if (!verse || !getSourceWordCoverage('G264').some(r => r.translation === 'BSB' && r.occurrences >= 2))
        throw new Error('G264 source evidence unavailable')
      const parts = restoredVerseSegments(verse, ref, true, {}, ['G264'])
      if (!parts.some(s => s.display === 'you will not sin' && s.annotation === 'ἁμάρτητε') ||
          !parts.some(s => s.display === 'does sin' && s.annotation === 'ἁμάρτῃ'))
        throw new Error('G264 forms or English wording do not match 1 John 2:1')
    }],
    ['scholarly lexicons (Abbott-Smith on G26)', () => { if (!getLexiconEntries('G26').length) throw new Error('no lexicon entries') }],
    ['interlinear editions present', () => { if (listEditions().length < 5) throw new Error('editions missing') }],
    ['John 1:18 displays the recorded God and Son readings by edition', () => {
      const verse = getOriginalVerseReadings({ translation: 'BSB', book: 'John', chapter: 1, verse: 18 })
      if (verse.kind !== 'greek' || !verse.readings.NA?.words.some(w => w.strongs === 'G2316' && w.surface === 'θεὸς') ||
          !(['TR', 'BYZ'] as const).every(id => verse.readings[id]?.words.some(w => w.strongs === 'G5207')))
        throw new Error('the expected edition readings are missing')
    }],
    ['Printed Greek word order at 1 Corinthians 15:19', () => {
      const verse = getOriginalVerseReadings({ translation: 'KJV', book: '1Cor', chapter: 15, verse: 19 })
      if (verse.kind !== 'greek') throw new Error('Greek comparison unavailable')
      for (const id of ['TR', 'BYZ'] as const) {
        const reading = verse.readings[id]
        const words = reading?.words.map(w => w.surface).join(' ').normalize('NFC')
        if (!reading || reading.orderStatus || !words?.includes('ἠλπικότες ἐσμὲν'))
          throw new Error('the verified sequence is missing in ' + id)
      }
    }],
    [
      'Swete interlinear preserves Greek forms and omits inferred glosses',
      () => {
        const il = getInterlinear('Gen', 1, 'LXX', [], true)
        const word = il.verses[0]?.tokens.find(t => t.lemma === 'ἐποίησεν')
        if (!word || word.strongs || word.gloss || word.surface || word.parses || word.morph)
          throw new Error('the Swete reading is missing or includes an inferred analysis')
        const issue = getInterlinear('Exod', 20, 'LXX').verses.find(v => v.verse === 1)
        if (!issue?.sourceIssue || issue.tokens.length) throw new Error('chapter numeral presented as Greek verse')
      }
    ],
    [
      'Scripture-attested parses',
      () => {
        const il = getInterlinear('John', 1, 'NA', [], true)
        if (!il.verses.some((v) => v.tokens.some((t) => t.parses && t.parses.length)))
          throw new Error('no parses')
      }
    ],
    [
      'OT Ketiv/Qere apparatus (1 Chronicles 1)',
      () => {
        const app = getChapterApparatus('1Chr', 1)
        if (!app.some((v) => v.kind === 'masoretic' && v.pairs.some(pair => pair.ketiv)))
          throw new Error('no Ketiv/Qere')
      }
    ],
    [
      'Septuagint readable + Esdras B split (LXX Ezra 1)',
      () => {
        if (!getChapter({ translation: 'LXX', book: 'Ezra', chapter: 1 }).verses.length)
          throw new Error('no LXX Ezra')
      }
    ],
    [
      'Masoretic Hebrew readable (MT Genesis 1)',
      () => {
        if (!getChapter({ translation: 'MT', book: 'Gen', chapter: 1 }).verses.length)
          throw new Error('no MT Genesis')
      }
    ],
    [
      'Genealogies: person → verse references (Moses)',
      () => {
        const moses = getPeople('Moses', 5)[0]
        if (!moses) throw new Error('no Moses')
        const detail = getPerson(moses.id)
        if (!detail || detail.verses.length < 50) throw new Error('Moses verse refs missing')
      }
    ],
    ['Atlas includes Rome and the unlocated land of Nod', () => {
      const places = getPlaces()
      if (!places.some(p => p.name === 'Rome' && p.lon != null) ||
          !places.some(p => p.name === 'Nod' && p.lat == null) ||
          !getPassageContext({ edition: 'KJV', book: 'Gen', chapter: 4, firstVerse: 16 }).places.some(p => p.name === 'Nod'))
        throw new Error('atlas catalog or verse index missing')
    }],
    ['Person maps list cited locations and preserve Paul’s documented stops', () => {
      const people = getMappedPeople()
      if (!people.some(p => p.id === 2479 && p.mappedPlaceCount >= 3) ||
          !people.some(p => p.id === 78 && p.mappedPlaceCount === 1) || people.some(p => p.id === 13))
        throw new Error('person map directory does not match its evidence')
      const stops = getPersonMap(2479)?.stops.filter(s => s.order != null).map(s => s.placeId)
      if (stops?.join(',') !== '919,936,69') throw new Error('unexpected Acts 13 sequence')
    }],
    ['Psalm 23 preserves edition-specific layout', () => {
      const verse = getChapter({ translation: 'BSB', book: 'Ps', chapter: 23 }).verses[0]
      if (verse.layout?.filter(mark => mark.kind === 'poetry').length !== 2 ||
          !verse.layout.some(mark => mark.kind === 'superscription')) throw new Error('missing BSB poetry or superscription')
    }],
    [
      'Maps: place year-windows derived',
      () => {
        if (!getPlaces().some((p) => p.startYear != null)) throw new Error('no place year-windows')
      }
    ],
    ['Maps: kingdoms overlay present', () => { if (getMapRegions().length < 200) throw new Error('no regions geojson') }],
    ['Learn: vocabulary built', () => { if (getVocab('greek', 10).length < 5) throw new Error('no greek vocab') }],
    ['Learn: grammar lessons built', () => { if (!getGrammarLessons().length) throw new Error('no grammar lessons') }],
    [
      'Timelines: events carry verse references',
      () => {
        const ev = getEvents()
        if (ev.length < 100 || !ev.some((e) => e.verses.length)) throw new Error('events missing verses')
      }
    ],
    [
      'Interlinear stacks an INFERRED translation word-for-word',
      () => {
        // Regression: derived_tags were read only by the reader, so a stacked ASV column fell back
        // to a flat verse line even though its tags existed.
        const il = getInterlinear('John', 1, 'NA', ['ASV'])
        if (!il.verses.some((v) => v.tokens.some((t) => t.aligned?.ASV))) {
          throw new Error('ASV did not align word-for-word')
        }
      }
    ],
    [
      'Concordance finds verses in an INFERRED translation',
      () => {
        const c = getConcordance('G26', { translation: 'ASV', limit: 5 })
        if (c.translation !== 'ASV' || !c.derived || c.hits.length === 0) {
          throw new Error(`ASV concordance returned ${c.hits.length} hits from ${c.translation}`)
        }
      }
    ],
    ['sqlite-vec native extension loads', () => aiDb()],
    ['writable user.sqlite opens', () => openUserDb()]
  ]

  let failed = 0
  for (const [name, fn] of checks) {
    try {
      await fn()
      console.log(`  ✓ ${name}`)
    } catch (e) {
      failed++
      console.error(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  console.log(failed ? `SMOKE TEST FAILED (${failed} check(s))` : 'SMOKE TEST PASSED')
  app.exit(failed ? 1 : 0)
}
