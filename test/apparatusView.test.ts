// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defaultTextPreference, textEditionLabels } from '../src/shared/textPreference'
import type { GreekReading, OriginalVerseReadings, VerseVariant } from '../src/shared/apparatus'
import ApparatusPanel from '../src/renderer/src/components/ApparatusPanel'
import OriginalVerseComparison from '../src/renderer/src/components/OriginalVerseComparison'
import { useAppStore } from '../src/renderer/src/store/useAppStore'

let host: HTMLDivElement, root: Root
const readVerse = vi.fn<() => Promise<OriginalVerseReadings>>()
const readChapter = vi.fn<() => Promise<VerseVariant[]>>()
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  useAppStore.persist.setOptions({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } })
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({ book: 'John', chapter: 1, activeVerse: 18, referenceEdition: 'BSB' })
  readChapter.mockReset()
  readVerse.mockReset()
  Object.assign(window, { api: { getOriginalVerseReadings: readVerse, getChapterApparatus: readChapter } })
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

const button = (name: string) => [...host.querySelectorAll('button')].find(b => b.textContent === name)!
const reading = (surface: string): GreekReading => ({ words: [{ surface, strongs: null, translit: null, gloss: null }], nativeRefs: ['1:18'] })

it('orders the verse and chapter comparisons independently of the active translation and only fetches the requested verse on demand', async () => {
  const readings = { NA: reading('θεὸς'), TR: reading('υἱός'), BYZ: reading('υἱός') }
  readChapter.mockResolvedValue([{ kind: 'greek', verse: 18, readings, commonStart: 0, commonEnd: 0 }])
  readVerse.mockResolvedValue({ kind: 'greek', ref: { book: 'John', chapter: 1, verse: 18 }, readings })
  await act(async () => root.render(createElement(ApparatusPanel)))
  expect(readVerse).not.toHaveBeenCalled()
  expect([...host.querySelectorAll('dt')].map(el => el.textContent)).toEqual(defaultTextPreference.nt.map(id => textEditionLabels[id]))
  await act(async () => button('Compare source texts').click())
  expect(readVerse).toHaveBeenCalledWith({ book: 'John', chapter: 1, verse: 18, translation: 'BSB' })
  const order = ['BYZ', 'NA', 'TR'] as const
  await act(async () => useAppStore.getState().setPreferredTextOrder({ ...defaultTextPreference, nt: [...order] }))
  for (const list of host.querySelectorAll('dl')) {
    expect([...list.querySelectorAll('dt')].map(el => el.textContent)).toEqual(order.map(id => textEditionLabels[id]))
    expect([...list.querySelectorAll('[lang=grc]')].map(el => el.textContent)).toEqual(['υἱός', 'θεὸς', 'υἱός'])
  }
  expect(useAppStore.getState().referenceEdition).toBe('BSB')
  expect(readVerse).toHaveBeenCalledTimes(1)
  expect(readChapter).toHaveBeenCalledTimes(1)
})

it('retries a failed request and keeps missing or unverified readings distinct from textual agreement', async () => {
  readVerse.mockRejectedValueOnce(new Error('unable to query')).mockResolvedValue({
    kind: 'greek', ref: { book: 'John', chapter: 1, verse: 18 },
    readings: { TR: { ...reading('υἱός'), orderStatus: 'unverified', nativeRefs: [] } }
  })
  await act(async () => root.render(createElement(OriginalVerseComparison, { book: 'John', chapter: 1, verse: 18, translation: 'BSB' })))
  await act(async () => button('Compare source texts').click())
  expect(host.textContent).not.toContain('same sequence')
  await act(async () => button('Source texts unavailable · Retry').click())
  expect(host.textContent).toContain('Edition word order unverified')
  expect(host.textContent).toContain('Edition numbering unavailable')
  expect(host.textContent?.match(/No reading recorded/g)).toHaveLength(2)
  expect(host.textContent).not.toContain('same sequence')
})

it('lists the Greek translation independently and orders a documented Hebrew pair without assigning a lexical ID to the written form', async () => {
  const ref = { book: '1Chr', chapter: 1, verse: 11 }
  const pair = { ketiv: 'לוּדִיִּים', qere: 'לוּדִ֧ים', qereStrongs: 'H3866' }
  useAppStore.setState({ ...ref, activeVerse: ref.verse })
  useAppStore.getState().setPreferredTextOrder({ ...defaultTextPreference, ot: ['LXX', 'MT'], masoretic: ['ketiv', 'qere'] })
  readChapter.mockResolvedValue([{ kind: 'masoretic', verse: ref.verse, pairs: [pair] }])
  readVerse.mockResolvedValue({ kind: 'ot', ref,
    mt: { words: [{ surface: pair.qere, sourceType: 'Q(K)' }], nativeRefs: ['1:11'], pairs: [pair] },
    lxx: { ref, text: 'Λουδιιμ' } })
  await act(async () => root.render(createElement(ApparatusPanel)))
  await act(async () => button('Compare source texts').click())
  expect([...host.querySelectorAll('dt')].map(el => el.textContent)).toEqual([textEditionLabels.LXX, textEditionLabels.MT])
  const details = host.querySelector('details')!
  expect(details.textContent!.indexOf('Ketiv (written)')).toBeLessThan(details.textContent!.indexOf('Qere (read)'))
  expect([...details.querySelectorAll('button')].some(b => b.textContent === pair.ketiv)).toBe(false)
  expect([...details.querySelectorAll('button')].some(b => b.textContent === pair.qere)).toBe(true)
  expect(host.querySelector('[lang=grc]')?.textContent).toBe('Λουδιιμ')
  expect(host.textContent).toContain('TAHOT reading text')
})
