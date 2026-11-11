import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { greekReadings, parseStepReference } from '../data-pipeline/step'
import { WordFrequencyIndex, parseHebrewFrequency } from '../data-pipeline/wordFrequency'

const schema = readFileSync(new URL('../data-pipeline/schema.sql', import.meta.url), 'utf8')
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')

function fixture() {
  const db = new DatabaseSync(':memory:')
  db.exec(schema)
  return { db, index: new WordFrequencyIndex(db) }
}

describe('Publisher-derived frequency records', () => {
  it('indexes alternate IDs once and preserves the original Greek while grouping punctuation/case', () => {
    const { db, index } = fixture()
    const c = ['Jas.4.13#01=NKO', 'Ἄγε, (Age)', 'come', 'G0071=V-PAM-2S', '', 'NA28+TR+Byz', '', '', '', '', '', 'G0071', 'G0033, G0033, G0071']
    for (const w of greekReadings(c, parseStepReference(c[0])!)) index.greek('Jas', 4, 13, 0, w)
    index.finish()
    expect(db.prepare("SELECT strongs, form, surface, alternate, translit, morph FROM word_frequency_occurrences WHERE edition='NA' ORDER BY strongs").all()).toEqual([
      {strongs:'G33', form:'ἄγε', surface:'Ἄγε', alternate:1, translit:'Age', morph:'V-PAM-2S'},
      {strongs:'G71', form:'ἄγε', surface:'Ἄγε', alternate:0, translit:'Age', morph:'V-PAM-2S'}
    ])
    expect(db.prepare("SELECT tagged_words FROM word_frequency_chapters WHERE edition='NA'").get()?.tagged_words).toBe(1)
    db.close()
  })

  it('does not transfer an alternate edition’s tag or an unresolved row-level alias', () => {
    const { db, index } = fixture()
    const c = ['Act.1.8#12=N(K)O', 'μου (mou)', 'my', 'G3165=P-1GS', '', 'NA28',
      'μοι (T=moi) to Me - G3427=P-1DS in: TR+Byz', '', '', '', '', 'G3165', 'G3427, , G3450']
    for (const w of greekReadings(c, parseStepReference(c[0])!)) index.greek('Acts', 1, 8, 0, w)
    index.finish()
    expect(db.prepare('SELECT edition,strongs FROM word_frequency_occurrences ORDER BY edition').all()).toEqual([
      {edition:'BYZ',strongs:'G3427'},{edition:'NA',strongs:'G3165'},{edition:'TR',strongs:'G3427'}
    ])
    expect(db.prepare('SELECT DISTINCT strongs,reason FROM word_frequency_gaps').all()).toEqual([
      {strongs:'G3450',reason:'ambiguous-alternate'}
    ])
    db.close()
  })

  it('links a fused Greek word to its whole-word dictionary ID without inventing component spans or a parse', () => {
    const { db, index } = fixture()
    const c = ['Act.5.15#18=NKO', 'κἂν (kan)', 'even if', 'G2532=CONJ + G1437=COND', '', 'NA28',
      '', '', '', '', '', 'G1437, G2532_D', 'G2579']
    for (const w of greekReadings(c, parseStepReference(c[0])!)) index.greek('Acts', 5, 15, 0, w)
    index.finish()
    const records = db.prepare('SELECT strongs, surface, alternate, morph FROM word_frequency_occurrences').all()
    expect(records).toEqual([{strongs:'G2579', surface:'κἂν', alternate:1, morph:''}])
    expect(db.prepare('SELECT strongs, reason FROM word_frequency_gaps ORDER BY strongs').all()).toEqual([
      {strongs:'G1437',reason:'compound'},{strongs:'G2532',reason:'compound'}
    ])
    db.close()
  })

  it('keeps a spelling variant in an unselected edition out of the alternate-ID count', () => {
    const { db, index } = fixture()
    const c = ['1Co.13.2#02=NKO','ἐὰν (ean)','if','G1437=COND','','NA28+WH+TR+Byz',
      '', 'WH: κἂν ;', '', '', '', 'G1437_A','G2579']
    for (const w of greekReadings(c, parseStepReference(c[0])!)) index.greek('1Cor',13,2,0,w)
    index.finish()
    expect(db.prepare("SELECT COUNT(*) AS n FROM word_frequency_occurrences WHERE strongs='G2579'").get()?.n).toBe(0)
    expect(db.prepare("SELECT COUNT(*) AS n FROM word_frequency_occurrences WHERE strongs='G1437'").get()?.n).toBe(3)
    expect(db.prepare("SELECT COUNT(*) AS n FROM word_frequency_gaps WHERE strongs='G2579' AND reason='ambiguous-alternate'").get()?.n).toBe(3)
    // If the selected edition itself changes the spelling, the row's two IDs cannot
    // safely be assigned to that replacement form either.
    const withSelectedVariant = [...c]
    withSelectedVariant[7] = 'WH+TR: κἂν ;'
    const tr = greekReadings(withSelectedVariant, parseStepReference(c[0])!).find(w => w.edition === 'TR')
    expect(tr).toMatchObject({original:'κἂν', uncertainSpellingTag:true, publisherTranslit:null})
    db.close()
  })

  it('retains the entire Leningrad form of a name joined internally with maqqef', () => {
    const a = { book:'Gen',chapter:14,verse:17,nativeChapter:14,nativeVerse:17,position:8 }
    const fields = ['Gen.14.17#09=LBH(A)','כְּדָרְ\\־לָעֹ֔מֶר','Kedor-la.\'ֹo.mer','Kedor-laomer',
      '{H3540}\\H9014','HNpm','A= …','','H3540_A','']
    const word = parseHebrewFrequency(fields,'LBH(A)',a)
    expect(word?.parts[0].surface).toBe('כְּדָרְ־לָעֹ֔מֶר')
    expect(word?.parts[0].segments).toEqual([{position:8,start:0,end:fields[1].length}])
  })

  it('preserves Hebrew components and joins a multiword lexeme once in its native reference', () => {
    const { db, index } = fixture()
    const a = { book:'Job', chapter:42,verse:14,nativeChapter:42,nativeVerse:14, position:0 }
    const first = ['Job.42.14#10=L','קֶ֥רֶן','Ke.ren','Keren-','{H7163}+','HNpf','','','H7163_A','']
    const second = ['Job.42.14#11=L','הַפּֽוּךְ\\׃','ha.Pukh','Happuch','{H7163}\\H9016','HNpf','','','H7163_b','']
    index.hebrewVerse([parseHebrewFrequency(first,'L',a)!,parseHebrewFrequency(second,'L',{...a,position:1})!])
    const b = {book:'Ps',chapter:51,verse:1,nativeChapter:51,nativeVerse:3,position:0}
    const attached = ['','ל֣/וֹ','l/o','','H9005/{H9033}','HR/Sp3ms','K= …','','H9033','H0413, H3808']
    index.hebrewVerse([parseHebrewFrequency(attached,'Q(K)',b)!])
    expect(parseHebrewFrequency(attached,'X',b)).toBeNull()
    expect(parseHebrewFrequency(attached,'R',b)).toBeNull()
    index.finish()
    const joined = db.prepare("SELECT * FROM word_frequency_occurrences WHERE strongs='H7163'").all()
    expect(joined).toHaveLength(1)
    expect(joined[0]).toMatchObject({surface:'קֶ֥רֶן הַפּֽוּךְ',translit:'Ke.ren ha.Pukh',morph:'HNpf'})
    expect(JSON.parse(String(joined[0].segments))).toEqual([
      {position:0,start:0,end:first[1].length},{position:1,start:0,end:second[1].split('\\')[0].length}
    ])
    const rows = db.prepare("SELECT * FROM word_frequency_occurrences WHERE book_id='Ps' ORDER BY part").all()
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({strongs:'H9005',morph:'HR',surface_start:0,surface_end:2,native_verse:3})
    expect(rows[1]).toMatchObject({strongs:'H9033',morph:'HSp3ms',surface:'וֹ',translit:'o',surface_start:2})
    expect(db.prepare('SELECT strongs FROM word_frequency_gaps ORDER BY strongs').all()).toEqual([{strongs:'H3808'},{strongs:'H413'}])
    expect(db.prepare("SELECT tagged_words FROM word_frequency_chapters WHERE book_id='Job'").get()?.tagged_words).toBe(2)
    db.close()
  })
})
