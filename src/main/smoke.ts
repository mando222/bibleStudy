import { app } from 'electron'
import {
  getChapter,
  getStrongs,
  listEditions,
  getInterlinear,
  getLexiconEntries,
  getChapterApparatus
} from './db/bible'
import { getPeople, getPerson, getPlaces, getEvents } from './db/graph'
import { aiDb } from './ai/vectors'
import { openUserDb } from './db/user'

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
    ['scholarly lexicons (Abbott-Smith on G26)', () => { if (!getLexiconEntries('G26').length) throw new Error('no lexicon entries') }],
    ['interlinear editions present', () => { if (listEditions().length < 5) throw new Error('editions missing') }],
    [
      'LXX interlinear is tagged',
      () => {
        const il = getInterlinear('Gen', 1, 'LXX')
        if (!il.verses[0]?.tokens.some((t) => t.strongs)) throw new Error('LXX untagged')
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
        if (!app.some((v) => v.items.some((it) => it.side === 'ketiv')))
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
    ['Maps: geolocated places', () => { if (getPlaces().length < 500) throw new Error('few places') }],
    [
      'Timelines: events carry verse references',
      () => {
        const ev = getEvents()
        if (ev.length < 100 || !ev.some((e) => e.verses.length)) throw new Error('events missing verses')
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
