// @vitest-environment jsdom
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { createJSONStorage } from 'zustand/middleware'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReadingTools } from '../src/renderer/src/components/ReadingTools'
import { useAppStore } from '../src/renderer/src/store/useAppStore'
import { compareLayout } from '../src/renderer/src/lib/layoutComparison'
import { chooseColumn, editionDisplay, plainDisplay } from '../src/shared/readingDisplay'
import type { ChapterContent, ChapterRef, Verse } from '../src/shared/types'

const range = { edition: 'BSB', book: 'Ps', chapter: 23, firstVerse: 1 }
let host: HTMLDivElement, root: ReturnType<typeof createRoot>
let saved: Map<string, string>
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  saved = new Map()
  useAppStore.persist.setOptions({ storage: createJSONStorage(() => ({
    getItem: key => saved.get(key) ?? null, setItem: (key, value) => { saved.set(key, value) }, removeItem: key => { saved.delete(key) }
  })) })
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.getState().setParallels(['BSB', 'KJV'])
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

describe('reading display and atlas handoff', () => {
  it('swaps an already-open translation and never compares an edition against itself', () => {
    const s = useAppStore.getState()
    s.setParallels(chooseColumn(['BSB', 'KJV'], 1, 'BSB'))
    expect(useAppStore.getState().parallels).toEqual(['KJV', 'BSB'])
    s.inspectStudy({ mode: 'compare', range }); s.setParallels(['BSB', 'BSB'])
    expect(useAppStore.getState()).toMatchObject({ parallels: ['BSB'], studyInspector: null })
  })
  it('keeps an edition override independent of other switches, serializes it, and can restore the shared default', async () => {
    await act(async () => root.render(createElement(ReadingTools, { range })))
    await act(async () => host.querySelector<HTMLButtonElement>('button')!.click())
    const pick = (label: string) => [...host.querySelectorAll('label')].find(x => x.firstChild?.textContent === label)!
    const change = async (el: HTMLSelectElement, value: string) => { await act(async () => { el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })) }) }
    const all = () => useAppStore.getState()
    expect(all().displayDefaults).toEqual(plainDisplay)
    await act(async () => pick('Literary layout').querySelector('input')!.click())
    await change(pick('Apply to').querySelector('select')!, 'KJV')
    await change(pick('Literary layout').querySelector('select')!, 'off')
    expect(editionDisplay(all().displayDefaults, all().displayOverrides, 'BSB').literary).toBe(true)
    expect(editionDisplay(all().displayDefaults, all().displayOverrides, 'KJV')).toEqual(plainDisplay)
    expect(JSON.parse(saved.get('obs-app-state')!).state.displayOverrides).toEqual({ KJV: { literary: false } })
    await change(pick('Literary layout').querySelector('select')!, 'default')
    expect(all().displayOverrides).toEqual({})
  })
  it('restores older reading preferences with the same visible headings and verse and chapter numbers', async () => {
    const older = {
      displayDefaults: { literary: true, structured: false, speakers: true },
      displayOverrides: { KJV: { literary: false } },
      restoreSourceWords: true
    }
    saved.set('obs-app-state', JSON.stringify({ version: 1, state: older }))
    await useAppStore.persist.rehydrate()
    const state = useAppStore.getState()
    expect(state.restoreSourceWords).toBe(true)
    expect(state.displayDefaults).toEqual({ ...plainDisplay, literary: true, speakers: true, headings: true })
    expect(state.displayOverrides.KJV.headings).toBe(false)
    state.setDisplayDefault('headings', false)
    state.setDisplayDefault('chapterNumbers', false)
    state.setDisplayDefault('verseNumbers', false)
    await useAppStore.persist.rehydrate()
    expect(useAppStore.getState().displayDefaults).toEqual({ ...plainDisplay, literary: true, speakers: true, chapterNumbers: false, verseNumbers: false })
  })
  it('returns to a selection made in the second translation even if a person map is opened along the way', () => {
    const s = useAppStore.getState(); s.setParallels(['KJV', 'BSB']); s.inspectStudy({ mode: 'context', range })
    s.openPassageMap(range); s.openPersonMap(2479); s.returnFromAtlas()
    expect(useAppStore.getState()).toMatchObject({ activity: 'bible', referenceEdition: 'BSB', book: 'Ps', chapter: 23, activeVerse: 1, scrollToVerse: 1, parallels: ['KJV', 'BSB'], studyInspector: { mode: 'context', range } })
  })
})

it('compares each selected verse at its native address across a chapter boundary; plain, absent, and unmapped editions remain distinguishable', async () => {
  const verse = (n: number, line: boolean): Verse => ({ verse: n, text: 'example', tokens: null, ...(line ? { layout: [{ kind: 'line' as const, at: 0 }] } : {}) })
  const chapters: Record<string, Verse[]> = { 'WEB:14': [verse(23, true), verse(24, true)], 'KJV:14': [verse(23, false)], 'KJV:16': [verse(25, true)], 'JuliaSmith:14': [verse(23, false)], 'JuliaSmith:16': [verse(25, false)] }
  const get = vi.fn(async (ref: ChapterRef): Promise<ChapterContent> => ({ ...ref, bookName: 'Romans', direction: 'ltr', verses: chapters[ref.translation + ':' + ref.chapter] ?? [] }))
  const result = await compareLayout({ edition: 'WEB', book: 'Rom', chapter: 14, firstVerse: 23, lastVerse: 24 }, ['KJV', 'JuliaSmith', 'WYC', 'imp_unknown'], get)
  expect(result.map(x => x.status)).toEqual(['recorded', 'no-layout', 'unavailable', 'unverified'])
  expect(result[0].rows.map(r => [r.chapter, r.verse])).toEqual([[16, 25]])
  expect(get.mock.calls.some(([r]) => r.translation === 'imp_unknown')).toBe(false)
})
