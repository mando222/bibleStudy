// @vitest-environment jsdom
import { act, createElement, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SearchPanel from '../src/renderer/src/components/SearchPanel'
import InterlinearReader from '../src/renderer/src/components/InterlinearReader'
import NotebookPanel from '../src/renderer/src/components/NotebookPanel'
import CrossRefsPanel from '../src/renderer/src/components/CrossRefsPanel'
import { useChapter } from '../src/renderer/src/hooks/useChapter'
import { useHighlights, useNotes } from '../src/renderer/src/hooks/useUserData'
import { useNotebookDocument } from '../src/renderer/src/hooks/useNotebookDocument'
import { useVerseNavigation } from '../src/renderer/src/hooks/useVerseNavigation'
import { useAppStore } from '../src/renderer/src/store/useAppStore'

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
      useVerseNavigation(container, `John:${chapter}`, !loading && !!data)
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
      listNotes: vi.fn().mockResolvedValueOnce([{ verse: 1, body: 'Old note' }]).mockReturnValue(pending)
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

  it('renders inferred translation alignments and honors verse jumps in interlinear mode', async () => {
    const scroll = vi.fn()
    HTMLElement.prototype.scrollIntoView = scroll
    useAppStore.setState({
      interlinearStack: ['ASV'],
      translations: [{ id: 'ASV', abbrev: 'ASV', name: 'American Standard Version', language: 'eng', hasStrongs: false } as any]
    })
    useAppStore.getState().goToVerse('John', 3, 16)
    Object.assign(window.api, {
      listEditions: async () => [{ id: 'NA', name: 'Critical', testament: 'NT' }],
      getInterlinear: async () => ({ direction: 'ltr', verses: [{ verse: 16, tokens: [{ position: 1, surface: 'gloss', lemma: 'λόγος', strongs: 'G3056', aligned: { ASV: 'Aligned ASV text' } }] }] })
    })
    await act(async () => root.render(createElement(InterlinearReader, { book: 'John', chapter: 3 })))
    expect(host.textContent).toContain('Aligned ASV text')
    expect(scroll).toHaveBeenCalledOnce()
    expect(useAppStore.getState().scrollToVerse).toBeNull()
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
