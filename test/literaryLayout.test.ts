// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { nativeChapter } from '../data-pipeline/literaryLayout'
import { literaryGroups, describeLayout } from '../src/shared/literaryLayout'
import { useAppStore } from '../src/renderer/src/store/useAppStore'
import VerseView from '../src/renderer/src/components/VerseView'
import { publishedSelection, publishedCopy } from '../src/renderer/src/lib/scriptureSelection'
import type { Verse } from '../src/shared/types'

const bsb = nativeChapter([
  { type: 'heading', content: ['The LORD Is My Shepherd'] },
  { type: 'hebrew_subtitle', content: ['A Psalm of David.'] },
  { type: 'verse', number: 1, content: [{ text: 'The LORD is my shepherd;', poem: 1 }, { noteId: 50 }, { text: 'I shall not want.', poem: 2 }] }
]).get(1)!
const verse: Verse = { verse: 1, ...bsb, tokens: null }

it('preserves edition-specific titles and poetry in Psalm 23', () => {
  expect(verse.text).toBe('The LORD is my shepherd; I shall not want.')
  expect(bsb.layout).toEqual([
    { at: 0, kind: 'heading', text: 'The LORD Is My Shepherd' },
    { at: 0, kind: 'superscription', text: 'A Psalm of David.' },
    { at: 0, kind: 'poetry', indent: 1 }, { at: 25, kind: 'poetry', indent: 2 }
  ])
  const ylt = nativeChapter([{ type: 'line_break', paragraph: 'p' }, { type: 'verse', number: 1,
    content: ['A Psalm of David. Jehovah [is] my shepherd, I do not lack,'] }]).get(1)!
  expect(ylt.layout).toEqual([{ at: 0, kind: 'paragraph', style: 'p' }])
  expect(describeLayout([{ ...ylt, verse: 1, tokens: null }], false)).toEqual(['Paragraph begins “A Psalm of David. Jehovah…”'])
  expect(describeLayout([{ ...verse, layout: undefined }])).toEqual([])
})

it('keeps a split poetic line continuous across a footnote, and respects an explicit same-indent break', () => {
  const rows = nativeChapter([{ type: 'verse', number: 1, content: [
    { text: 'The LORD', poem: 1 }, { noteId: 11 }, { text: 'is my strength and song.', poem: 1 },
    { lineBreak: true }, { text: 'A second line.', poem: 1 }
  ] }, { type: 'line_break' }, { type: 'verse', number: 2, content: [{ text: 'New stanza.', poem: 1 }] }])
  expect(rows.get(2)!.layout).toContainEqual({ at: 0, kind: 'line', blank: true })
  expect(rows.get(1)!.layout.filter(m => m.kind === 'poetry').map(m => m.at)).toEqual([0, 34])
})

it('does not duplicate speaker markers on consecutive words or verses and resumes after unmarked narration', () => {
  const rows = nativeChapter([
    { type: 'verse', number: 1, content: ['He said,', { text: '“First', wordsOfJesus: true }, {noteId: 1}, { text: 'sentence.', wordsOfJesus: true }] },
    { type: 'verse', number: 2, content: [{ text: 'Second sentence.”', wordsOfJesus: true }, 'He said,', { text: '“Third.”', wordsOfJesus: true }] }
  ])
  const first = rows.get(1)!
  const next = rows.get(2)!
  expect(first.layout).toEqual([{ at: 9, end: first.text.length, kind: 'speaker', continuation: false }])
  expect(next.layout.filter(m => m.kind === 'speaker').map(m => [next.text.slice(m.at, m.end), m.continuation]))
    .toEqual([['Second sentence.”', true], ['“Third.”', false]])
})

it('does not split a restored word, even if a supplied break falls within its English spelling', () => {
  const groups = literaryGroups([{ original: 'The LORD', display: 'YHWH' }, { original: ' speaks', display: ' speaks' }],
    [{ at: 4, kind: 'line' }, { at: 9, kind: 'paragraph', style: 'm' }], true, false)
  expect(groups.map(g => g.parts.map(p => p.display).join(''))).toEqual(['YHWH ', 'speaks'])
  expect(groups.flatMap(g => g.parts.map(p => p.original)).join('')).toBe('The LORD speaks')
})

afterEach(() => { document.body.replaceChildren() })
it('keeps native verse selection, navigation, Strong’s and notes usable inside a literary verse', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  useAppStore.persist.setOptions({ storage: { getItem: () => null, setItem() {}, removeItem() {} } })
  const state = useAppStore.getState()
  useAppStore.setState({ strongsVisible: true })
  const token = { position: 0, surface: 'The', trailer: ' ', strongs: 'H123', lemma: null, translit: null, morph: null, gloss: null }
  const input: Verse = { ...verse, tokens: [token, { ...token, position: 1, strongs: null, surface: verse.text.slice(4), trailer: '' }] }
  try {
    act(() => root.render(createElement(VerseView, { v: input, literary: true, hasNote: true,
      translation: 'BSB', book: 'Ps', chapter: 23, onOpenMenu() {} })))
    const range = document.createRange()
    range.selectNodeContents(host)
    expect(publishedSelection(host, range)).toEqual({ text: input.text, v1: 1, v2: 1 })
    expect(host.querySelectorAll('[data-verse]')).toHaveLength(1)
    expect(host.querySelectorAll('[data-literary-kind="poetry"]')).toHaveLength(2)
    expect(host.querySelector('[aria-label="Has a note"]')).not.toBeNull()
    expect(host.querySelector('[aria-label="Strong\'s H123"]')).not.toBeNull()
    const cut = host.querySelectorAll('[data-literary-kind="poetry"]')[1].querySelector('[data-scripture-part]')!.firstChild!
    range.setStart(cut, 2)
    range.setEnd(cut, 7)
    expect(publishedSelection(host, range)?.text).toBe('shall')
    act(() => root.render(createElement(VerseView, { v: input, translation: 'BSB', book: 'Ps', chapter: 23, onOpenMenu() {} })))
    expect(host.querySelector('[data-literary-kind="heading"]')).toBeNull()
    expect(host.querySelector('[data-literary-kind="poetry"]')).toBeNull()
    const subtitle = host.querySelector('[data-literary-kind="superscription"]')!
    expect(subtitle.textContent).toBe('A Psalm of David.')
    const selection = window.getSelection()!
    selection.selectAllChildren(subtitle)
    expect(publishedCopy(host, selection) ?? selection.toString()).toBe('A Psalm of David.')
  } finally {
    act(() => root.unmount())
    useAppStore.setState(state)
  }
})

it('opens the source behind a speaker mark only on request, including the reviewed nested quotation', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const native = nativeChapter([{ type: 'line_break', paragraph: 'p' }, { type: 'verse', number: 3, content: [
    { text: 'Blessed are the poor in spirit: for theirs is the kingdom of heaven.', wordsOfJesus: true }
  ] }]).get(3)!
  const common = { translation: 'KJV', book: 'Matt', chapter: 5, onOpenMenu() {} }
  try {
    act(() => root.render(createElement(VerseView, { ...common, v: { verse: 3, ...native, tokens: null }, literary: true })))
    expect(host.querySelector('[aria-haspopup="dialog"]')).toBeNull()
    act(() => root.render(createElement(VerseView, { ...common, v: { verse: 3, ...native, tokens: null }, speakers: true })))
    const mark = host.querySelector<HTMLButtonElement>('[aria-label="Speaker guide: Jesus"]')!
    expect(mark.closest('[data-speaker-placement]')?.getAttribute('data-speaker-placement')).toBe('inline')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    act(() => root.render(createElement(VerseView, { ...common, v: { verse: 3, ...native, tokens: null }, speakers: true, literary: true })))
    const margin = host.querySelector<HTMLButtonElement>('[data-speaker-placement="margin"] button')!
    act(() => margin.click())
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('KJV · edition-supplied speaker marking')
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(native.text)
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    act(() => root.render(createElement(VerseView, { ...common, book: 'Acts', chapter: 15, speakers: true,
      v: { verse: 15, text: 'And to this agree the words of the prophets; as it is written,', tokens: null } })))
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Speaker guide: James introduces a quotation"]')!.click())
    const note = document.querySelector('[role="dialog"]')
    expect(note?.textContent).toContain('Reviewed study note')
    expect(note?.textContent).toContain('Amos 9:11')
  } finally { act(() => root.unmount()) }
})
