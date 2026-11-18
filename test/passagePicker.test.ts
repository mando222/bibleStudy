// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PassagePicker from '@/components/PassagePicker'
import { useAppStore } from '@/store/useAppStore'
import type { ChapterRef } from '@shared/types'

let host: HTMLElement
let root: Root
const close = vi.fn()
const snapshots = {
  '1John/4': [7, 12, 20],
  '1John/5': [1, 3],
  'John/3': [1, 3, 16]
} as Record<string, number[]>

beforeEach(() => {
  close.mockClear()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  useAppStore.persist.setOptions({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } })
  useAppStore.setState({ ...useAppStore.getInitialState(), primary: 'KJV', book: '1John', chapter: 4, activeVerse: 12 }, true)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  Object.assign(window, {api: {
    listReadingChapters: async () => Object.entries(snapshots).map(([ref, numbers]) => {
      const [book, c] = ref.split('/')
      return { book, chapter: Number(c), firstVerse: numbers[0] }
    }),
    listReadingVerses: async (ref: ChapterRef) => snapshots[ref.book + '/' + ref.chapter] ?? []
  }})
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})
const render = (options: { openChapterOnPick?: boolean } = {}) =>
  act(async () => root.render(createElement(PassagePicker, { onClose: close, ...options })))
function button(text: string) {
  const found = [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === text || b.getAttribute('aria-label') === text)
  if (!found) throw new Error('Missing button ' + text)
  return found
}
const click = (text: string) => act(async () => button(text).click())
async function type(value: string) {
  const input = host.querySelector('input[type="text"]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('shared passage selector', () => {
  it('opens a chapter immediately at its first recorded verse on the phone', async () => {
    useAppStore.setState({ chapter: 5, activeVerse: 3 })
    await render({ openChapterOnPick: true })
    await click('Change chapter, 5')
    await click('Chapter 4')
    expect(close).toHaveBeenCalledOnce()
    expect(useAppStore.getState()).toMatchObject({
      book: '1John', chapter: 4, activeVerse: 7, scrollToVerse: 7, navigationRange: null
    })
  })

  it('opens at the current native chapter and skips missing verses when choosing a cross-chapter range', async () => {
    await render({ openChapterOnPick: true })
    expect(document.activeElement).not.toBe(host.querySelector('input'))
    expect(button('Verse 12').getAttribute('aria-current')).toBe('location')
    expect(host.querySelector('[aria-label="Verse 8"]')).toBeNull()
    await click('Select range')
    await click('Verse 12')
    expect(button('Verse 7').disabled).toBe(true)
    await click('End in another chapter')
    await click('Chapter 5')
    expect(close).not.toHaveBeenCalled()
    await click('Verse 3')
    expect(close).toHaveBeenCalledOnce()
    expect(useAppStore.getState()).toMatchObject({ book: '1John', chapter: 4, activeVerse: 12,
      navigationRange: { firstVerse: 12, lastChapter: 5, lastVerse: 3, edition: 'KJV' } })
  })

  it('keeps range selection open when changing chapter before picking the first verse on the phone', async () => {
    await render({ openChapterOnPick: true })
    await click('Select range')
    await click('Change chapter, 4')
    await click('Chapter 5')
    expect(close).not.toHaveBeenCalled()
    await click('Verse 1')
    await click('Verse 3')
    expect(close).toHaveBeenCalledOnce()
    expect(useAppStore.getState().navigationRange).toMatchObject({ chapter: 5, firstVerse: 1, lastChapter: 5, lastVerse: 3 })
  })

  it('lets a partial name lead directly to the available chapters and opens the first recorded verse of a chapter', async () => {
    await render()
    await type('joh')
    expect(host.querySelector('[role=alert]')).toBeNull()
    await click('John')
    await click('Read whole chapter')
    expect(useAppStore.getState()).toMatchObject({ book: 'John', chapter: 3, activeVerse: 1, navigationRange: null })
  })

  it('validates both endpoints of typed references and keeps a missing verse out of the reading position', async () => {
    await render()
    await type('1 Jn 4:7–5:2')
    expect(host.textContent).toContain('1 John 4:7–5:2 is unavailable in KJV.')
    await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(close).not.toHaveBeenCalled()
    await type('1 Jn 4:7–5:3')
    expect(button('Open 1 John 4:7–5:3')).toBeTruthy()
    await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(close).toHaveBeenCalledOnce()
    expect(useAppStore.getState()).toMatchObject({ chapter: 4, activeVerse: 7, navigationRange: {lastChapter: 5, lastVerse: 3} })
  })

  it.each([['desktop', false], ['phone', true]] as const)('opens Swete Psalm 151 from its own interlinear inventory on %s', async (_platform, openChapterOnPick) => {
    useAppStore.setState({ interlinear: true, interlinearEdition: 'NA', preferredTextOrder: {
      ot: ['LXX', 'MT'], nt: ['NA', 'TR', 'BYZ'], masoretic: ['ketiv', 'qere']
    } })
    window.api.listReadingChapters = vi.fn(async (edition, _interlinear) => edition === 'LXX'
      ? [{ book: 'Ps', chapter: 150, firstVerse: 1 }, { book: 'Ps', chapter: 151, firstVerse: 0 }]
      : [{ book: '1John', chapter: 4, firstVerse: 7 }])
    window.api.listReadingVerses = vi.fn(async ref => ref.translation === 'LXX' ? [0, 1, 2] : [7, 12])
    await render({ openChapterOnPick })
    await click('Change book, 1 John')
    expect(button('1 John')).toBeTruthy()
    await click('Psalms')
    expect(window.api.listReadingChapters).toHaveBeenCalledWith('NA', true)
    expect(window.api.listReadingChapters).toHaveBeenCalledWith('LXX', true)
    await click('Chapter 151')
    if (!openChapterOnPick) {
      expect(close).not.toHaveBeenCalled()
      await click('Verse 0')
    }
    expect(close).toHaveBeenCalledOnce()
    expect(useAppStore.getState()).toMatchObject({ book: 'Ps', chapter: 151, activeVerse: 0, referenceEdition: 'LXX' })
  })

  it('cancels a jump when the picker closes before the database returns', async () => {
    await render()
    let resolve!: (verses: number[]) => void
    window.api.listReadingVerses = () => new Promise(done => { resolve = done })
    await click('Verse 20')
    await act(async () => root.render(null))
    await act(async () => resolve([7,12,20]))
    expect(close).not.toHaveBeenCalled()
    expect(useAppStore.getState().activeVerse).toBe(12)
  })
})
