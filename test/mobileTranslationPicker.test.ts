// @vitest-environment jsdom
import { act, createElement, Fragment } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EditionPicker, ImportedTranslationManager, ParallelPicker } from '../mobile/src/PhoneTools'
import { useAppStore } from '../src/renderer/src/store/useAppStore'
import { readerChapter } from '../src/renderer/src/lib/passage'
import type { Translation } from '../src/shared/types'

vi.mock('../mobile/src/study', () => ({ Study: {} }))
vi.mock('../mobile/src/personalApi', () => ({ hasRecoveryBackup: vi.fn(), exportRecoveryBackup: vi.fn() }))

const edition = (id: string, name: string, language = 'eng'): Translation => ({
  id, name, abbrev: id, language, direction: 'ltr', isOriginal: false,
  hasStrongs: false, license: '', attribution: ''
})
const installed = [
  edition('BSB', 'Berean Standard Bible'), edition('KJV', 'King James Version'),
  edition('WEB', 'World English Bible'), edition('ASV', 'American Standard Version'),
  edition('YLT', 'Young’s Literal Translation')
]
let host: HTMLDivElement
let root: Root
const onChoose = vi.fn(), onManageImports = vi.fn()
const picker = () => createElement(EditionPicker, { onChoose, onManageImports })
function button(label: string) {
  const match = [...host.querySelectorAll('button')].find(b =>
    b.getAttribute('aria-label') === label || b.textContent?.trim() === label)
  if (!match) throw new Error('Missing button: ' + label)
  return match
}
const click = (label: string) => act(async () => button(label).click())

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  useAppStore.persist.setOptions({ storage: { getItem: () => null, setItem() {}, removeItem() {} } })
  useAppStore.setState({ ...useAppStore.getInitialState(), translations: installed,
    primary: 'BSB', referenceEdition: 'BSB', parallels: ['BSB'], book: 'John', chapter: 3, activeVerse: 16 }, true)
  Object.assign(window, { api: {} })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.restoreAllMocks()
})

it('offers installed translation bubbles and a separate import-management action', async () => {
  const imported = edition('imp_local', 'My imported Bible', 'imported')
  useAppStore.getState().setTranslations([...installed, imported])
  await act(async () => root.render(picker()))
  expect(host.querySelectorAll('[aria-pressed]')).toHaveLength(6)
  expect(button('Berean Standard Bible (BSB)').getAttribute('aria-pressed')).toBe('true')
  expect(button('My imported Bible (imp_local)').getAttribute('aria-pressed')).toBe('false')
  expect(host.querySelector('select')).toBeNull()
  expect(host.textContent).not.toContain('Add parallel translation')
  await click('Manage imported translations')
  expect(onManageImports).toHaveBeenCalledOnce()
  expect(onChoose).not.toHaveBeenCalled()
  expect(useAppStore.getState().parallels).toEqual(['BSB'])
})

it('swaps an already-open edition without losing its parallel or changing the source verse', async () => {
  useAppStore.setState({ parallels: ['BSB', 'KJV'], book: 'Phil', chapter: 1, activeVerse: 16 })
  await act(async () => root.render(picker()))
  await click('King James Version (KJV)')
  const state = useAppStore.getState()
  expect(state.parallels).toEqual(['KJV', 'BSB'])
  expect(state).toMatchObject({ primary: 'KJV', referenceEdition: 'BSB', book: 'Phil', chapter: 1, activeVerse: 16 })
  expect(readerChapter(state.book, state.chapter, state.activeVerse, state.referenceEdition, state.primary))
    .toMatchObject({ book: 'Phil', chapter: 1, verse: 17 })
  expect(button('King James Version (KJV)').getAttribute('aria-pressed')).toBe('true')
  expect(onChoose).toHaveBeenCalledOnce()
})

it('replaces only the reading column and returns from interlinear using its existing verse anchor', async () => {
  useAppStore.setState({ parallels: ['BSB', 'KJV'], interlinear: true,
    interlinearEdition: 'NA', referenceEdition: 'NA' })
  await act(async () => root.render(picker()))
  await click('World English Bible (WEB)')
  expect(useAppStore.getState()).toMatchObject({ primary: 'WEB', parallels: ['WEB', 'KJV'], interlinear: false,
    book: 'John', chapter: 3, activeVerse: 16, referenceEdition: 'NA' })
  expect(onChoose).toHaveBeenCalledOnce()
})

it('waits for a specific parallel choice and lets Cancel leave the reader unchanged', async () => {
  useAppStore.setState({ interlinear: true, interlinearEdition: 'NA', referenceEdition: 'NA' })
  await act(async () => root.render(createElement(ParallelPicker, { onManageImports })))
  await click('Add parallel translation')
  expect(host.querySelectorAll('[aria-label="Available parallel translations"] button')).toHaveLength(4)
  expect(host.querySelector('[aria-label="Add Berean Standard Bible (BSB)"]')).toBeNull()
  expect(useAppStore.getState()).toMatchObject({ parallels: ['BSB'], interlinear: true, referenceEdition: 'NA' })
  await click('Cancel')
  expect(host.querySelector('[aria-label="Available parallel translations"]')).toBeNull()
  expect(document.activeElement).toBe(button('Add parallel translation'))
  expect(useAppStore.getState()).toMatchObject({ parallels: ['BSB'], interlinear: true })

  await click('Add parallel translation')
  const asv = button('Add American Standard Version (ASV)')
  await act(async () => { asv.click(); asv.click() })
  expect(useAppStore.getState()).toMatchObject({ parallels: ['BSB', 'ASV'], primary: 'BSB', interlinear: false,
    book: 'John', chapter: 3, activeVerse: 16, referenceEdition: 'NA' })
  expect(host.querySelector('[aria-label="Available parallel translations"]')).toBeNull()
  expect(document.activeElement).toBe(host.querySelector('[aria-label="Comparison 1"]'))
})

it('keeps removing and explicitly adding parallel editions within the four-column limit', async () => {
  const onDisplay = vi.fn()
  useAppStore.setState({ parallels: ['BSB', 'KJV', 'WEB', 'ASV'] })
  await act(async () => root.render(createElement(ParallelPicker, { onManageImports, onDisplay })))
  expect(host.querySelectorAll('select')).toHaveLength(4)
  expect(host.textContent).not.toContain('Add parallel translation')
  expect(button('Remove ASV').textContent?.trim()).toBe('Remove')
  await click('Remove ASV')
  expect(useAppStore.getState().parallels).toEqual(['BSB', 'KJV', 'WEB'])
  await click('Add parallel translation')
  expect(host.querySelectorAll('[aria-label="Available parallel translations"] button')).toHaveLength(2)
  await click('Add Young’s Literal Translation (YLT)')
  expect(useAppStore.getState().parallels).toEqual(['BSB', 'KJV', 'WEB', 'YLT'])
  expect(host.textContent).not.toContain('Add parallel translation')
  expect(host.textContent).toContain('Four translations are open. Remove one to add another.')
  expect(document.activeElement).toBe(host.querySelector('[aria-label="Comparison 3"]'))
  await act(async () => useAppStore.getState().setParallels(['BSB']))
  expect(host.querySelector('[aria-label="Remove BSB"]')).toBeNull()
  await click('Reading display')
  expect(onDisplay).toHaveBeenCalledOnce()
  expect(useAppStore.getState().parallels).toEqual(['BSB'])
  await click('Manage imported translations')
  expect(onManageImports).toHaveBeenCalledOnce()
})

it('swaps open comparison rows without duplicates and refreshes available imported choices', async () => {
  useAppStore.setState({ parallels: ['BSB', 'KJV'], book: 'Phil', chapter: 1, activeVerse: 16 })
  await act(async () => root.render(createElement(ParallelPicker)))
  const reading = host.querySelector<HTMLSelectElement>('[aria-label="Reading translation"]')!
  await act(async () => {
    reading.value = 'KJV'
    reading.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(useAppStore.getState()).toMatchObject({ primary: 'KJV', parallels: ['KJV', 'BSB'],
    book: 'Phil', chapter: 1, activeVerse: 16, referenceEdition: 'BSB' })
  await click('Add parallel translation')
  expect(host.querySelector('[aria-label="Add King James Version (KJV)"]')).toBeNull()
  expect(host.querySelector('[aria-label="Add Berean Standard Bible (BSB)"]')).toBeNull()
  const imported = edition('imp_local', 'My imported Bible', 'imported')
  await act(async () => useAppStore.getState().setTranslations([...installed, imported]))
  await click('Add My imported Bible (imp_local)')
  expect(useAppStore.getState()).toMatchObject({ primary: 'KJV', parallels: ['KJV', 'BSB', 'imp_local'], referenceEdition: 'BSB' })
})

it('refreshes the installed bubbles after an import and requires confirmation before removing it', async () => {
  const imported = edition('imp_local', 'My imported Bible', 'imported')
  const importTranslation = vi.fn().mockResolvedValue(imported)
  const deleteImportedTranslation = vi.fn().mockResolvedValue(undefined)
  const listTranslations = vi.fn().mockResolvedValue([...installed, imported])
  Object.assign(window.api, { importTranslation, deleteImportedTranslation, listTranslations })
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  await act(async () => root.render(createElement(Fragment, null, picker(), createElement(ImportedTranslationManager))))
  await click('Import a Bible module…')
  expect(importTranslation).toHaveBeenCalledOnce()
  expect(button('My imported Bible (imp_local)')).toBeTruthy()
  expect(host.querySelector('[role="status"]')?.textContent).toBe('My imported Bible imported.')
  await click('Remove My imported Bible')
  expect(confirm).toHaveBeenCalledWith('Remove My imported Bible from this device?')
  expect(deleteImportedTranslation).not.toHaveBeenCalled()
  confirm.mockReturnValue(true)
  listTranslations.mockResolvedValue(installed)
  await click('Remove My imported Bible')
  expect(deleteImportedTranslation).toHaveBeenCalledWith('imp_local')
  expect(host.querySelector('[aria-label="My imported Bible (imp_local)"]')).toBeNull()
  expect(useAppStore.getState().primary).toBe('BSB')
})
