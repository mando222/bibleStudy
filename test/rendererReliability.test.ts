// @vitest-environment jsdom
import { act, createElement, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LearnView from '../src/renderer/src/components/LearnView'
import LearnReading from '../src/renderer/src/components/LearnReading'
import ReadingPanel from '../src/renderer/src/components/ReadingPanel'
import WordsView from '../src/renderer/src/components/WordsView'
import LexiconCard from '../src/renderer/src/components/LexiconCard'
import VersePopover from '../src/renderer/src/components/VersePopover'
import SearchPanel from '../src/renderer/src/components/SearchPanel'
import InterlinearReader from '../src/renderer/src/components/InterlinearReader'
import NotebookPanel from '../src/renderer/src/components/NotebookPanel'
import CrossRefsPanel from '../src/renderer/src/components/CrossRefsPanel'
import HistoryPanel from '../src/renderer/src/components/HistoryPanel'
import { parsePosition, readPosition, readerViewKey, savePosition } from '../src/renderer/src/lib/readingPosition'
import { publishedSelection } from '../src/renderer/src/lib/scriptureSelection'
import { useChapter } from '../src/renderer/src/hooks/useChapter'
import { useHighlights, useNotes } from '../src/renderer/src/hooks/useUserData'
import { useNotebookDocument } from '../src/renderer/src/hooks/useNotebookDocument'
import { useVerseNavigation } from '../src/renderer/src/hooks/useVerseNavigation'
import { readingEdition, useAppStore } from '../src/renderer/src/store/useAppStore'
import type { Translation, VerseRef } from '../src/shared/types'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value(this: HTMLDialogElement) { this.open = true } },
    close: { configurable: true, value(this: HTMLDialogElement) { this.open = false } }
  })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  useAppStore.persist.setOptions({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } })
  useAppStore.setState(useAppStore.getInitialState(), true)
  Object.assign(window, { api: {}, notebook: {} })
})
afterEach(async () => {
  await act(async () => root.unmount())
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  vi.unstubAllGlobals()
  host.remove()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function change(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  await act(async () => {
    const prototype = Object.getPrototypeOf(element)
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })
}
async function advance(ms = 300) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
}

describe('reader position', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value) })
  })

  it('bookmarks the scrolled verse and restores it after the reader remounts', async () => {
    const addBookmark = vi.fn().mockResolvedValue(undefined)
    const rows = [1, 23, 24].map(verse => ({ verse, text: 'Verse ' + verse, tokens: [] }))
    Object.assign(window.api, { getChapter: async (ref: VerseRef) => ({ ...ref, verses: rows }),
      listHighlights: async () => [], listNotes: async () => [], listHistory: async () => [],
      listBookmarks: async () => [], addBookmark })
    const page = () => createElement('main', null, createElement(ReadingPanel), createElement(HistoryPanel))
    await act(async () => root.render(page()))
    const col = host.querySelector<HTMLElement>('[data-reader-scroll]')!
    Object.defineProperty(col, 'clientHeight', { value: 400 })
    col.getBoundingClientRect = () => new DOMRect(0, 10, 300, 400)
    for (const row of col.querySelectorAll<HTMLElement>('[data-verse]')) {
      const top = Number(row.dataset.verse) === 1 ? -180 : Number(row.dataset.verse) === 23 ? -25 : 150
      row.getBoundingClientRect = () => new DOMRect(0, top, 300, 100)
    }
    col.scrollTop = 1200
    await act(async () => col.dispatchEvent(new Event('scroll')))
    expect(readPosition()).toMatchObject({ translation: 'KJV', book: 'John', chapter: 1, verse: 23, scroll: 1200 })
    await act(async () => [...host.querySelectorAll('button')].find(button => button.title === 'History & bookmarks')!.click())
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Bookmark')!.click())
    expect(addBookmark).toHaveBeenCalledWith(expect.objectContaining({ book: 'John', chapter: 1, verse: 23, name: 'John 1:23' }))
    await act(async () => root.render(null))
    await act(async () => root.render(page()))
    expect(host.querySelector<HTMLElement>('[data-reader-scroll]')!.dataset.readerAnchor).toBe('23')
  })

  it('reopens mapped columns in the chapter reached by scrolling into a split passage', async () => {
    useAppStore.setState({ primary: 'WEB', referenceEdition: 'WEB', book: 'Rom', chapter: 14, parallels: ['WEB', 'KJV'] })
    savePosition({ book: 'Rom', chapter: 16, verse: 25, translation: 'KJV', interlinear: false,
      scroll: null, viewKey: readerViewKey(useAppStore.getState()) })
    Object.assign(window.api, { getChapter: async (ref: VerseRef) => ({ ...ref,
      verses: [{ verse: ref.translation === 'KJV' ? 25 : 24, text: 'Verse', tokens: [] }] }),
      listHighlights: async () => [], listNotes: async () => [] })
    await act(async () => root.render(createElement(ReadingPanel)))
    expect(host.querySelector<HTMLElement>('[data-reader-scroll="WEB"]')!.dataset.readerChapter).toBe('14')
    const kjv = host.querySelector<HTMLElement>('[data-reader-scroll="KJV"]')!
    expect(kjv.dataset.readerChapter).toBe('16')
    expect(kjv.dataset.readerAnchor).toBe('25')
  })

  it('restores the original-language verse after the asynchronous interlinear is loaded', async () => {
    useAppStore.setState({ book: 'Gen', chapter: 1, interlinear: true })
    const viewKey = readerViewKey(useAppStore.getState())
    savePosition({ translation: 'MT', book: 'Gen', chapter: 1, verse: 22, interlinear: true, scroll: 4520, viewKey })
    const pending = deferred<any>()
    Object.assign(window.api, { listEditions: async () => [{ id: 'MT', name: 'Masoretic', testament: 'OT' }],
      getInterlinear: () => pending.promise })
    await act(async () => root.render(createElement(ReadingPanel)))
    const interlinear = host.querySelector<HTMLElement>('[data-interlinear-reader]')!
    expect(interlinear.dataset.readerAnchor).toBeUndefined()
    await act(async () => pending.resolve({ book: 'Gen', chapter: 1, edition: 'MT', direction: 'rtl',
      verses: [{ verse: 22, tokens: [] }] }))
    expect(interlinear.dataset.readerAnchor).toBe('22')
  })

  it.each(['KJV', 'NA', 'imp_sparse'])('scrolls through the recorded chapters in both directions in %s', async edition => {
    const interlinear = edition === 'NA'
    const parallels = edition === 'imp_sparse' ? ['KJV', edition] : ['KJV']
    const refs = [{ book: 'John', chapter: 1 }, { book: 'John', chapter: 3 }, { book: 'Acts', chapter: 1 }]
    const listReadingChapters = vi.fn(async () => [...refs].reverse())
    Object.assign(window.api, { listReadingChapters, listHighlights: async () => [], listNotes: async () => [],
      listEditions: async () => [{ id: 'NA', testament: 'NT', name: 'Critical text' }],
      getChapter: async (ref: VerseRef) => ({ ...ref, verses: [{ verse: 1, text: 'Verse ' + ref.chapter, tokens: [] }] }),
      getInterlinear: async (book: string, chapter: number) => ({ book, chapter, direction: 'ltr', verses: [{ verse: 1, tokens: [] }] }) })
    useAppStore.setState({ book: 'John', chapter: 1, primary: 'KJV', parallels, interlinear })

    // Each chapter occupies one viewport. Layout in jsdom has no native dimensions.
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function(this: HTMLElement) {
      return this.hasAttribute('data-flow-chapter') ? 400 : 0
    })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
      const pane = this.closest<HTMLElement>('[data-reader-scroll], [data-interlinear-reader]')
      const block = this.closest('[data-flow-chapter]')
      if (pane && block) {
        const index = [...pane.querySelectorAll('[data-flow-chapter]')].indexOf(block)
        return new DOMRect(0, index * 400 - pane.scrollTop, 300, 400)
      }
      return new DOMRect(0, 0, 300, 400)
    })
    await act(async () => root.render(createElement(ReadingPanel)))
    expect(listReadingChapters).toHaveBeenCalledWith(edition, interlinear)
    const el = host.querySelector<HTMLElement>(interlinear ? '[data-interlinear-reader]' : `[data-reader-scroll="${edition}"]`)!
    Object.defineProperty(el, 'clientHeight', { value: 400 })
    async function scroll(y: number) {
      await act(async () => {
        el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: y - el.scrollTop }))
        el.scrollTop = y
        el.dispatchEvent(new Event('scroll'))
      })
    }
    await scroll(10)
    expect([...el.querySelectorAll('[data-flow-chapter]')].map(p => p.getAttribute('data-flow-chapter'))).toEqual(['John/1', 'John/3'])
    await scroll(425)
    expect(useAppStore.getState()).toMatchObject({ book: 'John', chapter: 3, referenceEdition: edition })
    expect(readPosition()).toMatchObject({ book: 'John', chapter: 3, verse: 1, scroll: 25, translation: edition })
    expect(el.querySelector('[data-flow-active]')?.getAttribute('data-flow-chapter')).toBe('John/3')
    await scroll(825)
    expect(useAppStore.getState()).toMatchObject({ book: 'Acts', chapter: 1 })
    expect(el.scrollTop).toBe(425)
    if (edition === 'imp_sparse') expect(host.querySelector<HTMLElement>('[data-reader-scroll="KJV"]')?.dataset.readerBook).toBe('John')
    await scroll(380)
    expect(useAppStore.getState()).toMatchObject({ book: 'John', chapter: 3 })
    expect(readPosition()).toMatchObject({ book: 'John', chapter: 3, scroll: 380 })
  })

  it('keeps a verse-zero anchor in older saved positions', () => {
    expect(parsePosition({ book: 'Ps', chapter: 3, verse: 0, translation: 'BSB' })).toMatchObject({ verse: 0, scroll: null, interlinear: false })
  })
})

describe('search request lifecycle', () => {
  it('ignores older results, including a request completed after the input is cleared', async () => {
    const old = deferred<any>()
    const latest = deferred<any>()
    const search = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise)
    Object.assign(window.api, { search })
    await act(async () => root.render(createElement(SearchPanel)))
    const input = host.querySelector('input')!
    await change(input, 'love')
    await advance()
    await change(input, 'peace')
    await advance()
    await act(async () => latest.resolve({ total: 1, hits: [{ book: 'John', bookName: 'John', chapter: 1, verse: 1, snippet: 'Latest peace result' }] }))
    expect(host.textContent).toContain('Latest peace result')
    await change(input, '')
    await act(async () => old.resolve({ total: 1, hits: [{ book: 'John', bookName: 'John', chapter: 1, verse: 2, snippet: 'Outdated love result' }] }))
    expect(host.textContent).not.toContain('Outdated love result')
    expect(host.textContent).not.toContain('Searching…')
    expect(host.textContent).toContain('Search the whole KJV')
  })

  it('shows a search error and retries the same query', async () => {
    const search = vi.fn().mockRejectedValueOnce(new Error('Database unavailable')).mockResolvedValue({ total: 0, hits: [] })
    Object.assign(window.api, { search })
    await act(async () => root.render(createElement(SearchPanel)))
    await change(host.querySelector('input')!, 'love')
    await advance()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Database unavailable')
    await act(async () => host.querySelector<HTMLButtonElement>('[role="alert"] button')!.click())
    await advance()
    expect(search).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain('No results')
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it('uses the global Greek edition in translation view and the selected edition while reading interlinear', async () => {
    const state = useAppStore.getState()
    state.setPreferredTextOrder({ ...state.preferredTextOrder, nt: ['TR', 'NA', 'BYZ'] })
    state.setInterlinearEdition('BYZ')
    const search = vi.fn().mockResolvedValue({ total: 0, hits: [] })
    Object.assign(window.api, { search })
    await act(async () => root.render(createElement(SearchPanel)))
    await change(host.querySelector('input')!, 'λόγος')
    await advance()
    expect(search.mock.lastCall?.[0]).toMatchObject({ greekEdition: 'TR' })
    await act(async () => state.toggleInterlinear())
    await advance()
    expect(search.mock.lastCall?.[0]).toMatchObject({ greekEdition: 'BYZ' })
  })
})

describe('passage navigation', () => {
  it('discards cross-references for a verse that is no longer selected', async () => {
    const old = deferred<any>()
    const current = deferred<any>()
    useAppStore.setState({ activeVerse: 1 })
    Object.assign(window.api, { getCrossReferences: vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise) })
    await act(async () => root.render(createElement(CrossRefsPanel)))
    await act(async () => useAppStore.getState().setActiveVerse(2))
    await act(async () => current.resolve([]))
    await act(async () => old.resolve([{ ref: 'Gen.1.1' }]))
    expect(host.textContent).toContain('John 1:2')
    expect(host.textContent).toContain('No cross-references')
    expect(host.textContent).not.toContain('Genesis')
  })

  it('keeps a jump pending until the new chapter arrives and resets active verse on chapter navigation', async () => {
    const next = deferred<any>()
    Object.assign(window.api, {
      getChapter: vi.fn().mockResolvedValueOnce({ verses: [{ verse: 16 }], book: 'John', chapter: 1 }).mockReturnValue(next.promise)
    })
    const scroll = vi.fn()
    HTMLElement.prototype.scrollIntoView = scroll
    function Reader({ chapter }: { chapter: number }) {
      const { data, loading } = useChapter('KJV', 'John', chapter)
      const container = useRef<HTMLDivElement>(null)
      useVerseNavigation(container, { translation: 'KJV', book: 'John', chapter }, !loading && !!data)
      return createElement('div', { ref: container }, data?.verses.map((v) => createElement('div', { key: v.verse, 'data-verse': v.verse }, `${chapter}:${v.verse}`)))
    }
    await act(async () => root.render(createElement(Reader, { chapter: 1 })))
    await act(async () => {
      useAppStore.getState().goToVerse('John', 3, 16)
      root.render(createElement(Reader, { chapter: 3 }))
    })
    expect(scroll).not.toHaveBeenCalled()
    expect(useAppStore.getState().scrollToVerse).toBe(16)
    expect(useAppStore.getState().activeVerse).toBe(16)
    await act(async () => next.resolve({ verses: [{ verse: 16 }], book: 'John', chapter: 3 }))
    expect(scroll).toHaveBeenCalledOnce()
    expect(useAppStore.getState().scrollToVerse).toBeNull()
    await act(async () => useAppStore.getState().goTo('Gen', 1))
    expect(useAppStore.getState().activeVerse).toBeNull()
  })

  it('never displays highlights or notes from the previous chapter while loading', async () => {
    const pending = new Promise(() => {})
    Object.assign(window.api, {
      listHighlights: vi.fn().mockResolvedValueOnce([{ verse: 1, startToken: null }]).mockReturnValue(pending),
      listNotes: vi.fn().mockResolvedValueOnce([{ book: 'John', chapter: 1, verse: 1, body: 'Old note' }]).mockReturnValue(pending)
    })
    let value: any
    function Annotations({ chapter }: { chapter: number }) {
      value = { highlights: useHighlights('KJV', 'John', chapter), notes: useNotes('John', chapter).notes }
      return null
    }
    await act(async () => root.render(createElement(Annotations, { chapter: 1 })))
    expect(value.highlights.size).toBe(1)
    expect(value.notes.length).toBe(1)
    await act(async () => root.render(createElement(Annotations, { chapter: 2 })))
    expect(value.highlights.size).toBe(0)
    expect(value.notes).toEqual([])
  })

  it('renders a publisher-linked translation span and honors verse jumps in interlinear mode', async () => {
    const scroll = vi.fn()
    HTMLElement.prototype.scrollIntoView = scroll
    useAppStore.setState({
      interlinearStack: ['BSB'],
      translations: [{ id: 'BSB', abbrev: 'BSB', name: 'Berean Standard Bible', language: 'eng', hasStrongs: true } as any]
    })
    useAppStore.getState().goToVerse('John', 3, 16)
    Object.assign(window.api, {
      listEditions: async () => [{ id: 'NA', name: 'Critical', testament: 'NT' }],
      getInterlinear: async () => ({ direction: 'ltr', verses: [{ verse: 16, tokens: [{ position: 1, surface: 'gloss', lemma: 'λόγος', strongs: 'G3056', aligned: { BSB: 'Aligned BSB text' } }] }] })
    })
    await act(async () => root.render(createElement(InterlinearReader, { book: 'John', chapter: 3 })))
    expect(host.textContent).toContain('Aligned BSB text')
    expect(scroll).toHaveBeenCalledOnce()
    expect(useAppStore.getState().scrollToVerse).toBeNull()
  })

  it('follows the global order in automatic mode and keeps explicit editions until released', async () => {
    const state = useAppStore.getState()
    state.setPreferredTextOrder({ ...state.preferredTextOrder, nt: ['TR', 'NA', 'BYZ'], ot: ['LXX', 'MT'] })
    const editions = ['TR', 'BYZ', 'MT', 'LXX'].map(id => ({ id, name: id,
      testament: ['MT', 'LXX'].includes(id) ? 'OT' : 'NT' }))
    const getInterlinear = vi.fn(async (book, chapter, edition) => ({
      book, chapter, edition, direction: 'ltr', verses: [{ verse: 1, tokens: [] }]
    }))
    Object.assign(window.api, { listEditions: async () => editions, getInterlinear })
    state.toggleInterlinear()
    await act(async () => root.render(createElement(InterlinearReader, { book: 'John', chapter: 1 })))
    const select = host.querySelector<HTMLSelectElement>('[aria-label="Interlinear base text"]')!
    expect(select.value).toBe('')
    expect(getInterlinear.mock.lastCall?.slice(0, 3)).toEqual(['John', 1, 'TR'])
    await change(select, 'BYZ')
    await act(async () => state.setPreferredTextOrder({ ...useAppStore.getState().preferredTextOrder, nt: ['NA', 'TR', 'BYZ'] }))
    expect(select.value).toBe('BYZ')
    expect(readingEdition(useAppStore.getState())).toBe('BYZ')
    await change(select, '')
    expect(getInterlinear.mock.lastCall?.slice(0, 3)).toEqual(['John', 1, 'TR']) // NA is unavailable
    await change(select, 'TR')
    await act(async () => {
      state.focusVerse('Ps', 51, 1, 'BSB')
      root.render(createElement(InterlinearReader, { book: 'Ps', chapter: 51 }))
    })
    expect(readingEdition(useAppStore.getState())).toBe('LXX')
    expect(getInterlinear.mock.lastCall?.slice(0, 3)).toEqual(['Ps', 50, 'LXX'])
    expect(select.value).toBe('')
    expect(host.querySelector('[role="status"]')?.textContent).toMatch(/Psalms? 50:3 in LXX/)
    await act(async () => state.toggleInterlinear())
    expect(readingEdition(useAppStore.getState())).toBe('KJV')
  })

  it('shows the Swete Greek surface, provenance and source gaps in both automatic and explicit modes', async () => {
    const state = useAppStore.getState()
    state.setPreferredTextOrder({ ...state.preferredTextOrder, ot: ['LXX', 'MT'] })
    useAppStore.setState({ interlinearParses: true })
    const getInterlinear = vi.fn(async () => ({ book: 'Dan', chapter: 1, edition: 'LXX', direction: 'ltr', verses: [
      { verse: 1, tokens: [{ position: 0, lemma: 'ἐποίησεν', translit: 'epoiēsen', surface: 'committed', strongs: 'G4160' }] },
      { verse: 2, tokens: [], sourceIssue: 'The source includes editorial notes.' }
    ] }))
    Object.assign(window.api, { listEditions: async () => [{ id: 'LXX', name: 'Swete', testament: 'OT' }], getInterlinear })
    await act(async () => root.render(createElement(InterlinearReader, { book: 'Dan', chapter: 1 })))
    const select = host.querySelector<HTMLSelectElement>('[aria-label="Interlinear base text"]')!
    expect(select.value).toBe('')
    expect(host.textContent).toContain('Theodotion')
    expect(host.textContent).toContain('ἐποίησεν')
    expect(host.textContent).toContain('epoiēsen')
    expect(host.textContent).toContain('editorial notes')
    expect(host.textContent).not.toMatch(/committed|G4160|All parses|Best guess/)
    expect(getInterlinear).toHaveBeenCalledWith('Dan', 1, 'LXX', expect.any(Array), false)
    await change(select, 'LXX')
    expect(select.value).toBe('LXX')
    expect(host.textContent).not.toMatch(/committed|G4160|All parses|Best guess/)
  })
})

describe('notebook autosave', () => {
  let doc: ReturnType<typeof useNotebookDocument>
  function Editor({ name }: { name: string }) {
    doc = useNotebookDocument(name, true)
    return null
  }

  it('ignores an earlier file read that arrives after the selected file', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    Object.assign(window.notebook, { read: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise), write: vi.fn() })
    await act(async () => root.render(createElement(Editor, { name: 'first.md' })))
    await act(async () => root.render(createElement(Editor, { name: 'second.md' })))
    await act(async () => second.resolve('Second note'))
    await act(async () => first.resolve('First note'))
    expect(doc.content).toBe('Second note')
    await advance(700)
    expect(window.notebook.write).not.toHaveBeenCalled()
  })

  it('serializes writes so an older save cannot replace newer typing', async () => {
    const firstWrite = deferred<any>()
    const write = vi.fn().mockReturnValueOnce(firstWrite.promise).mockResolvedValue({ name: 'note.md' })
    Object.assign(window.notebook, { read: async () => 'Original', write })
    await act(async () => root.render(createElement(Editor, { name: 'note.md' })))
    await act(async () => doc.edit('First edit'))
    await advance(600)
    await act(async () => doc.edit('Latest edit'))
    await advance(600)
    expect(write).toHaveBeenCalledTimes(1)
    await act(async () => firstWrite.resolve({ name: 'note.md' }))
    expect(write.mock.calls).toEqual([['note.md', 'First edit'], ['note.md', 'Latest edit']])
    expect(doc.status).toBe('Saved')
  })

  it('finishes an in-flight save and a reverted edit before closing the window', async () => {
    const firstWrite = deferred<any>()
    const write = vi.fn().mockReturnValueOnce(firstWrite.promise).mockResolvedValue({ name: 'note.md' })
    const close = vi.spyOn(window, 'close').mockImplementation(() => {})
    Object.assign(window.notebook, { read: async () => 'Original', write })
    await act(async () => root.render(createElement(Editor, { name: 'note.md' })))
    await act(async () => doc.edit('Temporary edit'))
    await advance(600)
    await act(async () => doc.edit('Original'))
    const unload = new Event('beforeunload', { cancelable: true })
    await act(async () => { window.dispatchEvent(unload) })
    expect(unload.defaultPrevented).toBe(true)
    expect(close).not.toHaveBeenCalled()
    await act(async () => firstWrite.resolve({ name: 'note.md' }))
    expect(write).toHaveBeenLastCalledWith('note.md', 'Original')
    expect(close).toHaveBeenCalledOnce()
  })

  it('keeps the window open when its final save fails', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {})
    Object.assign(window.notebook, { read: async () => 'Original', write: vi.fn().mockRejectedValue(new Error('Disk full')) })
    await act(async () => root.render(createElement(Editor, { name: 'note.md' })))
    await act(async () => doc.edit('Keep my draft'))
    const unload = new Event('beforeunload', { cancelable: true })
    await act(async () => { window.dispatchEvent(unload) })
    expect(unload.defaultPrevented).toBe(true)
    expect(close).not.toHaveBeenCalled()
    expect(doc.content).toBe('Keep my draft')
    expect(doc.error).toBe('Disk full')
  })

  it('flushes an edit before switching files; a failed save retains the editable draft', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('Disk full')).mockResolvedValue({ name: 'first.md' })
    Object.assign(window.notebook, {
      read: async (name: string) => name === 'first.md' ? 'Original' : 'Second note',
      list: async () => [{ name: 'first.md' }, { name: 'second.md' }],
      getFolder: async () => '/test/notes', write
    })
    useAppStore.setState({ activeNotebookFile: 'first.md' })
    await act(async () => root.render(createElement(NotebookPanel)))
    await change(host.querySelector('textarea')!, 'Draft to preserve')
    await change(host.querySelector('select')!, 'second.md')
    expect(useAppStore.getState().activeNotebookFile).toBe('first.md')
    expect(host.querySelector('textarea')!.value).toBe('Draft to preserve')
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Disk full')
    await change(host.querySelector('select')!, 'second.md')
    expect(write).toHaveBeenLastCalledWith('first.md', 'Draft to preserve')
    expect(useAppStore.getState().activeNotebookFile).toBe('second.md')
    expect(host.querySelector('textarea')!.value).toBe('Second note')
  })
})


function clickButton(label: string) {
  const button = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)
  if (!button) throw new Error(`Missing button ${label}`)
  return act(async () => button.click())
}

describe('study navigation across pages and editions', () => {
  it('opens the Greek edition from the second search page and resets the page on a new query', async () => {
    const hit = { book: 'John', bookName: 'John', chapter: 3, verse: 16, translation: 'TR', edition: 'TR', snippet: 'Greek match' }
    const search = vi.fn().mockImplementation(async ({ offset }) => ({
      total: 151, hits: offset ? [hit] : [{ ...hit, snippet: 'First match' }]
    }))
    Object.assign(window.api, { search })
    await act(async () => root.render(createElement(SearchPanel)))
    await change(host.querySelector('input')!, 'θεός')
    await advance()
    await clickButton('Next')
    expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 150 }))
    await act(async () => host.querySelector<HTMLButtonElement>('li button')!.click())
    expect(useAppStore.getState()).toMatchObject({ interlinear: true, interlinearEdition: 'TR', referenceEdition: 'TR', scrollToVerse: 16 })
    await change(host.querySelector('input')!, 'λόγος')
    await advance()
    expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'λόγος', offset: 0 }))
  })

  it('pages through the word browser and the concordance', async () => {
    const browseLexicon = vi.fn().mockImplementation(async ({ offset }) => ({
      total: 251, entries: [{ id: offset ? 'G251' : 'G1', lemma: offset ? 'Later word' : 'First word' }]
    }))
    const getConcordance = vi.fn().mockImplementation(async (_id, { offset }) => ({
      total: 401, translation: 'KJV', hits: [{ book: 'John', bookName: 'John', chapter: 1, verse: offset ? 2 : 1, snippet: offset ? 'Later occurrence' : 'First occurrence' }]
    }))
    Object.assign(window.api, { browseLexicon, getConcordance,
      getStrongs: async () => ({ id: 'G251', language: 'greek', occurrences: 401 }), getLexiconEntries: async () => [] })
    await act(async () => root.render(createElement(WordsView)))
    await advance()
    await clickButton('Next')
    expect(browseLexicon).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 250 }))
    expect(host.textContent).toContain('Later word')
    await act(async () => root.render(createElement(LexiconCard, { id: 'G251' })))
    await clickButton('Next')
    expect(getConcordance).toHaveBeenLastCalledWith('G251', expect.objectContaining({ offset: 400 }))
    expect(host.textContent).toContain('Later occurrence')
  })

  it('maps parallel text, cross-references and notes for the second half of LXX Psalm 9', async () => {
    const getChapter = vi.fn().mockImplementation(async (ref) => ({
      ...ref, direction: 'ltr', verses: [{ verse: ref.translation === 'LXX' ? 22 : 1, text: ref.translation, tokens: null }]
    }))
    const note = { id: 7, book: 'Ps', chapter: 10, verse: 1, body: 'A shared note' }
    const getCrossReferences = vi.fn().mockResolvedValue([])
    const saveNote = vi.fn().mockResolvedValue(note)
    Object.assign(window.api, { getChapter, getCrossReferences, saveNote, listHighlights: async () => [],
      listNotes: async (ref: { chapter: number }) => ref.chapter === 10 ? [note] : [] })
    HTMLElement.prototype.scrollIntoView = vi.fn()
    useAppStore.setState({ parallels: ['KJV', 'LXX'] })
    useAppStore.getState().goToVerse('Ps', 10, 1)
    await act(async () => root.render(createElement('div', {}, createElement(ReadingPanel), createElement(CrossRefsPanel))))
    expect(getChapter).toHaveBeenCalledWith({ translation: 'LXX', book: 'Ps', chapter: 9 })
    expect(getChapter).toHaveBeenCalledWith({ translation: 'KJV', book: 'Ps', chapter: 10 })
    const word = host.querySelector<HTMLElement>('[data-verse="22"] [title="Highlight or add a note"]')!
    await act(async () => word.click())
    expect(host.querySelector('textarea')!.value).toBe('A shared note')
    expect(host.textContent).toContain('Psalms 9:22 (LXX)')
    expect(getCrossReferences).toHaveBeenLastCalledWith('Ps', 10, 1)
    await change(host.querySelector('textarea')!, 'Revised')
    await clickButton('Save note')
    expect(saveNote).toHaveBeenLastCalledWith({ id: 7, book: 'Ps', chapter: 10, verse: 1, body: 'Revised' })
  })

  it('opens unmapped LXX references natively and explains unavailable equivalents', async () => {
    const getChapter = vi.fn().mockResolvedValue({ verses: [{ verse: 1, text: 'Native heading' }] })
    Object.assign(window.api, { getChapter, listHighlights: async () => [], listNotes: async () => [] })
    HTMLElement.prototype.scrollIntoView = vi.fn()
    useAppStore.setState({ parallels: ['KJV', 'BSB'] })
    useAppStore.getState().openSearchHit({ translation: 'LXX', book: 'Ps', bookName: 'Psalms', chapter: 151, verse: 1, snippet: 'Native heading' })
    await act(async () => root.render(createElement(ReadingPanel)))
    expect(getChapter).toHaveBeenCalledWith({ translation: 'LXX', book: 'Ps', chapter: 151 })
    expect(getChapter).not.toHaveBeenCalledWith({ translation: 'BSB', book: 'Ps', chapter: 151 })
    expect(host.textContent).toContain('No verified equivalent')
  })

  it.each([
    ['WEB', 'Rom', 14, 24, 16, 25], ['GNV', 'Dan', 3, 31, 4, 1]
  ] as const)('creates, reopens and edits one shared note from %s %s %i:%i', async (edition, book, chapter, verse, canonicalChapter, canonicalVerse) => {
    let stored: { id: number; book: string; chapter: number; verse: number; body: string } | undefined
    const saveNote = vi.fn(async (input) => { stored = { ...input, id: 5 }; return stored })
    Object.assign(window.api, { saveNote, getChapter: async () => ({ verses: [{ verse, text: 'Native verse' }] }),
      listHighlights: async () => [], listNotes: async (ref: { chapter: number }) => stored?.chapter === ref.chapter ? [stored] : [] })
    useAppStore.setState({ primary: edition, parallels: [edition], referenceEdition: edition, book, chapter })
    await act(async () => root.render(createElement(ReadingPanel)))
    const open = () => act(async () => host.querySelector<HTMLButtonElement>('[data-verse-action]')!.click())
    await open()
    await clickButton('Add a note')
    await change(host.querySelector('textarea')!, 'First')
    await clickButton('Save note')
    expect(stored).toEqual({ id: 5, book, chapter: canonicalChapter, verse: canonicalVerse, body: 'First' })
    await act(async () => root.render(null))
    await act(async () => root.render(createElement(ReadingPanel)))
    await open()
    expect(host.querySelector('textarea')?.value).toBe('First')
    await change(host.querySelector('textarea')!, 'Revised')
    await clickButton('Save note')
    expect(saveNote).toHaveBeenLastCalledWith({ id: 5, book, chapter: canonicalChapter, verse: canonicalVerse, body: 'Revised' })
  })

  it('reads, copies, highlights and scrolls an independent import without offering shared notes, bookmarks or references', async () => {
    const imported = 'imp_test'
    const printed = 'I am the Α and the Ω.'
    const saveHighlight = vi.fn()
    const getCrossReferences = vi.fn(async () => [])
    Object.assign(window.api, { getChapter: async () => ({ verses: [{ verse: 16, text: printed }, { verse: 17, text: 'Second verse' }] }),
      listHighlights: async () => [], listNotes: async () => [], saveHighlight, getCrossReferences,
      listBookmarks: async () => [], listHistory: async () => [] })
    HTMLElement.prototype.scrollIntoView = vi.fn()
    useAppStore.setState({ primary: 'BSB', parallels: ['BSB', 'KJV', imported], referenceEdition: 'BSB', book: 'Phil', chapter: 1 })
    await act(async () => root.render(createElement('div', {}, createElement(ReadingPanel), createElement(CrossRefsPanel), createElement(HistoryPanel))))
    const col = (id: string) => host.querySelector<HTMLElement>(`[data-reader-scroll="${id}"]`)!
    expect(col(imported).parentElement?.textContent).toContain('Independent scroll')
    const passage = col(imported).querySelector<HTMLElement>('[data-scripture-passage]')!
    const range = document.createRange()
    range.selectNodeContents(passage.querySelector('[data-scripture-part]')!)
    expect(publishedSelection(passage, range)?.text).toBe(printed)
    const rect = (y: number) => ({ top: y, bottom: y + 50 } as DOMRect)
    for (const id of ['BSB', 'KJV', imported]) {
      for (const row of col(id).querySelectorAll<HTMLElement>('[data-verse]')) {
        row.getBoundingClientRect = () => rect(row.dataset.verse === '16' ? 0 : 100)
      }
    }
    await act(async () => {
      col('BSB').dispatchEvent(new WheelEvent('wheel', { bubbles: true }))
      col('BSB').dispatchEvent(new Event('scroll'))
    })
    expect(col('KJV').scrollTop).toBe(100)
    expect(col(imported).scrollTop).toBe(0)
    await act(async () => {
      col(imported).dispatchEvent(new WheelEvent('wheel', { bubbles: true }))
      col(imported).dispatchEvent(new Event('scroll'))
    })
    expect(col('KJV').scrollTop).toBe(100)
    await act(async () => col(imported).querySelector<HTMLButtonElement>('[data-verse-action]')!.click())
    expect(host.textContent).toContain('No verified reference for shared verse notes')
    expect(host.textContent).toContain('No verified cross-reference')
    expect(getCrossReferences).not.toHaveBeenCalled()
    await act(async () => host.querySelector<HTMLButtonElement>('[title="yellow"]')!.click())
    expect(saveHighlight).toHaveBeenCalledWith(expect.objectContaining({ translation: imported, book: 'Phil', chapter: 1, verse: 16 }))
    await act(async () => [...host.querySelectorAll('button')].find(button => button.title === 'History & bookmarks')!.click())
    expect(host.querySelector<HTMLButtonElement>('[title="No verified equivalent for this bookmark"]')?.disabled).toBe(true)
  })
})

describe('learning sessions and verse note drafts', () => {
  it('switches from the last Greek quiz letter into the shorter Hebrew alphabet', async () => {
    await act(async () => root.render(createElement(LearnView)))
    await clickButton('Quiz me')
    for (let i = 0; i < 23; i++) await clickButton('Next letter')
    expect(host.textContent).toContain('ω')
    await clickButton('hebrew')
    expect(host.textContent).toContain('22 letters')
    await clickButton('Quiz me')
    expect(host.textContent).toContain('א')
  })

  it('keeps a stale deck out of a new language session and accepts one grade per card', async () => {
    const old = deferred<any>()
    const saved = deferred<any>()
    const reviewCard = vi.fn().mockReturnValue(saved.promise)
    Object.assign(window.api, { getVocab: (lang: string) => lang === 'greek' ? old.promise :
      Promise.resolve([{ language: 'hebrew', strongs: 'H430', lemma: 'Elohim' }]),
      listDueCards: async () => [], seenCards: async () => [], srsStats: async () => ({ learned: 0, due: 0 }), reviewCard })
    useAppStore.setState({ learnModule: 'flashcards' })
    await act(async () => root.render(createElement(LearnView)))
    await clickButton('hebrew')
    await act(async () => old.resolve([{ language: 'greek', strongs: 'G26', lemma: 'agape' }]))
    expect(host.textContent).toContain('Elohim')
    await clickButton('Reveal')
    await clickButton('Good')
    await clickButton('Good')
    expect(reviewCard.mock.calls).toEqual([['H430', 'hebrew', 4]])
    await act(async () => saved.resolve({}))
    expect(host.textContent).toContain('Session complete')
  })

  it('leaves Hebrew reading order to RTL flex layout', async () => {
    Object.assign(window.api, { getInterlinear: async () => ({ verses: [{ verse: 1, tokens: [{ lemma: 'בְּרֵאשִׁית' }, { lemma: 'בָּרָא' }] }] }) })
    await act(async () => root.render(createElement(LearnReading, { refKey: 'Gen.1.1' })))
    const line = host.querySelector('[dir="rtl"]')!
    expect(line.classList.contains('flex-row-reverse')).toBe(false)
    expect(line.querySelector('button')!.textContent).toBe('בְּרֵאשִׁית')
  })

  it('prevents writes before notes load and preserves a dirty draft across a refresh', async () => {
    const props = { x: 0, y: 0, translation: 'KJV', book: 'John', chapter: 1, verse: 1, verseText: '', onClose: vi.fn() }
    await act(async () => root.render(createElement(VersePopover, { ...props, notesLoading: true })))
    expect(host.textContent).toContain('Loading notes')
    expect(host.querySelector('textarea')).toBeNull()
    await act(async () => root.render(createElement(VersePopover, props)))
    await clickButton('Add a note')
    await change(host.querySelector('textarea')!, 'Keep my draft')
    await act(async () => root.render(createElement(VersePopover, { ...props, note: { id: 9, body: 'Existing text' } as any })))
    expect(host.querySelector('textarea')!.value).toBe('Keep my draft')
  })
})

describe('source-word reading and quotations', () => {
  const psalm = {
    verse: 1, text: 'The LORD is my shepherd;',
    tokens: [
      { position: 0, surface: 'The', trailer: ' ', strongs: null },
      { position: 1, surface: 'LORD', trailer: ' ', strongs: 'H3068', sourceWord: {
        text: 'יְהוָ֥ה', translit: 'Yah·weh', language: 'Hebrew', edition: 'BSB',
        strongs: 'H3068', morph: 'Noun - proper - masculine singular',
        book: 'Ps', chapter: 23, verse: 1, rowId: '344393', english: 'The LORD',
        startPosition: 0, endPosition: 1, evidence: 'corroborated'
      } },
      { position: 2, surface: 'is', trailer: ' ', strongs: null },
      { position: 3, surface: 'my', trailer: ' ', strongs: null },
      { position: 4, surface: 'shepherd', trailer: ';', strongs: 'H7462' }
    ]
  }
  async function renderReading() {
    useAppStore.getState().goTo('Ps', 23, 'KJV')
    Object.assign(window.api, {
      getChapter: async () => ({ translation: 'KJV', book: 'Ps', chapter: 23, direction: 'ltr',
        verses: [psalm, { verse: 2, text: 'He maketh me', tokens: null }] }),
      listHighlights: async () => [], listNotes: async () => []
    })
    await act(async () => root.render(createElement(ReadingPanel)))
  }

  describe('translation comparison on a restored word', () => {
    const editions: Translation[] = ['KJV', 'BSB', 'ASV', 'WEB', 'YLT'].map(id => ({
      id, abbrev: id, name: id, language: 'eng', direction: 'ltr', isOriginal: false,
      hasStrongs: id === 'KJV' || id === 'BSB', license: '', attribution: ''
    }))
    const asv = { verse: 1, text: 'Jehovah is my shepherd; I shall not want.', tokens: null }
    const web = { verse: 1, text: 'The LORD is my shepherd; I shall lack nothing.', tokens: null }
    const berean = (rowId = '344393') => ({
      verse: 1, text: 'The LORD is my shepherd;',
      tokens: [
        { position: 0, surface: 'The LORD', trailer: ' ', strongs: 'H3068', sourceWord: {
          ...psalm.tokens[1].sourceWord, rowId, evidence: 'aligned', startPosition: 0, endPosition: 0
        } },
        { position: 1, surface: 'is my shepherd', trailer: ';', strongs: null }
      ]
    })
    const dialog = () => document.querySelector<HTMLElement>('[role="dialog"][aria-label="Translation comparison"]')
    const compareTranslations = async () => {
      const compare = [...dialog()!.querySelectorAll('button')].find(button => button.textContent === 'Compare translations')!
      await act(async () => compare.click())
    }
    const reading = (id: string) => [...dialog()!.querySelectorAll('dt')]
      .find(label => label.textContent === id)?.nextElementSibling
    const mouse = (type: 'mouseover' | 'mouseout', target: Element, relatedTarget: Element | null = null) =>
      act(async () => { target.dispatchEvent(new MouseEvent(type, { bubbles: true, relatedTarget })) })
    const key = (target: Element, key: string) =>
      act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })) })

    beforeEach(() => {
      vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
      window.getSelection()?.removeAllRanges()
    })
    afterEach(() => vi.unstubAllGlobals())

    async function renderComparison(fetch: (ref: VerseRef) => Promise<unknown>) {
      useAppStore.setState({ restoreSourceWords: true, translations: editions })
      Object.assign(window.api, { getComparisonVerse: fetch })
      await renderReading()
      return host.querySelector<HTMLElement>('[data-restored-word]')!
    }

    it('compares the selected occurrence from its added source form and leaves the printed English hover-free', async () => {
      useAppStore.setState({ primary: 'BSB', parallels: ['BSB'], restoreSourceWords: true, sourceFormIds: ['G264'],
        translations: editions })
      useAppStore.getState().goTo('1John', 2, 'BSB')
      const aligned = { edition: 'BSB', language: 'Greek', book: '1John', chapter: 2, verse: 1,
        evidence: 'aligned', strongs: 'G264', morph: 'Verb' }
      const first = { ...aligned, rowId: '199485', text: 'ἁμάρτητε', translit: 'hamartēte', startPosition: 0, endPosition: 0, english: 'you will not sin' }
      const second = { ...aligned, rowId: '199489', text: 'ἁμάρτῃ', translit: 'hamartē', startPosition: 2, endPosition: 2, english: 'does sin' }
      const verse = { verse: 1, text: 'you will not sin. But if anyone does sin,',
        tokens: [{ position: 0, surface: first.english, trailer: '. ', strongs: 'G264', sourceWord: first },
          { position: 1, surface: 'But if anyone', trailer: ' ', strongs: null },
          { position: 2, surface: second.english, trailer: ',', strongs: 'G264', sourceWord: second }] }
      const compare = vi.fn(async () => ({ verse: 1, text: 'And if any man sin,', tokens: null }))
      Object.assign(window.api, { getChapter: async () => ({ translation: 'BSB', book: '1John', chapter: 2, direction: 'ltr', verses: [verse] }),
        listHighlights: async () => [], listNotes: async () => [], getComparisonVerse: compare })
      await act(async () => root.render(createElement(ReadingPanel)))
      const row = host.querySelector<HTMLElement>('[data-verse="1"]')!
      expect(row.textContent?.trim()).toBe('you will not sin [ἁμάρτητε]. But if anyone does sin [ἁμάρτῃ],')
      await mouse('mouseover', row.querySelector('[data-aligned-english]')!)
      await advance(500)
      expect(dialog()).toBeNull()
      expect(compare).not.toHaveBeenCalled()
      const words = [...row.querySelectorAll('[data-restored-word]')]
      expect(words.map(node => node.textContent)).toEqual([first.text, second.text])
      await key(words[1], 'ArrowDown')
      expect(dialog()?.querySelector('h2')?.textContent).toBe(second.text)
      expect(reading('BSB')?.querySelector('p')?.textContent).toBe(second.english)
      expect(compare).not.toHaveBeenCalled()
      await compareTranslations()
      expect(reading('KJV')?.textContent).toContain('Verse context')
      await act(async () => useAppStore.getState().setSourceForm('G264', false))
      expect(dialog()).toBeNull()
      expect(row.textContent?.trim()).toBe(verse.text)
    })

    it('waits for a deliberate hover, compares only the verified span and preserves full fallback text', async () => {
      const fetch = vi.fn(async ({ translation }: VerseRef) =>
        translation === 'BSB' ? berean() : translation === 'ASV' ? asv : web)
      const word = await renderComparison(fetch)
      expect(word.textContent).toBe('YHWH')
      expect(host.querySelectorAll('[data-restored-word]')).toHaveLength(1)
      const ordinary = [...host.querySelectorAll('[data-scripture-part]')].find(el => el.textContent === 'shepherd')!
      await mouse('mouseover', ordinary)
      await advance(500)
      await mouse('mouseover', word)
      await advance(100)
      await mouse('mouseout', word, ordinary)
      await advance(500)
      expect(dialog()).toBeNull()
      expect(fetch).not.toHaveBeenCalled()

      await mouse('mouseover', word)
      await advance(500)
      expect(reading('KJV')?.querySelector('p')?.textContent).toBe('The LORD')
      expect(fetch).not.toHaveBeenCalled()
      await compareTranslations()
      expect(reading('BSB')?.textContent).toContain('Verified wording')
      expect(reading('BSB')?.querySelector('p')?.textContent).toBe('The LORD')
      expect(reading('ASV')?.querySelector('p')?.textContent).toBe(asv.text)
      expect(reading('WEB')?.querySelector('p')?.textContent).toBe(web.text)
      expect(reading('WEB')?.textContent).toContain('Verse context')
      expect(fetch.mock.calls.every(([ref]) => ref.book === 'Ps' && ref.chapter === 23 && ref.verse === 1)).toBe(true)
      expect(reading('YLT')).toBeUndefined()
      await mouse('mouseout', word, dialog())
      await mouse('mouseover', dialog()!, word)
      await advance(500)
      expect(dialog()).toBeTruthy()
      await act(async () => dialog()!.querySelector<HTMLButtonElement>('button[aria-expanded="false"]')!.click())
      expect(reading('YLT')).toBeTruthy()
      expect(host.querySelector('[data-verse="1"]')?.textContent?.trim()).toBe('YHWH is my shepherd;')
    })

    it('keeps a shared Strong’s number with a different source row in context and ignores dismissed requests', async () => {
      const stale = deferred<ReturnType<typeof berean>>()
      const fetch = vi.fn()
        .mockImplementationOnce(() => stale.promise)
        .mockImplementation(async ({ translation }: VerseRef) => {
          if (translation === 'BSB') return berean('344394')
          if (translation === 'WEB') throw new Error('Read failed')
          return null
        })
      const word = await renderComparison(fetch)
      await mouse('mouseover', word)
      await advance(500)
      await compareTranslations()
      expect(reading('BSB')?.textContent).toContain('Loading')
      await key(word, 'Escape')
      expect(dialog()).toBeNull()
      await key(word, 'ArrowDown')
      expect(document.activeElement).toBe(dialog())
      await compareTranslations()
      expect(reading('BSB')?.querySelector('p')?.textContent).toBe(berean().text)
      expect(reading('BSB')?.textContent).toContain('Verse context')
      expect(reading('ASV')?.textContent).toContain('Verse unavailable')
      expect(reading('WEB')?.textContent).toContain('Could not load')
      await act(async () => stale.resolve(berean()))
      expect(reading('BSB')?.querySelector('p')?.textContent).toBe(berean().text)
      await key(dialog()!, 'Escape')
      expect(dialog()).toBeNull()
      expect(document.activeElement).toBe(word)
      await key(word, 'Enter')
      expect(useAppStore.getState().selectedStrongs).toBe('H3068')
      await act(async () => useAppStore.getState().toggleSourceWords())
      expect(host.querySelector('[data-restored-word]')).toBeNull()
    })
  })

  it('ignores arbitrary legacy renderings, while the study toggle uses the verified occurrence', async () => {
    useAppStore.setState({ replacements: { H3068: 'Custom' }, quickReplace: true,
      quickReplaceConfig: { H3068: { enabled: true, custom: 'Custom' } }, strongsVisible: true } as any)
    await renderReading()
    const row = host.querySelector<HTMLElement>('[data-verse="1"]')!
    expect(row.textContent?.trim()).toBe(psalm.text)
    await act(async () => useAppStore.getState().toggleSourceWords())
    expect(row.textContent?.trim()).toBe('YHWH is my shepherd;')
    await act(async () => row.querySelector<HTMLElement>('[data-published="The LORD"]')!.click())
    expect(useAppStore.getState().selectedOccurrence).toMatchObject({
      translation: 'KJV', book: 'Ps', chapter: 23, verse: 1, surface: 'The LORD',
      sourceWord: { text: 'יְהוָ֥ה', edition: 'BSB' }
    })
    await act(async () => useAppStore.getState().selectStrongs('H3068'))
    expect(useAppStore.getState().selectedOccurrence).toBeNull()
    await act(async () => useAppStore.getState().toggleSourceWords())
    expect(row.textContent?.trim()).toBe(psalm.text)
  })

  it('shows the occurrence-specific Greek form separately from its dictionary headword', async () => {
    useAppStore.setState({ primary: 'BSB', parallels: ['BSB'], restoreSourceWords: true, sourceWordTerms: { G25: true } })
    useAppStore.getState().goTo('John', 3, 'BSB')
    const word = { text: 'ἠγάπησεν', translit: 'ēgapēsen', language: 'Greek', edition: 'BSB',
      strongs: 'G25', morph: 'Verb - Aorist Indicative Active - 3rd Person Singular',
      book: 'John', chapter: 3, verse: 16, rowId: '80599', english: 'loved', startPosition: 1, endPosition: 1, evidence: 'aligned' }
    const reading = { nativeRefs: ['3:16'], words: [{ surface: word.text, strongs: 'G25', translit: word.translit, gloss: 'loved' }] }
    const getOriginalVerseReadings = vi.fn(async () => ({ kind: 'greek', ref: { book: 'John', chapter: 3, verse: 16 },
      readings: { NA: reading, TR: reading, BYZ: reading } }))
    Object.assign(window.api, {
      getOriginalVerseReadings,
      getChapter: async () => ({ translation: 'BSB', book: 'John', chapter: 3, direction: 'ltr', verses: [{
        verse: 16, text: 'God loved the world.', tokens: [
          { position: 0, surface: 'God', trailer: ' ', strongs: 'G2316' },
          { position: 1, surface: 'loved', trailer: ' ', strongs: 'G25', sourceWord: word },
          { position: 2, surface: 'the world', trailer: '.', strongs: null }
        ]
      }] }),
      getStrongs: async () => ({ id: 'G25', lemma: 'ἀγαπάω', translit: 'agapaō', language: 'greek', occurrences: 0 }),
      getLexiconEntries: async () => [], getConcordance: async () => ({ hits: [], total: 0, translation: 'BSB' }),
      listHighlights: async () => [], listNotes: async () => []
    })
    function ReaderAndLexicon() {
      const id = useAppStore(s => s.selectedStrongs)
      return createElement('div', {}, createElement(ReadingPanel), createElement(LexiconCard, { id }))
    }
    await act(async () => root.render(createElement(ReaderAndLexicon)))
    expect(host.querySelector('[data-verse]')!.textContent?.trim()).toBe('God ēgapēsen the world.')
    await act(async () => host.querySelector<HTMLElement>('[data-published="loved"]')!.click())
    const inspector = host.querySelector('[aria-label="Selected word"]')!
    expect(inspector.textContent).toContain('BSB · John 3:16')
    expect(inspector.textContent).toContain('loved')
    expect(inspector.querySelector('bdi')?.textContent).toBe('ἠγάπησεν')
    expect(inspector.textContent).not.toContain('ἀγαπάω')
    expect(host.textContent).toContain('Dictionary headwordἀγαπάω')
    expect(getOriginalVerseReadings).not.toHaveBeenCalled()
    const compare = inspector.querySelector<HTMLButtonElement>('button[aria-expanded]')!
    await act(async () => compare.click())
    expect(getOriginalVerseReadings).toHaveBeenCalledWith({ translation: 'BSB', book: 'John', chapter: 3, verse: 16 })
    const labels = () => [...inspector.querySelectorAll('dt')].map(el => el.textContent)
    expect(labels()[0]).toContain('Critical')
    await act(async () => {
      const state = useAppStore.getState()
      state.setPreferredTextOrder({ ...state.preferredTextOrder, nt: ['TR', 'BYZ', 'NA'] })
    })
    expect(labels()[0]).toContain('Textus Receptus')
    expect(getOriginalVerseReadings).toHaveBeenCalledTimes(1)
    expect(inspector.querySelector('bdi')?.textContent).toBe(word.text)
    expect(host.querySelector('[data-verse]')!.textContent?.trim()).toBe('God ēgapēsen the world.')
  })

  it('copies and attaches published words across verses and preserves partial unmodified endpoints', async () => {
    useAppStore.setState({ restoreSourceWords: true, strongsVisible: true })
    await renderReading()
    const restored = host.querySelector<HTMLElement>('[data-published="The LORD"]')!
    const last = host.querySelector('[data-verse="2"] [data-scripture-part]')!
    const range = document.createRange()
    range.setStart(restored.firstChild!, 1)
    range.setEnd(last.firstChild!, 7)
    Object.assign(range, { getBoundingClientRect: () => new DOMRect() })
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    const event = new Event('copy', { bubbles: true, cancelable: true })
    const clipboard = { setData: vi.fn() }
    Object.defineProperty(event, 'clipboardData', { value: clipboard })
    restored.dispatchEvent(event)
    expect(clipboard.setData).toHaveBeenCalledWith('text/plain', 'The LORD is my shepherd; He make')
    expect(event.defaultPrevented).toBe(true)
    await act(async () => restored.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })))
    await clickButton('Ask')
    expect(useAppStore.getState().pendingContext).toMatchObject({
      book: 'Ps', chapter: 23, verse: 1, endVerse: 2, translation: 'KJV',
      text: 'The LORD is my shepherd; He make'
    })
  })
})

describe('protecting personal study edits', () => {
  it('keeps an unsaved verse draft through a delayed highlight, dismissal, and reopen', async () => {
    const highlight = deferred<void>()
    const props = { x: 0, y: 0, translation: 'KJV', book: 'John', chapter: 1, verse: 2, verseText: '', onClose: vi.fn() }
    Object.assign(window.api, { saveHighlight: () => highlight.promise, saveNote: vi.fn().mockResolvedValue({}) })
    await act(async () => root.render(createElement(VersePopover, props)))
    await clickButton('Add a note')
    await change(host.querySelector('textarea')!, 'A personal observation')
    await act(async () => host.querySelector<HTMLButtonElement>('[title="yellow"]')!.click())
    await act(async () => highlight.resolve())
    expect(props.onClose).not.toHaveBeenCalled()
    expect(host.querySelector('textarea')!.value).toBe('A personal observation')
    await act(async () => root.render(null))
    await act(async () => root.render(createElement(VersePopover, props)))
    expect(host.querySelector('textarea')!.value).toBe('A personal observation')
    await clickButton('Save note')
    expect(window.api.saveNote).toHaveBeenCalledWith(expect.objectContaining({ body: 'A personal observation', verse: 2 }))
    await act(async () => root.render(null))
    await act(async () => root.render(createElement(VersePopover, props)))
    expect(host.querySelector('textarea')).toBeNull()
  })

  it('requires an explicit comparison before replacing edits made during an assistant request', async () => {
    const answer = deferred<{ text: string }>()
    Object.assign(window, { ai: { complete: () => answer.promise } })
    Object.assign(window.notebook, { read: async () => 'Original words', write: vi.fn(),
      list: async () => [{ name: 'first.md' }], getFolder: async () => '/notes' })
    useAppStore.setState({ activeNotebookFile: 'first.md' })
    await act(async () => root.render(createElement(NotebookPanel)))
    await change(host.querySelector('input')!, 'Revise')
    await clickButton('Ask')
    await change(host.querySelector('textarea')!, 'Original plus new words')
    await act(async () => answer.resolve({ text: 'Proposed text' }))
    expect([...host.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Apply')!.disabled).toBe(true)
    expect(host.querySelector('details pre')?.textContent).toBe('Original plus new words')
    await clickButton('Insert')
    expect(host.querySelector('textarea')!.value).toBe('Original plus new words\n\nProposed text')
  })

  it('distinguishes a folder failure from an empty notebook and restores a deleted file', async () => {
    let restored = false
    Object.assign(window.notebook, {
      getFolder: async () => '/notes', list: vi.fn().mockRejectedValueOnce(new Error('Access lost')).mockImplementation(async () => restored ? [{ name: 'A.md' }] : []),
      listDeleted: async () => restored ? [] : [{ id: 'archive-id', name: 'A.md', modified: 1 }],
      restoreDeleted: async (id: string) => { expect(id).toBe('archive-id'); restored = true; return { name: 'A.md' } },
      read: async () => 'Restored words'
    })
    await act(async () => root.render(createElement(NotebookPanel)))
    expect(host.textContent).toContain('Access lost')
    expect(host.textContent).not.toContain('No notes yet')
    await clickButton('Retry folder')
    expect(host.textContent).toContain('No notes yet')
    await clickButton('Recently deleted (1)')
    await clickButton('Restore')
    expect(host.querySelector('textarea')!.value).toBe('Restored words')
    expect(host.textContent).toContain('Recently deleted (0)')
  })
})
