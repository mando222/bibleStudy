import { describe, expect, it } from 'vitest'
import { greekReadings, parseStepReference } from '../data-pipeline/step'

describe('STEPBible source rows', () => {
  it('keeps the reader and native Hebrew references on a renumbered Psalm word', () => {
    expect(parseStepReference('Psa.51.1(51.3)#01=L')).toEqual({
      book: 'Psa', chapter: 51, verse: 1, position: 1, type: 'L',
      kjv: null, native: { chapter: 51, verse: 3 }
    })
  })

  it('keeps Greek reference qualifiers and the reading type separate', () => {
    expect(parseStepReference('Php.1.16[1.17]#04=NKO')).toMatchObject({
      verse: 16, kjv: { chapter: 1, verse: 17 }, native: null
    })
    expect(parseStepReference('Rom.16.25{14.24}#01=NKO')).toMatchObject({
      book: 'Rom', chapter: 16, verse: 25, position: 1
    })
    // Exercise the combined qualifier grammar independently of today's source inventory.
    expect(parseStepReference('Act.1.2(1.3)[1.4]{1.5}#06=NK(O)')).toMatchObject({
      chapter: 1, verse: 2, native: { chapter: 1, verse: 3 },
      kjv: { chapter: 1, verse: 4 }, position: 6, type: 'NK(O)'
    })
  })

  it('selects the TAGNT alternative and moves “once” to its edition-specific position in Jude 5', () => {
    // Relevant fields from the three TAGNT source rows; unused columns are omitted.
    const rows = [
      ['Jud.1.5#07=N(K)O', 'πάντα, (panta)', 'everything,', 'G3956=A-APN', '', 'NA28+NA27',
        'τοῦτο (T=touto) this - G5124=D-ASN in: TR+Byz'],
      ['Jud.1.5#10=NK(O)', 'κύριος (kurios)', 'Lord', 'G2962G=N-NSM-T', '', 'NA27+TR+Byz',
        'Ἰησοῦς (O=Iēsous) Jesus - G2424=N-NSM-P in: NA28+Tyn+SBL'],
      ['Jud.1.5#11=NKO', 'ἅπαξ (hapax)', 'once', 'G0530=ADV', '', 'NA28«5+NA27+TR«5+Byz«5']
    ]
    const words = rows.flatMap(fields => greekReadings(fields, parseStepReference(fields[0])!))
    function sequence(edition: string) {
      return words.filter(word => word.edition === edition).sort((a, b) => a.order - b.order)
        .map(word => [word.original, word.strongs])
    }
    expect(sequence('NA')).toEqual([['ἅπαξ', 'G530'], ['πάντα,', 'G3956'], ['Ἰησοῦς', 'G2424']])
    for (const edition of ['TR', 'BYZ']) {
      expect(sequence(edition)).toEqual([['ἅπαξ', 'G530'], ['τοῦτο', 'G5124'], ['κύριος', 'G2962']])
    }
  })
})
