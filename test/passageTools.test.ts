// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PassageTools, type PassageToolColumn } from '../mobile/src/PassageTools'
import { Study } from '../mobile/src/study'
import { useAppStore } from '../src/renderer/src/store/useAppStore'
import type { ChapterContent, ChapterRef } from '../src/shared/types'

vi.mock('../mobile/src/study', () => ({ Study: { copyText: vi.fn(), shareText: vi.fn() } }))
let host: HTMLDivElement, root: Root
let columns: PassageToolColumn[]
const onStudy = vi.fn(), onParallels = vi.fn(), onInterlinear = vi.fn(), onDisplay = vi.fn()
const getChapter = vi.fn()
function chapter(ref: ChapterRef, verses = [[16, 'Published verse sixteen.'], [17, 'Published verse seventeen.']] as [number, string][]): ChapterContent {
  return { ...ref, bookName: 'John', direction: 'ltr', verses: verses.map(([verse, text]) => ({ verse, text, tokens: null })) }
}
const button = (name: string) => {
  const result = [...host.querySelectorAll<HTMLButtonElement>('button')].find(node =>
    node.textContent?.trim() === name || node.querySelector('strong')?.textContent === name)
  if (!result) throw new Error(`Missing button: ${name}`)
  return result
}
const click = (name: string) => act(async () => button(name).click())
const select = (name: string) => {
  const found = [...host.querySelectorAll<HTMLSelectElement>('select')].find(node =>
    node.getAttribute('aria-label') === name || node.parentElement?.firstChild?.textContent?.trim() === name)
  if (!found) throw new Error(`Missing select: ${name}`)
  return found
}
const change = (name: string, value: string) => act(async () => {
  const node = select(name)
  node.value = value
  node.dispatchEvent(new Event('change', { bubbles: true }))
})
async function render(overrides: { interlinear?: boolean } = {}) {
  await act(async () => root.render(createElement(PassageTools, {
    columns, interlinear: false, onStudy, onParallels, onInterlinear, onDisplay, ...overrides
  })))
}
function pending<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.resetAllMocks()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  useAppStore.persist.setOptions({ storage: { getItem: () => null, setItem() {}, removeItem() {} } })
  useAppStore.setState({ translations: [] })
  columns = [{ translation: 'BSB', book: 'John', chapter: 3, verse: 16 }]
  getChapter.mockImplementation((ref: ChapterRef) => Promise.resolve(chapter(ref)))
  vi.mocked(Study.copyText).mockResolvedValue(undefined)
  vi.mocked(Study.shareText).mockResolvedValue(undefined)
  Object.assign(window, { api: { getChapter } })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.restoreAllMocks()
})

it('opens Study with the actual selected verse and direct actions without an intermediary screen', async () => {
  await render()
  expect(button('Study').getAttribute('aria-pressed')).toBe('true')
  expect(host.querySelector('.passage-tools-reference')?.textContent).toBe('John 3:16 · BSB')
  expect(host.querySelector('[data-study-scripture]')?.textContent).toBe('Published verse sixteen.')
  expect(host.textContent).not.toContain('Open verse actions')
  await click('Note & highlight')
  expect(onStudy).toHaveBeenLastCalledWith('notes', { ...columns[0], text: 'Published verse sixteen.', notes: [] })
  for (const [label, action] of [['Passage context', 'context'], ['Related passages', 'refs'],
    ['Compare source texts', 'originals'], ['Textual variants', 'variants'], ['Chapter notes', 'chapterNotes']]) {
    await click(label)
    expect(onStudy).toHaveBeenLastCalledWith(action, expect.objectContaining({ translation: 'BSB', book: 'John', chapter: 3, verse: 16 }))
  }
  expect(host.textContent).not.toContain('Show full verse')
})

it('uses inline verse selection for exact published copy and share text with progress feedback', async () => {
  await render()
  await change('Choose verse', '17')
  const copying = pending<void>()
  vi.mocked(Study.copyText).mockReturnValueOnce(copying.promise)
  await click('Copy verse')
  expect(Study.copyText).toHaveBeenCalledWith({ text: 'John 3:17 (BSB)\nPublished verse seventeen.' })
  expect(button('Copying…').disabled).toBe(true)
  expect(button('Share verse').disabled).toBe(true)
  await act(async () => copying.resolve())
  expect(host.querySelector('[role="status"]')?.textContent).toBe('Published wording copied.')
  await click('Share verse')
  expect(Study.shareText).toHaveBeenCalledWith({ text: 'John 3:17 (BSB)\nPublished verse seventeen.' })
  vi.mocked(Study.shareText).mockRejectedValueOnce(new Error('Sharing is unavailable.'))
  await click('Share verse')
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Could not share this verse. Sharing is unavailable.')
  expect(button('Share verse').disabled).toBe(false)
})

it('uses each column’s native chapter and verse, retaining the selected edition after parallel reordering', async () => {
  columns = [{ translation: 'BSB', book: 'Ps', chapter: 23, verse: 1 }, { translation: 'LXX', book: 'Ps', chapter: 22, verse: 0 }]
  getChapter.mockImplementation((ref: ChapterRef) => Promise.resolve(chapter(ref, [[0, 'Recorded superscription.'], [1, 'Recorded verse.']])))
  await render()
  await change('Translation', 'LXX')
  expect(getChapter).toHaveBeenLastCalledWith({ translation: 'LXX', book: 'Ps', chapter: 22 })
  expect(select('Choose verse').value).toBe('0')
  await click('Passage context')
  expect(onStudy).toHaveBeenLastCalledWith('context', expect.objectContaining({ translation: 'LXX', book: 'Ps', chapter: 22, verse: 0 }))
  columns = [columns[1], columns[0]]
  await render()
  expect(select('Translation').value).toBe('LXX')
  columns = [columns[1]]
  await render()
  expect(host.querySelector('.passage-tools-reference')?.textContent).toBe('Psalms 23:1 · BSB')
  await click('Note & highlight')
  expect(onStudy).toHaveBeenLastCalledWith('notes', expect.objectContaining({ translation: 'BSB', chapter: 23, verse: 1 }))
})

it('disables verse actions while a newly selected edition loads and ignores late prior-edition data', async () => {
  columns.push({ translation: 'KJV', book: 'John', chapter: 3, verse: 17 })
  const first = pending<ChapterContent>(), second = pending<ChapterContent>()
  getChapter.mockImplementation((ref: ChapterRef) => ref.translation === 'BSB' ? first.promise : second.promise)
  await render()
  expect(button('Note & highlight').disabled).toBe(true)
  await change('Translation', 'KJV')
  expect(button('Copy verse').disabled).toBe(true)
  await act(async () => second.resolve(chapter(columns[1], [[17, 'KJV published wording.']])))
  expect(host.querySelector('[data-study-scripture]')?.textContent).toBe('KJV published wording.')
  await act(async () => first.resolve(chapter(columns[0], [[16, 'Late BSB wording.']])))
  expect(host.querySelector('[data-study-scripture]')?.textContent).toBe('KJV published wording.')
  await click('Note & highlight')
  expect(onStudy).toHaveBeenLastCalledWith('notes', expect.objectContaining({ translation: 'KJV', verse: 17, text: 'KJV published wording.' }))
  const third = pending<ChapterContent>()
  getChapter.mockReturnValueOnce(third.promise)
  await change('Translation', 'BSB')
  expect(host.querySelector('[data-study-scripture]')).toBeNull()
  expect(button('Note & highlight').disabled).toBe(true)
})

it('never fabricates verse one or substitutes another verse when a requested verse is unavailable', async () => {
  columns[0].verse = 99
  getChapter.mockResolvedValue(chapter(columns[0], [[7, 'Only recorded verse.']]))
  await render()
  expect(button('Copy verse').disabled).toBe(true)
  expect(host.textContent).toContain('No corresponding verse text is available')
  expect(host.querySelector('[data-study-scripture]')).toBeNull()
  await click('Passage context')
  expect(onStudy).not.toHaveBeenCalled()
  await change('Choose verse', '7')
  await click('Passage context')
  expect(onStudy).toHaveBeenLastCalledWith('context', expect.objectContaining({ verse: 7, text: 'Only recorded verse.' }))
})

it('can retry chapter failures and keeps empty chapter actions unavailable', async () => {
  getChapter.mockRejectedValueOnce(new Error('Database unavailable.'))
  await render()
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Database unavailable.')
  expect(button('Note & highlight').disabled).toBe(true)
  await click('Retry')
  expect(button('Note & highlight').disabled).toBe(false)
  columns = [{ translation: 'WYC', book: 'John', chapter: 3, verse: 16 }]
  getChapter.mockResolvedValue(chapter(columns[0], []))
  await render()
  expect(button('Copy verse').disabled).toBe(true)
  expect(button('Related passages').disabled).toBe(true)
  expect(select('Choose verse').disabled).toBe(true)
})

it('keeps parallel, interlinear, and display controls available without a separate layout comparison', async () => {
  await render()
  await click('Reading')
  expect(button('Reading').getAttribute('aria-pressed')).toBe('true')
  expect(host.textContent).not.toContain('Compare layout')
  expect(host.querySelector('select')).toBeNull()
  expect(host.querySelector('[data-study-scripture]')).toBeNull()
  await click('Parallel translations')
  await click('Interlinear')
  await click('Reading display')
  expect(onParallels).toHaveBeenCalledOnce()
  expect(onInterlinear).toHaveBeenCalledOnce()
  expect(onDisplay).toHaveBeenCalledOnce()
  columns.push({ translation: 'KJV', book: 'John', chapter: 3, verse: 17 })
  await render({ interlinear: true })
  expect(host.textContent).not.toContain('Compare layout')
  await click('Parallel translations')
  await click('Return to translation')
  await click('Reading display')
  expect(onParallels).toHaveBeenCalledTimes(2)
  expect(onInterlinear).toHaveBeenCalledTimes(2)
  expect(onDisplay).toHaveBeenCalledTimes(2)
  await click('Change verse')
  expect(button('Study').getAttribute('aria-pressed')).toBe('true')
  expect(select('Choose verse').value).toBe('16')
})

it('does not query or fabricate a reference without a reader column', async () => {
  columns = []
  await render()
  expect(getChapter).not.toHaveBeenCalled()
  expect(host.querySelector('.passage-tools-reference')).toBeNull()
  expect(host.textContent).toContain('No corresponding verse is available for this reading view')
  expect(button('Note & highlight').disabled).toBe(true)
})

it('only offers preview expansion when the published text is actually clipped', async () => {
  let height = 60
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(60)
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => height)
  await render()
  expect(host.textContent).not.toContain('Show full verse')
  height = 90
  await act(async () => window.dispatchEvent(new Event('resize')))
  await click('Show full verse')
  expect(host.querySelector('.passage-tools-preview')?.classList.contains('is-expanded')).toBe(true)
  expect(button('Show less').getAttribute('aria-expanded')).toBe('true')
  await click('Show less')
  expect(button('Show full verse').getAttribute('aria-expanded')).toBe('false')
  height = 60
  await change('Choose verse', '17')
  expect(host.textContent).not.toContain('Show full verse')
})

it('shows installed names and abbreviations instead of opaque imported translation IDs', async () => {
  const imported = { id: 'imp_example', abbrev: 'MY', name: 'My imported edition', language: 'eng', direction: 'ltr' as const,
    isOriginal: false, hasStrongs: false, license: '', attribution: '' }
  useAppStore.setState({ translations: [imported] })
  columns.push({ ...columns[0], translation: imported.id })
  await render()
  expect(select('Translation').options[1].textContent).toBe('MY — My imported edition')
  await change('Translation', imported.id)
  expect(host.querySelector('.passage-tools-reference')?.textContent).toBe('John 3:16 · MY')
  expect(host.textContent).not.toContain('imp_example')
  await click('Note & highlight')
  expect(onStudy).toHaveBeenLastCalledWith('notes', expect.objectContaining({ translation: imported.id }))
})

it('finishes a copy after verse navigation without leaving a stuck busy button on return', async () => {
  const copying = pending<void>()
  vi.mocked(Study.copyText).mockReturnValueOnce(copying.promise)
  await render()
  await click('Copy verse')
  await change('Choose verse', '17')
  expect(button('Copy verse').disabled).toBe(false)
  await act(async () => copying.resolve())
  expect(host.querySelector('.passage-tools-feedback')).toBeNull()
  await change('Choose verse', '16')
  expect(button('Copy verse').disabled).toBe(false)
  expect(host.querySelector('[role="status"]')?.textContent).toBe('Published wording copied.')
})
