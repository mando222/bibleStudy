// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '../src/renderer/src/store/useAppStore'
import LearnGrammar from '../src/renderer/src/components/LearnGrammar'
import LearnDrills from '../src/renderer/src/components/LearnDrills'
import LearnFlashcards from '../src/renderer/src/components/LearnFlashcards'
import TimelinesView from '../src/renderer/src/components/TimelinesView'
import AllAnnotations from '../src/renderer/src/components/AllAnnotations'

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  useAppStore.persist.setOptions({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } })
  useAppStore.setState(useAppStore.getInitialState(), true)
  Object.assign(window, { api: {} })
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })
const button = (text: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.includes(text))
const click = async (text: string) => { await act(async () => button(text)!.click()) }
const search = async (value: string) => {
  const input = host.querySelector('input')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

it('reopens the last grammar lesson independently in each language', async () => {
  const progress: Record<string, string> = {}
  Object.assign(window.api, {
    getGrammarLessons: async () => ['koine', 'hebrew'].flatMap((course, c) => ['First', 'Second'].map((title, i) =>
      ({ id: 10 * c + i, course, title, chapterNo: i + 1, vocab: [], readings: [], exercises: [], bodyMd: title }))),
    getLearnProgress: async () => ({ ...progress }),
    setLearnProgress: async (_module: string, key: string, value: string) => { progress[key] = value }
  })
  for (const [language, wanted] of [['greek', 'First'], ['hebrew', 'First'], ['greek', 'Second']] as const) {
    await act(async () => root.render(createElement(LearnGrammar, { key: language, language })))
    expect(host.querySelector('h1')?.textContent).toContain(wanted)
    if (language === 'greek' && wanted === 'First') await click('Second')
  }
})

it('reports the chosen drill answer and names the correct one', async () => {
  Object.assign(window.api, { getVocab: async () => ['love', 'light', 'life', 'grace'].map((gloss, i) => ({ strongs: 'G' + i, gloss, lemma: 'word ' + gloss })) })
  await act(async () => root.render(createElement(LearnDrills, { language: 'greek' })))
  const answer = host.querySelector('[dir]')!.textContent!.replace('word ', '')
  const wrong = [...host.querySelectorAll('button')].find(b => b.textContent !== answer)!.textContent!
  await click(wrong)
  expect(host.querySelector('[role="status"]')?.textContent).toBe(`You chose “${wrong}”. The correct answer is “${answer}”.`)
})

it('counts the same all-form Hebrew occurrences in the flashcard as the Words map', async () => {
  const getWordFrequency = vi.fn().mockResolvedValue({ coverage: 'complete', occurrences: 11083, verses: 6824 })
  Object.assign(window.api, { getWordFrequency, getVocab: async () => [{ strongs: 'H853', frequency: 10946, language: 'hebrew' }],
    listDueCards: async () => [], seenCards: async () => [], srsStats: async () => ({ learned: 0, due: 0 }) })
  await act(async () => root.render(createElement(LearnFlashcards, { language: 'hebrew' })))
  expect(getWordFrequency).not.toHaveBeenCalled()
  await click('Reveal')
  expect(getWordFrequency).toHaveBeenCalledWith({ edition: 'MT', id: 'H853' })
  expect(host.textContent).toContain('11,083 recorded occurrences in 6,824 verses')
  expect(host.textContent).toContain('Qere')
})

it('filters the Timeline by a place, person or verse, labels chronology and expands every participant', async () => {
  Object.assign(window.api, { getEvents: async () => [{ id: 9, title: 'Matthias replaces Judas', startYear: 30,
    places: [{ id: 1, name: 'Jerusalem' }], participants: Array.from({length: 14}, (_, i) => ({ id: i, name: 'Person ' + (i + 1) })), verses: ['Acts.1.26'] }] })
  await act(async () => root.render(createElement(TimelinesView)))
  for (const term of ['Jerusalem', 'Person 14', 'Acts 1:26']) {
    await search(term)
    expect(host.textContent).toContain('Matthias replaces Judas')
  }
  expect(host.textContent).toContain('Approx. 30 AD · Theographic chronology')
  expect(button('Person 14')).toBeUndefined()
  await click('Show 2 more participants')
  expect(button('Person 14')).toBeDefined()
})

it('finds note text and the native wording of an imported highlight and opens the correct edition', async () => {
  const onNavigate = vi.fn()
  useAppStore.setState({ primary: 'WEB', parallels: ['WEB'] })
  Object.assign(window.api, { listAnnotations: async () => ({
    notes: [{ id: 1, book: 'Rom', chapter: 16, verse: 25, body: 'Research note', updatedAt: 10 }],
    highlights: [{ id: 4, book: 'Phil', chapter: 1, verse: 16, translation: 'imp_fixture', color: 'yellow', createdAt: 5 }]
  }), getComparisonVerse: async () => ({ text: 'Wording from this edition' }) })
  await act(async () => root.render(createElement(AllAnnotations, { onNavigate })))
  await search('research')
  expect(host.textContent).toContain('Romans 16:25')
  expect(host.textContent).toContain('KJV numbering')
  await search('Romans 14:24')
  expect(host.textContent).toContain('Research note')
  expect(host.textContent).toContain('Romans 14:24 · WEB')
  await search('from this edition')
  expect(host.textContent).toContain('1 annotation')
  expect(host.textContent).not.toContain('Research note')
  await click('Philippians 1:16')
  expect(onNavigate).toHaveBeenCalled()
  expect(useAppStore.getState()).toMatchObject({ primary: 'imp_fixture', referenceEdition: 'imp_fixture', book: 'Phil', chapter: 1, activeVerse: 16 })
})
