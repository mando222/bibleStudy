import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { KNOWN_FEATURE_TYPES } from '../src/shared/mapFeatures'

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

  it('tagged tokens reconstruct their verse text EXACTLY (no truncation, no tagger markup)', () => {
    // The reader renders from verse_tokens, so any drift here becomes wrong Scripture on screen.
    // Regression: kaiserlik/kjv truncates ~3k verse tails and prepends Psalm superscriptions;
    // bereanbible's table carries "[the]" / "{}" / ". . ." alignment markup.
    for (const id of ['KJV', 'BSB']) {
      const bad = all(
        `SELECT t.book_id b, t.chapter c, t.verse v, group_concat(t.surface || t.trailer, '') got, ve.text want
           FROM verse_tokens t
           JOIN verses ve ON ve.translation_id = t.translation_id AND ve.book_id = t.book_id
                         AND ve.chapter = t.chapter AND ve.verse = t.verse
          WHERE t.translation_id = ?
          GROUP BY t.book_id, t.chapter, t.verse
         HAVING got != want
          LIMIT 3`,
        id
      )
      const detail = bad.map((r) => `${r.b} ${r.c}:${r.v}\n  got:  ${r.got}\n  want: ${r.want}`).join('\n')
      expect(bad.length, `${id} tokens do not reconstruct verses.text:\n${detail}`).toBe(0)
    }
  })

  it('previously-truncated verses are whole and still tagged (Acts 3:1, Ps 7:1)', () => {
    const rebuilt = (b: string, c: number, v: number): string =>
      String(
        one(
          "SELECT group_concat(surface || trailer, '') t FROM verse_tokens WHERE translation_id='KJV' AND book_id=? AND chapter=? AND verse=?",
          b,
          c,
          v
        ).t ?? ''
      )
    expect(rebuilt('Acts', 3, 1)).toMatch(/being the ninth hour\.$/)
    expect(rebuilt('Ps', 7, 1)).not.toContain('Shiggaion') // superscription is not verse text
    expect(rebuilt('Ps', 7, 1)).toMatch(/and deliver me:$/)
    // Alignment survived the re-tiling: John 1:1 still tags the right words.
    expect(
      one(
        "SELECT strongs FROM verse_tokens WHERE translation_id='KJV' AND book_id='John' AND chapter=1 AND verse=1 AND surface='Word'"
      ).strongs
    ).toBe('G3056')
  })

  it('ASV omits exactly the 16 critical-text verses, and no others', () => {
    // The ASV follows the critical text, so it lacks the 16 verses of weak manuscript support
    // that the KJV's Textus Receptus carries. This is correct, not data loss — and it's the
    // guard that would catch a genuinely dropped verse, which would otherwise look identical.
    expect(n("SELECT COUNT(*) n FROM verses WHERE translation_id='ASV'")).toBe(31086)
    const omitted = all(
      `SELECT k.book_id b, k.chapter c, k.verse v FROM verses k
        WHERE k.translation_id='KJV' AND NOT EXISTS (
          SELECT 1 FROM verses a WHERE a.translation_id='ASV'
           AND a.book_id=k.book_id AND a.chapter=k.chapter AND a.verse=k.verse)
        ORDER BY (SELECT sort_order FROM books WHERE id=k.book_id), k.chapter, k.verse`
    ).map((r) => `${r.b} ${r.c}:${r.v}`)
    expect(omitted).toEqual([
      'Matt 17:21', 'Matt 18:11', 'Matt 23:14',
      'Mark 7:16', 'Mark 9:44', 'Mark 9:46', 'Mark 11:26', 'Mark 15:28',
      'Luke 17:36', 'Luke 23:17', 'John 5:4',
      'Acts 8:37', 'Acts 15:34', 'Acts 24:7', 'Acts 28:29', 'Rom 16:24'
    ])
  })

  it('ASV carries its distinctive renderings', () => {
    const at = (b: string, c: number, v: number): string =>
      String(
        one('SELECT text FROM verses WHERE translation_id=? AND book_id=? AND chapter=? AND verse=?', 'ASV', b, c, v)
          ?.text ?? ''
      )
    expect(at('Gen', 2, 4)).toMatch(/Jehovah/) // divine name, not "the LORD"
    expect(at('Ps', 16, 10)).toMatch(/Sheol/) // transliterated, not "hell"
    expect(at('Matt', 1, 18)).toMatch(/Holy Spirit/) // not "Holy Ghost"
    // Follows the critical text, so the Comma Johanneum is absent (the KJV's TR has it).
    expect(at('1John', 5, 7)).not.toMatch(/bear record in heaven/)
    expect(String(one("SELECT text FROM verses WHERE translation_id='KJV' AND book_id='1John' AND chapter=5 AND verse=7").text)).toMatch(
      /bear record in heaven/
    )
  })

  it('Tyndale NT is New Testament only, KJV-aligned, in original 1534 spelling', () => {
    // 7,954, not the KJV NT's 7,957: verse numbers were retrofitted onto Tyndale's text in 1551
    // and three have no corresponding text, so the source carries them as empty placeholders.
    expect(n("SELECT COUNT(*) n FROM verses WHERE translation_id='TNT'")).toBe(7954)
    const gaps = all(
      `SELECT k.book_id b, k.chapter c, k.verse v FROM verses k
         JOIN books bk ON bk.id = k.book_id
        WHERE k.translation_id='KJV' AND bk.testament='NT' AND NOT EXISTS (
          SELECT 1 FROM verses t WHERE t.translation_id='TNT'
           AND t.book_id=k.book_id AND t.chapter=k.chapter AND t.verse=k.verse)
        ORDER BY bk.sort_order, k.chapter, k.verse`
    ).map((r) => `${r.b} ${r.c}:${r.v}`)
    expect(gaps).toEqual(['Mark 11:26', 'Luke 17:36', 'Rev 21:26'])
    // 27 books, none of them Old Testament — the library's first partial translation.
    expect(n("SELECT COUNT(DISTINCT book_id) n FROM verses WHERE translation_id='TNT'")).toBe(27)
    expect(
      n(`SELECT COUNT(*) n FROM verses WHERE translation_id='TNT'
           AND book_id IN (SELECT id FROM books WHERE testament='OT')`)
    ).toBe(0)
    const at = (b: string, c: number, v: number): string =>
      String(
        one('SELECT text FROM verses WHERE translation_id=? AND book_id=? AND chapter=? AND verse=?', 'TNT', b, c, v)
          ?.text ?? ''
      )
    // Original spelling, not a modernised edition — the thing that makes it worth bundling.
    expect(at('John', 3, 16)).toMatch(/everlastinge/i)
    expect(at('John', 1, 1)).toMatch(/beginnynge/i)
    // Tyndale reads "love" where the KJV has "charity" — a signature divergence.
    expect(at('1Cor', 13, 1)).toMatch(/love/i)
    expect(String(one("SELECT text FROM verses WHERE translation_id='KJV' AND book_id='1Cor' AND chapter=13 AND verse=1").text)).toMatch(/charity/i)
    // Shares the KJV's NT versification, so parallel columns line up.
    expect(n("SELECT COUNT(*) n FROM verses WHERE translation_id='KJV' AND book_id IN (SELECT id FROM books WHERE testament='NT')")).toBe(7957)
  })

  it('Geneva and Wycliffe are present, with Wycliffe limited to its surviving portions', () => {
    expect(n("SELECT COUNT(*) n FROM verses WHERE translation_id='GNV'")).toBe(31090)
    // Only the Pentateuch and the four Gospels survive in a public-domain transcription. The
    // complete modern-spelling editions are CC BY-NC-ND, which this project can't bundle.
    expect(n("SELECT COUNT(DISTINCT book_id) n FROM verses WHERE translation_id='WYC'")).toBe(9)
    expect(n("SELECT COUNT(*) n FROM verses WHERE translation_id='WYC'")).toBe(9622)
    const at = (id: string, b: string, c: number, v: number): string =>
      String(one('SELECT text FROM verses WHERE translation_id=? AND book_id=? AND chapter=? AND verse=?', id, b, c, v)?.text ?? '')
    expect(at('GNV', 'John', 3, 16)).toMatch(/God so loued|loued the worlde|beleeueth/i) // 1599 spelling
    expect(at('WYC', 'John', 3, 16)).toMatch(/louede|bigetun/i) // Middle English
    // The transcription's phrase-group backticks must not reach the reader.
    expect(n("SELECT COUNT(*) n FROM verses WHERE text LIKE '%`%'"), 'stray backticks').toBe(0)
  })

  it('derived word tags exist, stay out of the tagged translations, and line up with the text', () => {
    // Inferred mappings for translations with no scholarly tagging — see derived_tags in schema.sql.
    const tagged = all("SELECT DISTINCT translation_id id FROM verse_tokens").map((r) => r.id)
    const derivedIds = all('SELECT DISTINCT translation_id id FROM derived_tags').map((r) => r.id)
    expect(derivedIds.length).toBeGreaterThan(4)
    for (const id of derivedIds) expect(tagged, `${id} has real tagging`).not.toContain(id)

    // One tag slot per whitespace-delimited word, or the tags would silently shift.
    const bad = all(
      `SELECT d.translation_id t, d.book_id b, d.chapter c, d.verse v,
              LENGTH(d.strongs) - LENGTH(REPLACE(d.strongs,' ','')) + 1 tags,
              LENGTH(TRIM(ve.text)) - LENGTH(REPLACE(TRIM(ve.text),' ','')) + 1 words
         FROM derived_tags d
         JOIN verses ve ON ve.translation_id=d.translation_id AND ve.book_id=d.book_id
                       AND ve.chapter=d.chapter AND ve.verse=d.verse
        WHERE tags != words LIMIT 3`
    )
    expect(bad.length, `tag/word count mismatch: ${JSON.stringify(bad)}`).toBe(0)

    // Every derived Strong's must be a real lexicon entry — never an invented id.
    expect(
      n(`SELECT COUNT(*) n FROM (
           SELECT DISTINCT TRIM(value) s FROM derived_tags, json_each('["' || REPLACE(strongs,' ','","') || '"]')
            WHERE TRIM(value) NOT IN ('-', '+') LIMIT 5000)
          WHERE s NOT IN (SELECT id FROM strongs_lexicon)`),
      'derived tags referencing unknown Strong\'s numbers'
    ).toBe(0)
  })

  it('a phrase rendering one original word stays ONE derived token', () => {
    // Regression (0.2.3): the Berean tags "of the LORD" as a single token carrying H3068. Emitting
    // one derived token per word made Quick Replace substitute once per word — "Yahweh Yahweh".
    // A '+' slot marks a word that continues the token before it.
    const packed = (tr: string, b: string, c: number, v: number): string =>
      String(
        one('SELECT strongs FROM derived_tags WHERE translation_id=? AND book_id=? AND chapter=? AND verse=?', tr, b, c, v)
          ?.strongs ?? ''
      )
    // Young's "a word of Jehovah": "of Jehovah" renders the single Hebrew word, so the second
    // word must be a continuation rather than a second H3068 token.
    const ez = packed('YLT', 'Ezek', 30, 1).split(' ')
    expect(ez.filter((s) => s === 'H3068')).toHaveLength(1)
    expect(ez).toContain('+')

    // Corpus-wide: no verse may start two ADJACENT tokens carrying the same divine name, which is
    // what produced the visible doubling.
    const DIVINE = new Set(['H3068', 'H3069', 'H3050', 'H136', 'H410', 'H430', 'H433'])
    let doubled = 0
    for (const r of all('SELECT translation_id t, book_id b, chapter c, verse v, strongs s FROM derived_tags')) {
      const slots = String(r.s).split(' ')
      for (let i = 1; i < slots.length; i++) {
        // Two token STARTS in a row with the same divine name (a '+' between them is fine).
        if (DIVINE.has(slots[i]) && slots[i] === slots[i - 1]) doubled++
      }
    }
    // A small residue is genuine — Daniel 11:36 really does say "the God of gods" — but it must
    // stay a rounding error, not the 22,942 verses the bug affected.
    expect(doubled).toBeLessThan(400)
  })

  it('verse text carries no source typography or stray whitespace', () => {
    // The KJV source puts a pilcrow inside verse content to mark paragraph starts; this reader
    // flows verses inline, so ~3k verses used to begin with a stray "¶ ".
    expect(n("SELECT COUNT(*) n FROM verses WHERE text LIKE '%¶%'"), 'pilcrow markers').toBe(0)
    expect(n("SELECT COUNT(*) n FROM verses WHERE text != trim(text)"), 'untrimmed verse text').toBe(0)
    expect(n("SELECT COUNT(*) n FROM verses WHERE text LIKE '%  %'"), 'double spaces').toBe(0)
    expect(n("SELECT COUNT(*) n FROM verses WHERE trim(text) = ''"), 'empty verses').toBe(0)
  })

  it('tagger artifacts no longer reach the reader', () => {
    // Only artifacts the TAGGERS introduce — brackets that are genuinely part of the KJV text
    // (e.g. the supplied "[but]" in 1 John 2:23) are legitimate and must survive.
    expect(n("SELECT COUNT(*) n FROM verse_tokens WHERE surface LIKE '%[[%'"), 'Psalm superscription markup').toBe(0)
    expect(n("SELECT COUNT(*) n FROM verse_tokens WHERE surface LIKE '%[fn%'"), 'footnote markers').toBe(0)
    expect(n("SELECT COUNT(*) n FROM verse_tokens WHERE surface LIKE '%. . .%'"), 'BSB placeholder tokens').toBe(0)
    expect(
      n("SELECT COUNT(*) n FROM verse_tokens WHERE translation_id='BSB' AND surface GLOB '*[{}]*'"),
      'BSB alignment braces'
    ).toBe(0)
  })
})
