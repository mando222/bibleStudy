import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ComparisonSourceDetails from '../src/renderer/src/components/ComparisonSourceDetails'
import type { SourceWord } from '../src/shared/types'

const jesus: SourceWord = {
  edition: 'BSB', evidence: 'aligned', language: 'Greek', book: 'John', chapter: 11, verse: 35,
  startPosition: 0, endPosition: 0, english: 'Jesus', text: 'Ἰησοῦς', translit: 'Iēsous',
  strongs: 'G2424', morph: 'Noun - Nominative Masculine Singular', rowId: '92074'
}

function render(translation: string, display: string, source: SourceWord): string {
  return renderToStaticMarkup(createElement(ComparisonSourceDetails, { translation, display, source }))
}

describe('source evidence for a restored word', () => {
  it('starts collapsed and distinguishes a publisher’s alignment from KJV corroboration', () => {
    const bsb = render('BSB', 'Iēsous', jesus)
    expect(bsb).not.toMatch(/<details[^>]*\bopen\b/)
    for (const detail of ['Iēsous', 'Ἰησοῦς', '(BSB), row 92074', 'links this BSB wording']) {
      expect(bsb).toContain(detail)
    }
    const kjv = render('KJV', 'Iēsous', { ...jesus, evidence: 'corroborated' })
    expect(kjv).toContain('KJV word tag')
    expect(kjv).toContain('Greek Textus Receptus')
  })

  it('distinguishes the four-consonant display from the publisher’s transliteration', () => {
    const source: SourceWord = {
      ...jesus, evidence: 'corroborated', language: 'Hebrew', strongs: 'H3068', book: 'Ps', chapter: 23,
      verse: 1, english: 'The LORD', text: 'יְהוָ֥ה', translit: 'Yah·weh', endPosition: 1,
      morph: 'Noun - proper - masculine singular', rowId: '344393'
    }
    const rendered = render('KJV', 'YHWH', source)
    for (const detail of ['four Hebrew consonants', 'Yah·weh', 'יְהוָ֥ה', 'Masoretic text', 'row 344393']) {
      expect(rendered).toContain(detail)
    }
  })
})
