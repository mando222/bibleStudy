import { expect, it } from 'vitest'
import { checkPrintedOrder } from '../data-pipeline/greekOrder'

it('uses the printed 1 Corinthians 15:19 sequence and distinguishes each occurrence of ἐσμέν', () => {
  // TAGNT reconstruction in the old bundle, with its displaced words flagged.
  const words = 'εἰ ἐν τῇ ζωῇ ταύτῃ ἐν Χριστῷ μόνον, ἐλεεινότεροι ἠλπικότες πάντων ἀνθρώπων ἐσμὲν ἐσμέν.'
    .split(' ').map((original, i) => ({ original, displaced: i === 9 || i === 12, occurrence: i }))
  // SCR-ASCII.ZIP, 1CO_SCR.txt. The Byzantine file independently has the same line here.
  const printed = 'ei en th zwh tauth hlpikotev esmen en cristw monon eleeinoteroi pantwn anyrwpwn esmen'
    .replace(/v/g, 's').split(' ')
  const result = checkPrintedOrder(words, printed)
  expect(result.uncertain).toBe(false)
  expect(result.words.map(w => w.occurrence)).toEqual([0,1,2,3,4,9,12,5,6,7,8,10,11,13])
  expect(result.words[6]).toBe(words[12])
  expect(result.words[13]).toBe(words[13])
})

it('keeps each original occurrence when a homograph, insertion, or compound would require a guess', () => {
  const words = ['λόγος', 'ἦν', 'λόγος'].map((original, i) => ({ original, displaced: i !== 1, gloss: String(i) }))
  for (const witness of [undefined, ['logos','logos','hn'], ['logos','hn'], ['logos','ara','logos']]) {
    expect(checkPrintedOrder(words, witness)).toEqual({ words, uncertain: true })
  }
  const compound = [{ original: 'τὸ δὲ', displaced: false }, { original: 'τί', displaced: false }]
  expect(checkPrintedOrder(compound, ['to','de','ti'])).toEqual({ words: compound, uncertain: false })
  expect(checkPrintedOrder(compound, ['to','ti','de'])).toEqual({ words: compound, uncertain: true })
})

it('flags indistinguishable displaced occurrences even when the unaccented sequence already matches', () => {
  const words = [{ original: 'τίς', displaced: true }, { original: 'τις', displaced: true }]
  expect(checkPrintedOrder(words, ['tis','tis'])).toEqual({ words, uncertain: true })
  expect(checkPrintedOrder(words.map(w => ({ ...w, displaced: false })), ['tis','tis']).uncertain).toBe(false)
})
