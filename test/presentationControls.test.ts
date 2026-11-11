// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it } from 'vitest'
import ReadingPanel from '../src/renderer/src/components/ReadingPanel'
import { useAppStore } from '../src/renderer/src/store/useAppStore'
import { publishedSelection } from '../src/renderer/src/lib/scriptureSelection'
import type { ChapterRef, Verse } from '../src/shared/types'

let host: HTMLDivElement
let root: Root
const verse: Verse = {
  verse: 1, text: 'The LORD is my shepherd; I shall not want.', tokens: null,
  layout: [
    { kind: 'heading', at: 0, text: 'The LORD Is My Shepherd' },
    { kind: 'superscription', at: 0, text: 'A Psalm of David.' },
    { kind: 'poetry', at: 0, indent: 1 }, { kind: 'poetry', at: 25, indent: 2 }
  ]
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Object.assign(window, { api: {
    getChapter: async (ref: ChapterRef) => ({ ...ref, bookName: 'Psalms', direction: 'ltr', verses: [verse] }),
    listHighlights: async () => [], listNotes: async () => [],
    listEditions: async () => [{ id: 'MT', testament: 'OT', name: 'Masoretic' }],
    getInterlinear: async () => ({ book: 'Ps', chapter: 23, edition: 'MT', direction: 'rtl', verses: [{ verse: 1, tokens: [] }] })
  } })
  useAppStore.persist.setOptions({ storage: { getItem: () => null, setItem() {}, removeItem() {} } })
  useAppStore.setState({ ...useAppStore.getInitialState(), book: 'Ps', chapter: 23, primary: 'BSB', parallels: ['BSB', 'KJV'] }, true)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

it('hides publisher headings or numbers independently in each column and keeps the right passage and verse actions', async () => {
  const store = useAppStore.getState()
  store.setDisplayDefault('literary', true)
  store.setDisplayDefault('headings', true)
  store.setDisplayOverride('BSB', 'headings', false)
  store.setDisplayOverride('BSB', 'chapterNumbers', false)
  store.setDisplayOverride('BSB', 'verseNumbers', false)
  await act(async () => root.render(createElement(ReadingPanel)))
  const headings = [...host.querySelectorAll('[aria-label="Native passage"]')]
  expect(headings.map(h => h.textContent)).toEqual(['Psalms · BSB', 'Psalms 23 · KJV'])
  const [bsb, kjv] = host.querySelectorAll<HTMLElement>('[data-scripture-passage]')
  expect(bsb.querySelector('[data-literary-kind="heading"]')).toBeNull()
  expect(kjv.querySelector('[data-literary-kind="heading"]')?.textContent).toBe('The LORD Is My Shepherd')
  expect(bsb.querySelector('[data-literary-kind="superscription"]')?.textContent).toBe('A Psalm of David.')
  expect(bsb.querySelectorAll('[data-literary-kind="poetry"]')).toHaveLength(2)
  const cut = document.createRange(); cut.selectNodeContents(bsb)
  expect(publishedSelection(bsb, cut)).toEqual({ text: verse.text, v1: 1, v2: 1 })
  const button = bsb.querySelector<HTMLButtonElement>('[data-verse-action]')!
  expect(button.dataset.label).toBe('⋯')
  expect(kjv.querySelector('[data-verse-action]')?.getAttribute('data-label')).toBe('1')
  await act(async () => { button.focus(); button.click() })
  const dialog = host.querySelector<HTMLElement>('[role="dialog"][aria-label="Verse 1 actions"]')!
  expect(dialog).not.toBeNull()
  await act(async () => dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(document.activeElement).toBe(button)
  await act(async () => { store.setDisplayDefault('literary', false); store.setDisplayOverride('BSB', 'headings', true) })
  expect(bsb.querySelector('[data-literary-kind="heading"]')).not.toBeNull()
  expect(bsb.querySelector('[data-literary-kind="poetry"]')).toBeNull()
})

it('applies the interlinear base edition’s overrides and keeps each verse selectable without its printed number', async () => {
  const store = useAppStore.getState()
  store.toggleInterlinear()
  store.setDisplayOverride('MT', 'chapterNumbers', false)
  store.setDisplayOverride('MT', 'verseNumbers', false)
  await act(async () => root.render(createElement(ReadingPanel)))
  expect(host.textContent).toMatch(/Interlinear · Psalms · base text/)
  expect(host.textContent).not.toContain('Psalms 23')
  const pick = host.querySelector<HTMLButtonElement>('[aria-label="Select verse 1"]')!
  expect(pick.dataset.label).toBe('⋯')
  await act(async () => pick.click())
  expect(useAppStore.getState()).toMatchObject({ chapter: 23, activeVerse: 1, referenceEdition: 'MT' })
  await act(async () => { store.setDisplayOverride('MT', 'chapterNumbers', null); store.setDisplayOverride('MT', 'verseNumbers', null) })
  expect(host.textContent).toContain('Psalms 23')
  expect(pick.dataset.label).toBe('1')
})
