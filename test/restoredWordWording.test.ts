// @vitest-environment jsdom
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getChapter, listTranslations } from '../src/main/db/bible'
import { WordComparisonProvider } from '../src/renderer/src/components/RestoredWordComparison'
import VerseView from '../src/renderer/src/components/VerseView'
import { publishedSelection } from '../src/renderer/src/lib/scriptureSelection'
import { useAppStore } from '../src/renderer/src/store/useAppStore'
import type { VerseRef } from '../src/shared/types'

vi.mock('node:sqlite', () => {
  const sqlite = createRequire(import.meta.url)('node:sqlite')
  return { ...sqlite, default: sqlite }
})
vi.mock('electron', () => ({ app: { getAppPath: () => process.cwd() } }))

describe.skipIf(!existsSync('resources/bible.sqlite'))('published wording in restored-word previews', () => {
  let host: HTMLDivElement
  let root: Root
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    useAppStore.persist.setOptions({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } })
    useAppStore.setState({ restoreSourceWords: true, sourceFormIds: [], sourceWordTerms: {},
      translations: listTranslations() })
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  async function renderVerse(ref: VerseRef, sourceFormIds: string[] = [], splitPhraseAt?: string) {
    const verse = getChapter(ref).verses.find(v => v.verse === ref.verse)!
    let v = verse
    if (splitPhraseAt) {
      const at = verse.text.indexOf(splitPhraseAt)
      expect(at).toBeGreaterThan(0)
      // Exercise an edition layout boundary inside this verified multiword span.
      v = { ...verse, layout: [{ kind: 'line', at }] }
    }
    await act(async () => {
      useAppStore.setState({ sourceFormIds })
      const reader = createElement(VerseView, { ...ref, v, literary: true, onOpenMenu: () => {} })
      root.render(createElement(WordComparisonProvider, { children: reader, location: JSON.stringify(ref) }))
    })
    return verse.text
  }

  async function openWord(row: string) {
    const word = host.querySelector<HTMLElement>(`[data-restored-word][data-source-row="${row}"]`)!
    expect(word).toBeTruthy()
    await act(async () => {
      word.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    })
    const dialog = document.querySelector('[role="dialog"]')!
    return { word, edition: dialog.querySelector('dt')?.textContent,
      wording: dialog.querySelector('[data-study-scripture]')?.textContent }
  }

  it('leaves Hebrew name prefixes and possessives outside the preview and preserves the printed verse on copy', async () => {
    const text = await renderVerse({ translation: 'BSB', book: '1Kgs', chapter: 10, verse: 9 })
    const { word, wording, edition } = await openWord('Hebrew:224438')
    expect(word.textContent).toBe('YHWH')
    expect(word.previousElementSibling?.textContent).toBe('Because of ')
    expect(word.nextElementSibling?.textContent).toBe('’s')
    expect(edition).toBe('BSB')
    expect(wording).toBe('the LORD')
    const selection = document.createRange()
    selection.selectNodeContents(host)
    expect(publishedSelection(host, selection)?.text).toBe(text)
  })

  it('uses each translation’s printed capitalization and offers no link for an uncorroborated occurrence', async () => {
    await renderVerse({ translation: 'BSB', book: 'Gen', chapter: 2, verse: 18 })
    expect(await openWord('Hebrew:1135')).toMatchObject({ edition: 'BSB', wording: 'The LORD' })
    await renderVerse({ translation: 'KJV', book: 'Gen', chapter: 2, verse: 18 })
    expect(await openWord('Hebrew:1135')).toMatchObject({ edition: 'KJV', wording: 'the LORD' })
    await renderVerse({ translation: 'KJV', book: 'Gen', chapter: 4, verse: 16 })
    expect(host.textContent).toContain('from the presence of the LORD')
    expect(host.querySelector('[data-restored-word]')).toBeNull()
  })

  it('preserves both Greek inflections and each complete aligned English phrase across a layout break', async () => {
    await renderVerse({ translation: 'BSB', book: '1John', chapter: 2, verse: 1 }, ['G264'], 'not sin')
    const first = await openWord('Greek:199485')
    expect(first.word.textContent).toBe('ἁμάρτητε')
    expect(first.word.closest('[data-aligned-phrase]')?.querySelector('[data-aligned-english]')?.textContent).toBe('not sin')
    expect(first.wording).toBe('you will not sin')
    const second = await openWord('Greek:199489')
    expect(second.word.textContent).toBe('ἁμάρτῃ')
    expect(second.wording).toBe('does sin')
  })

  it('previews the printed verb at an Aramaic source occurrence', async () => {
    await renderVerse({ translation: 'BSB', book: 'Dan', chapter: 2, verse: 22 }, ['H1541'])
    const { word, wording } = await openWord('Aramaic:510061')
    expect(word.querySelector('bdi[lang="arc"][dir="rtl"]')?.textContent).toBe('גָּלֵ֥א')
    expect(wording).toBe('reveals')
  })
})
