// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WordFrequency, { useFrequencySettings } from '../src/renderer/src/components/WordFrequency'
import LexiconCard from '../src/renderer/src/components/LexiconCard'
import SourceWordSettings from '../src/renderer/src/components/SourceWordSettings'
import WordsView from '../src/renderer/src/components/WordsView'
import StudyPanel from '../src/renderer/src/components/StudyPanel'
import { useAppStore } from '../src/renderer/src/store/useAppStore'
import type { WordFrequency as Summary, WordFrequencyQuery, WordFrequencyVerse } from '../src/shared/wordFrequency'

let host: HTMLElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  Object.assign(window, { api: {} })
  useAppStore.persist.setOptions({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } })
  useAppStore.setState(useAppStore.getInitialState(), true)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

function select(label: string) {
  const el = [...host.querySelectorAll('label')].find(el => el.firstChild?.textContent === label)?.querySelector('select')
  if (!el) throw new Error(`Missing select: ${label}`)
  return el
}
async function change(label: string, value: string) {
  await act(async () => {
    const el = select(label)
    el.value = value
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
async function click(selector: string) {
  const button = host.querySelector<HTMLButtonElement>(selector)
  if (!button) throw new Error(`Missing button: ${selector}`)
  await act(async () => button.click())
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => { resolve = yes })
  return { promise, resolve }
}

function StudyFrequency({ id }: { id: string }) {
  return createElement(WordFrequency, { id, settings: useFrequencySettings() })
}

function summary(query: WordFrequencyQuery): Summary {
  const total = query.form ? 1 : 3
  return {
    id: query.id, edition: query.edition, coverage: 'complete', notice: null, language: 'Greek',
    occurrences: total, alternateOccurrences: 0, verses: 1, tagged: 1000,
    forms: [
      { id: 'a', text: 'ἀγάπην', translit: 'agapēn', morph: 'N-ASF', count: 2 },
      { id: 'b', text: 'ἀγάπῃ', translit: 'agapēi', morph: 'N-DSF', count: 1 }
    ],
    books: [
      { book: 'Mark', name: 'Mark', occurrences: 0, verses: 0, tagged: 500,
        chapters: [{ chapter: 1, occurrences: 0, verses: 0, tagged: 500 }] },
      { book: 'Rom', name: 'Romans', occurrences: total, verses: 1, tagged: 500,
        chapters: [{ chapter: 14, occurrences: total, verses: 1, tagged: 500 }] }
    ]
  }
}
const passage: WordFrequencyVerse = {
  book: 'Rom', chapter: 14, verse: 24, occurrences: 3, readerRef: { book: 'Rom', chapter: 16, verse: 25 },
  tokens: [
    { text: 'ἀγάπην', matching: true, spaceBefore: false }, { text: 'καί', matching: false, spaceBefore: true },
    { text: 'ἀγάπῃ', matching: true, spaceBefore: true }, { text: 'ἀγάπην', matching: true, spaceBefore: true }
  ]
}

describe('word frequency in Words', () => {
  it('follows the available Greek text order, keeps an explicit choice across Words visits and uses MT for Hebrew IDs', async () => {
    const getWordFrequency = vi.fn(async (query: WordFrequencyQuery) => summary(query))
    Object.assign(window.api, { getWordFrequency })
    useAppStore.setState({ preferredTextOrder: { nt: ['BYZ', 'TR', 'NA'], ot: ['LXX', 'MT'], masoretic: ['ketiv', 'qere'] },
      originalEditions: [
        { id: 'NA', name: 'Critical', language: 'grc', testament: 'NT' },
        { id: 'TR', name: 'Textus Receptus', language: 'grc', testament: 'NT' },
        { id: 'MT', name: 'Masoretic', language: 'hbo', testament: 'OT' },
        { id: 'LXX', name: 'Septuagint', language: 'grc', testament: 'OT' }
      ] })
    await act(async () => root.render(createElement(StudyFrequency, { id: 'G26' })))
    expect(select('Source edition').value).toBe('')
    expect(select('Source edition').options[0].textContent).toContain('Textus Receptus')
    expect(getWordFrequency).toHaveBeenLastCalledWith({ id: 'G26', edition: 'TR' })
    await change('Source edition', 'NA')
    await act(async () => root.render(null))
    await act(async () => root.render(createElement(StudyFrequency, { id: 'H430' })))
    expect(getWordFrequency).toHaveBeenLastCalledWith({ id: 'H430', edition: 'MT' })
    await act(async () => root.render(createElement(StudyFrequency, { id: 'G25' })))
    expect(getWordFrequency).toHaveBeenLastCalledWith({ id: 'G25', edition: 'NA' })
    expect(select('Source edition').value).toBe('NA')
    await change('Source edition', '')
    expect(getWordFrequency).toHaveBeenLastCalledWith({ id: 'G25', edition: 'TR' })
    const state = useAppStore.getState()
    expect(useAppStore.persist.getOptions().partialize!(state)).not.toHaveProperty('frequencyGreekEdition')
    await act(async () => state.setPreferredTextOrder({ ...state.preferredTextOrder, nt: ['NA', 'BYZ', 'TR'] }))
    expect(getWordFrequency).toHaveBeenLastCalledWith({ id: 'G25', edition: 'NA' })
  })

  it('opens the study beside the concordance, shows every parse and match, and navigates using the reader reference', async () => {
    const getWordFrequency = vi.fn(async (q: WordFrequencyQuery) => summary(q))
    Object.assign(window.api, { getStrongs: async () => ({ id: 'G26', language: 'greek', lemma: 'ἀγάπη' }),
      getLexiconEntries: async () => [], getWordFrequency, getWordFrequencyPassages: async (q: WordFrequencyQuery) => [
        q.form === 'b' ? { ...passage, occurrences: 1, tokens: passage.tokens.map(t => ({ ...t, matching: t.text === 'ἀγάπῃ' })) } : passage
      ] })
    await act(async () => root.render(createElement(LexiconCard, { id: 'G26', inWords: true })))
    const controls = [...host.querySelectorAll<HTMLButtonElement>('[aria-label="Word study tools"] button')]
    expect(controls.map(b => b.textContent)).toEqual(['Definition', 'Concordance', 'Word frequency'])
    expect(getWordFrequency).not.toHaveBeenCalled()
    await act(async () => controls[2].click())
    await change('Source edition', 'BYZ')
    expect(select('Grammatical form').value).toBe('')
    const options = [...select('Grammatical form').options].map(o => o.text)
    expect(options[1]).toContain('agapēn')
    expect(options[1].toLowerCase()).toMatch(/accusative.*singular/)
    expect(options[1]).toContain('2 occurrences')
    expect([...host.querySelectorAll('mark')].map(m => m.textContent)).toEqual(['ἀγάπην', 'ἀγάπῃ', 'ἀγάπην'])
    const group = '[aria-label="Books in canonical order"]'
    expect([...host.querySelectorAll(`${group} button`)].map(b => b.textContent)).toEqual(['Mark0', 'Rom3'])
    expect(host.querySelector(`${group} button:last-child`)?.getAttribute('data-level')).toBe('4') // 6 per thousand
    await change('Shade by', 'count')
    expect(host.querySelector(`${group} button:last-child`)?.getAttribute('data-level')).toBe('2') // 3 raw hits
    await click(`${group} button:first-child`)
    expect(host.textContent).toContain('No occurrences recorded in this chapter.')
    expect(host.querySelector('mark')).toBeNull()
    await change('Grammatical form', 'b')
    expect(host.querySelector(`${group} button:last-child`)?.textContent).toBe('Rom1')
    expect([...host.querySelectorAll('mark')].map(m => m.textContent)).toEqual(['ἀγάπῃ'])
    expect(host.textContent).toContain('Reader Romans 16:25')
    await click('button[aria-label="Open Romans 14:24 in the interlinear at Romans 16:25"]')
    expect(useAppStore.getState()).toMatchObject({ activity: 'bible', interlinear: true, interlinearEdition: 'BYZ', book: 'Rom', chapter: 16, activeVerse: 25 })
  })

  it('drops pending form and passage responses after an edition or entry change', async () => {
    const oldForm = deferred<Summary>()
    const oldPassage = deferred<WordFrequencyVerse[]>()
    let holdPassage = true
    const getWordFrequency = vi.fn(async (q: WordFrequencyQuery) => {
      if (q.form) return oldForm.promise
      return { ...summary(q), alternateOccurrences: q.id === 'G33' ? 3 : 0, notice: `Results for ${q.id} in ${q.edition}` }
    })
    Object.assign(window.api, { getWordFrequency, getWordFrequencyPassages: () => holdPassage ? oldPassage.promise : Promise.resolve([]) })
    await act(async () => root.render(createElement(StudyFrequency, { id: 'G26' })))
    await change('Grammatical form', 'b')
    expect(getWordFrequency).toHaveBeenLastCalledWith({ id: 'G26', edition: 'NA', form: 'b' })
    expect(host.querySelector('[aria-label="Books in canonical order"]')).toBeNull()
    holdPassage = false
    await change('Source edition', 'TR')
    await act(async () => root.render(createElement(StudyFrequency, { id: 'G33' })))
    await act(async () => { oldForm.resolve({ ...summary({ id: 'G26', edition: 'NA', form: 'b' }), notice: 'OLD FORM' }); oldPassage.resolve([passage]) })
    expect(select('Grammatical form').value).toBe('')
    expect(host.textContent).toContain('Results for G33 in TR')
    expect(host.textContent).toContain('For 3 occurrences, STEPBible lists this entry as an alternate identification.')
    expect(host.textContent).not.toContain('OLD FORM')
    expect(host.textContent).not.toContain('Reader Romans 16:25')
  })

  it('distinguishes common-word frequencies on one labeled scale across both grids and keeps zero separate from unknown', async () => {
    const books = [0, 0, 80, 110, 145, 160, 185, 225, 245, 285].map((n, i) => ({
      book: `book${i}`, name: `Book ${i}`, occurrences: n, verses: n, tagged: i ? 1000 : 0,
      chapters: [{ chapter: 1, occurrences: n, verses: n, tagged: i ? 1000 : 0 }]
    }))
    Object.assign(window.api, { getWordFrequency: async (q: WordFrequencyQuery) => ({ ...summary(q), books }),
      getWordFrequencyPassages: async () => [] })
    await act(async () => root.render(createElement(StudyFrequency, { id: 'G3588' })))
    for (const metric of ['rate', 'count']) {
      await change('Shade by', metric)
      const group = host.querySelector('[aria-label="Books in canonical order"]')!
      const buttons = [...group.querySelectorAll('button')]
      const levels = buttons.map(b => b.dataset.level)
      expect(levels.slice(0, 2)).toEqual(['unknown', '0'])
      expect(new Set(levels.slice(2)).size).toBeGreaterThanOrEqual(4)
      expect(host.querySelector('[aria-label="Color scale"]')?.textContent).toContain('No tagged words')
      await act(async () => buttons[4].click())
      const chapter = host.querySelector('[aria-label="Book 4 chapters"] button')!
      expect(chapter.getAttribute('data-level')).toBe(levels[4])
    }
  })

  it('distinguishes an edition zero, uncertain lexical coverage, and a failed request', async () => {
    const getWordFrequency = vi.fn(async (q: WordFrequencyQuery) => {
      if (q.id === 'G2') throw new Error('Database offline')
      const zero = summary(q)
      return { ...zero, forms: [], occurrences: 0, verses: 0, coverage: q.id === 'G1' ? 'partial' : 'complete',
        notice: q.id === 'G1' ? 'No linked source readings.' : 'TR has a recorded use.',
        books: zero.books.map(b => ({ ...b, occurrences: 0, verses: 0, chapters: b.chapters.map(c => ({ ...c, occurrences: 0, verses: 0 })) })) }
    })
    Object.assign(window.api, { getWordFrequency })
    await act(async () => root.render(createElement(StudyFrequency, { id: 'G1207' })))
    expect(host.textContent).toContain('0 occurrences')
    expect(host.textContent).toContain('TR has a recorded use.')
    expect(host.querySelectorAll('[aria-label="Books in canonical order"] button')).toHaveLength(2)
    await act(async () => root.render(createElement(StudyFrequency, { id: 'G1' })))
    expect(host.textContent).toContain('No confirmed occurrences')
    expect(host.querySelector('[aria-label="Books in canonical order"]')).toBeNull()
    await act(async () => root.render(createElement(StudyFrequency, { id: 'G2' })))
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Database offline')
    const before = getWordFrequency.mock.calls.length
    await click('[role="alert"] button')
    expect(getWordFrequency).toHaveBeenCalledTimes(before + 1)
  })

  it('opens the scholarly definition for a Hebrew entry with no classic Strong’s record and preserves Hebrew word boundaries', async () => {
    const getStrongs = vi.fn().mockRejectedValueOnce(new Error('Read error')).mockResolvedValue({ id: 'H9003', language: 'hebrew', lemma: 'בְּ', lexiconSource: 'STEP' })
    const getLexiconEntries = vi.fn().mockRejectedValueOnce(new Error('Lexicon offline')).mockResolvedValue([{
      lexicon: 'TBESH', name: 'BDB', entries: [{ headword: 'בְּ', body: 'A Hebrew preposition' }]
    }])
    Object.assign(window.api, { getStrongs, getLexiconEntries,
      getWordFrequency: async (q: WordFrequencyQuery) => ({ ...summary(q), language: 'Hebrew' }),
      getWordFrequencyPassages: async () => [{ ...passage, readerRef: null, tokens: [
        { text: 'בְּ', matching: true, spaceBefore: false }, { text: 'רֵאשִׁית', matching: false, spaceBefore: false },
        { text: 'בָּרָא', matching: false, spaceBefore: true }
      ] }] })
    await act(async () => root.render(createElement(LexiconCard, { id: 'H9003', inWords: true })))
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Read error')
    await click('[role="alert"] button')
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Lexicon offline')
    await click('[role="alert"] button')
    expect(host.textContent).toContain('A Hebrew preposition')
    expect([...host.querySelectorAll('button')].map(b => b.textContent)).not.toContain('Strong’s')
    await click('[aria-label="Word study tools"] button:last-child')
    expect(host.querySelector('p[dir="rtl"]')?.textContent).toBe('בְּרֵאשִׁית בָּרָא')
    expect(host.querySelector('mark')?.textContent).toBe('בְּ')
    expect(host.querySelector('[aria-label="Matching verses"] button')).toBeNull()
  })

  it('keeps the frequency controls out of the ordinary reader card', async () => {
    Object.assign(window.api, { getStrongs: async () => ({ id: 'G26', language: 'greek', lemma: 'ἀγάπη', occurrences: 0 }),
      getLexiconEntries: async () => [], getConcordance: async () => ({ translation: 'KJV', total: 0, hits: [] }) })
    await act(async () => root.render(createElement(LexiconCard, { id: 'G26' })))
    expect(host.textContent).toContain('Concordance')
    expect(host.textContent).not.toContain('Word frequency')
  })

  it('enables verified occurrences from the reader card and removes a selected ID independently of the presets', async () => {
    const coverage = vi.fn(async () => [{ translation: 'BSB', occurrences: 42 }])
    Object.assign(window.api, { getStrongs: async () => ({ id: 'G264', language: 'greek', lemma: 'ἁμαρτάνω', occurrences: 0 }),
      getSourceWordCoverage: coverage, getLexiconEntries: async () => [],
      getConcordance: async () => ({ translation: 'KJV', total: 0, hits: [] }) })
    useAppStore.setState({ sourceWordTerms: { G25: true } })
    await act(async () => root.render(createElement(LexiconCard, { id: 'G264' })))
    const check = host.querySelector<HTMLInputElement>('[aria-label="Restore in reader"] input')!
    expect(coverage).toHaveBeenCalledWith('G264')
    expect(host.textContent).toContain('BSB 42')
    expect(check.checked).toBe(false)
    await act(async () => check.click())
    expect(useAppStore.getState()).toMatchObject({ restoreSourceWords: true, sourceFormIds: ['G264'], sourceWordTerms: { G25: true } })
    const snapshot = useAppStore.persist.getOptions().partialize!(useAppStore.getState())
    expect(snapshot).toMatchObject({ sourceFormIds: ['G264'] })
    const merge = useAppStore.persist.getOptions().merge!
    expect(merge({ sourceFormIds: ['G0264', 'g264', 'ἁμαρτάνω', { G264: 'sin' }] }, useAppStore.getInitialState()).sourceFormIds).toEqual(['G264'])
    expect(merge({ replacements: { G264: 'ἁμαρτάνω' } }, useAppStore.getInitialState()).sourceFormIds).toEqual([])
    await act(async () => useAppStore.getState().toggleSourceWords())
    expect(check.checked).toBe(false)
    await act(async () => check.click())
    expect(useAppStore.getState().sourceFormIds).toEqual(['G264'])
    await act(async () => {
      useAppStore.getState().setSourceWordSettingsOpen(true)
      root.render(createElement(SourceWordSettings))
    })
    expect(host.textContent).toContain('G264ἁμαρτάνω')
    await click('[aria-label="Remove G264 from original forms"]')
    expect(useAppStore.getState()).toMatchObject({ restoreSourceWords: true, sourceFormIds: [], sourceWordTerms: { G25: true } })
  })

  it('requires verified coverage even for a lexicon entry with Strong’s matches, and preserves the fixed divine name', async () => {
    Object.assign(window.api, { getStrongs: async (id: string) => ({ id, language: 'hebrew', lemma: 'word', occurrences: 900 }),
      getSourceWordCoverage: async (id: string) => id === 'H3068' ? [{ translation: 'KJV', occurrences: 10 }] : [],
      getLexiconEntries: async () => [], getConcordance: async () => ({ translation: 'KJV', total: 0, hits: [] }) })
    await act(async () => root.render(createElement(LexiconCard, { id: 'H999' })))
    const checkbox = () => host.querySelector<HTMLInputElement>('[aria-label="Restore in reader"] input')!
    expect(checkbox().disabled).toBe(true)
    expect(host.textContent).toContain('No verified source forms')
    await act(async () => root.render(createElement(LexiconCard, { id: 'H3068' })))
    await act(async () => checkbox().click())
    expect(checkbox().checked).toBe(true)
    expect(useAppStore.getState()).toMatchObject({ restoreSourceWords: true, sourceFormIds: [], sourceWordTerms: { H3068: true, H3069: true } })
    await act(async () => checkbox().click())
    expect(useAppStore.getState().sourceWordTerms).toEqual({ H3068: false, H3069: false })
  })

  it('browses extended Hebrew headwords and opens their scholarly definitions in both Words and the study pane', async () => {
    useAppStore.getState().selectStrongs('H9003')
    const browseLexicon = vi.fn(async () => ({ total: 2, entries: [
      { id: 'H9003', lemma: 'בְּ', gloss: 'in' }, { id: 'H9004', lemma: 'כְּ', gloss: 'as' }
    ] }))
    Object.assign(window.api, { browseLexicon,
      getStrongs: async (id: string) => ({ id, lemma: id === 'H9003' ? 'בְּ' : 'כְּ', language: 'hebrew', occurrences: 0, lexiconSource: 'STEP' }),
      getLexiconEntries: async (id: string) => [{ lexicon: 'TBESH', name: 'BDB', entries: [{ body: `Definition of ${id}` }] }],
      getConcordance: async () => ({ translation: 'KJV', total: 0, hits: [] }) })
    vi.useFakeTimers()
    try {
      await act(async () => root.render(createElement(WordsView)))
      await act(async () => { await vi.advanceTimersByTimeAsync(250) })
      expect(browseLexicon).toHaveBeenCalledWith(expect.objectContaining({ language: 'hebrew' }))
      const row = [...host.querySelectorAll('button')].find(b => b.textContent?.startsWith('H9004'))!
      await act(async () => row.click())
      expect(host.textContent).toContain('Definition of H9004')
      expect(row.getAttribute('aria-pressed')).toBe('true')
      await act(async () => root.render(createElement(LexiconCard, { id: 'H9004' })))
      expect(host.textContent).toContain('Definition of H9004')
      expect(host.textContent).not.toContain('Word frequency')
    } finally {
      vi.useRealTimers()
    }
  })

  it('follows the H02 cross-reference in G5 (Abba) to Aramaic H2 and back using the study pane', async () => {
    useAppStore.getState().selectStrongs('G5')
    const getStrongs = vi.fn(async (id: string) => {
      if (id === 'G5') return { id, language: 'greek', lemma: 'Ἀββᾶ', occurrences: 3, definition: 'father as a vocative — of Chaldee origin (H02)' }
      if (id === 'H2') return { id, language: 'hebrew', sourceLanguage: 'Aramaic', lemma: 'אַב', occurrences: 9, definition: 'father' }
      return null
    })
    Object.assign(window.api, { getStrongs, getLexiconEntries: async () => [],
      getConcordance: async () => ({ translation: 'KJV', total: 0, hits: [] }) })
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    try {
      await act(async () => root.render(createElement(StudyPanel)))
      const link = [...host.querySelectorAll('button')].find(b => b.textContent === 'H02')!
      await act(async () => link.click())
      expect(getStrongs).toHaveBeenLastCalledWith('H2')
      expect(useAppStore.getState()).toMatchObject({ selectedStrongs: 'H2', strongsBack: ['G5'] })
      expect(host.textContent).toContain('Aramaic')
      expect(host.textContent).toContain('אַב')
      await click('button[title="Back"]')
      expect(getStrongs).toHaveBeenLastCalledWith('G5')
      expect(useAppStore.getState()).toMatchObject({ selectedStrongs: 'G5', strongsForward: ['H2'] })
      expect(host.textContent).toContain('Ἀββᾶ')
    } finally {
      canvas.mockRestore()
      vi.unstubAllGlobals()
    }
  })
})
