import { describe, it, expect } from 'vitest'
import type { VerseToken } from '../src/shared/types'
import { normalizeWord, buildWordStrongs } from '../src/shared/wordLookup'

const tok = (surface: string, strongs: string | null): VerseToken => ({
  position: 0,
  surface,
  trailer: ' ',
  strongs,
  lemma: null,
  translit: null,
  morph: null,
  gloss: null
})

describe('clean-text word → Strong lookup (regression: click words with numbers hidden)', () => {
  it('normalizeWord lowercases and strips punctuation', () => {
    expect(normalizeWord('Word,')).toBe('word')
    expect(normalizeWord('“LORD”')).toBe('lord')
    expect(normalizeWord('  ')).toBe('')
  })

  it('maps tagged words to their Strong number and skips untagged words', () => {
    const m = buildWordStrongs([tok('In', 'G1722'), tok('the', null), tok('Word', 'G3056')])
    expect(m.get('in')).toBe('G1722')
    expect(m.get('word')).toBe('G3056')
    expect(m.has('the')).toBe(false) // untagged word isn't clickable
  })

  it('matches a clicked word regardless of trailing punctuation', () => {
    const m = buildWordStrongs([tok('Word', 'G3056')])
    expect(m.get(normalizeWord('Word,'))).toBe('G3056')
    expect(m.get(normalizeWord('(Word)'))).toBe('G3056')
  })

  it('is null-safe', () => {
    expect(buildWordStrongs(null).size).toBe(0)
    expect(buildWordStrongs(undefined).size).toBe(0)
  })
})
