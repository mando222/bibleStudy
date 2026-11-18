// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Note } from '../src/shared/types'
import NotesPanel from '../src/renderer/src/components/NotesPanel'
import VersePopover from '../src/renderer/src/components/VersePopover'
import { VerseActions } from '../mobile/src/PhoneTools'
import { useAppStore } from '../src/renderer/src/store/useAppStore'

vi.mock('../mobile/src/personalApi', () => ({}))
vi.mock('../mobile/src/study', () => ({ Study: {} }))

const note: Note = { id: 17, book: 'John', chapter: 1, verse: 1, body: 'Saved note', createdAt: 1, updatedAt: 1 }
let host: HTMLElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value(this: HTMLDialogElement) { this.open = true } },
    close: { configurable: true, value(this: HTMLDialogElement) { this.open = false } }
  })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  sessionStorage.clear()
  vi.stubGlobal('localStorage', sessionStorage)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  useAppStore.persist.setOptions({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } })
  useAppStore.setState({ book: 'John', chapter: 1, activeVerse: 1, primary: 'KJV', referenceEdition: 'KJV', parallels: ['KJV'], interlinear: false })
  Object.assign(window, { api: {
    listNotes: async () => [note], listHighlights: async () => [],
    listAnnotations: async () => ({ notes: [note], highlights: [] }),
    deleteNote: vi.fn().mockResolvedValue(undefined), saveNote: vi.fn().mockResolvedValue(note)
  } })
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  vi.unstubAllGlobals()
})
const button = (label: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === label)!
const click = (label: string) => act(async () => button(label).click())
const change = (value: string) => act(async () => {
  const el = host.querySelector('textarea')!
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
})

it.each(['desktop', 'phone'])('%s verse actions protect a cleared note and delete only with explicit confirmation', async platform => {
  const close = vi.fn()
  const ref = { ...note, translation: 'KJV' }
  await act(async () => root.render(platform === 'phone'
    ? createElement(VerseActions, { item: { ...ref, text: 'Printed text', notes: [note] }, context: close, showOriginals: close, showRefs: close })
    : createElement(VersePopover, { ...ref, x: 20, y: 20, verseText: 'Printed text', note, onClose: close })))
  if (platform === 'desktop') expect(host.querySelector('dialog')?.open).toBe(true)
  expect(host.querySelector('textarea')?.value).toBe(note.body)
  await change('   ')
  expect(button('Save note').disabled).toBe(true)
  await click('Save note')
  expect(window.api.saveNote).not.toHaveBeenCalled()
  await click('Delete note')
  await click('Keep note')
  expect(window.api.deleteNote).not.toHaveBeenCalled()
  await click('Delete note')
  await click('Confirm delete')
  expect(window.api.deleteNote).toHaveBeenCalledTimes(1)
  expect(window.api.deleteNote).toHaveBeenCalledWith(17)
  if (platform === 'phone') expect(host.querySelector('[role=status]')?.textContent).toBe('Note deleted.')
  else expect(close).toHaveBeenCalledOnce()
})

it('recovers a chapter-note draft across switching scopes and removes it only on explicit discard or save', async () => {
  await act(async () => root.render(createElement(NotesPanel)))
  await click('Edit')
  await change('Revised')
  await click('All notes & highlights')
  await click('John 1 · KJV')
  await click('Resume draft')
  expect(host.querySelector('textarea')?.value).toBe('Revised')
  await click('Discard draft')
  await click('Edit')
  expect(host.querySelector('textarea')?.value).toBe('Saved note')
  await change('Another edit')
  await click('Save')
  expect(window.api.saveNote).toHaveBeenCalledWith(expect.objectContaining({id: 17, body: 'Another edit'}))
  expect(button('Edit')).toBeDefined()
  expect(button('Resume draft')).toBeUndefined()
})

it('locks chapter notes to the displayed native chapter while retaining its reference and editor', async () => {
  useAppStore.setState({ book: 'Ps', chapter: 9, activeVerse: 22, referenceEdition: 'LXX', primary: 'BSB', parallels: ['BSB'] })
  const listNotes = vi.fn().mockResolvedValue([{ ...note, book: 'Ps', chapter: 10 }])
  const listAnnotations = vi.fn()
  Object.assign(window.api, { listNotes, listAnnotations })
  await act(async () => root.render(createElement(NotesPanel, { initialScope: 'all', fixedScope: 'chapter' })))
  expect(host.querySelector('p')?.textContent).toBe('Psalms 10 · BSB')
  expect(button('Psalms 10 · BSB')).toBeUndefined()
  expect(button('All notes & highlights')).toBeUndefined()
  expect(host.querySelector('[aria-label="All saved notes and highlights"]')).toBeNull()
  expect(listNotes).toHaveBeenCalledWith({ book: 'Ps', chapter: 10 })
  expect(listAnnotations).not.toHaveBeenCalled()
  await click('Edit')
  expect(host.querySelector('textarea')?.value).toBe('Saved note')
})

it('locks the saved collection to all notes and preserves passage navigation', async () => {
  const listNotes = vi.fn(), onNavigate = vi.fn()
  const listAnnotations = vi.fn().mockResolvedValue({ notes: [{ ...note, book: 'Rom', chapter: 5, verse: 8 }], highlights: [] })
  Object.assign(window.api, { listNotes, listAnnotations })
  await act(async () => root.render(createElement(NotesPanel, { fixedScope: 'all', onNavigate })))
  const collection = host.querySelector('[aria-label="All saved notes and highlights"]')!
  expect(collection).not.toBeNull()
  expect(button('John 1 · KJV')).toBeUndefined()
  expect(button('All notes & highlights')).toBeUndefined()
  expect(listAnnotations).toHaveBeenCalledOnce()
  expect(listNotes).not.toHaveBeenCalled()
  const saved = [...collection.querySelectorAll('button')].find(button => button.textContent?.includes('Romans 5:8'))!
  await act(async () => saved.click())
  expect(useAppStore.getState()).toMatchObject({ book: 'Rom', chapter: 5, activeVerse: 8, referenceEdition: 'KJV' })
  expect(onNavigate).toHaveBeenCalledOnce()
})

it('keeps an initially global panel switchable when no scope lock is supplied', async () => {
  await act(async () => root.render(createElement(NotesPanel, { initialScope: 'all' })))
  expect(host.querySelector('[aria-label="All saved notes and highlights"]')).not.toBeNull()
  expect(button('All notes & highlights').getAttribute('aria-pressed')).toBe('true')
  await click('John 1 · KJV')
  expect(host.querySelector('[aria-label="All saved notes and highlights"]')).toBeNull()
  expect(button('John 1 · KJV').getAttribute('aria-pressed')).toBe('true')
  expect(button('Edit')).toBeDefined()
})

it.each(['desktop', 'phone'])('%s requires review when a different editor saved the same note after a draft', async platform => {
  let stored = { ...note }
  Object.assign(window.api, {
    listNotes: async () => [stored],
    saveNote: vi.fn(async ({ body }) => { stored = { ...stored, body }; return stored })
  })
  const chapter = () => act(async () => root.render(createElement(NotesPanel)))
  const verse = () => act(async () => {
    const close = () => {}
    const ref = { ...stored, translation: 'KJV' }
    root.render(platform === 'phone'
      ? createElement(VerseActions, { item: { ...ref, text: 'Printed text', notes: [stored] }, context: close, showOriginals: close, showRefs: close })
      : createElement(VersePopover, { ...ref, x: 20, y: 20, verseText: 'Printed text', note: stored, onClose: close }))
  })

  await chapter()
  await click('Edit')
  await change('Chapter draft')
  await verse()
  await change('New verse revision')
  await click('Save note')
  await chapter()
  await click('Resume draft')
  expect(host.querySelector('textarea')?.value).toBe('Chapter draft')
  expect(host.querySelector('[aria-label="Review saved note"]')?.textContent).toContain('New verse revision')
  expect(button('Save').disabled).toBe(true)
  await click('Save')
  expect(stored.body).toBe('New verse revision')
  await click('Continue editing my draft')
  await click('Save')
  expect(stored.body).toBe('Chapter draft')

  await verse()
  await change('Verse draft')
  await chapter()
  await click('Edit')
  await change('New chapter revision')
  await click('Save')
  await verse()
  expect(host.querySelector('textarea')?.value).toBe('Verse draft')
  expect(host.querySelector('[aria-label="Review saved note"]')?.textContent).toContain('New chapter revision')
  expect(button('Save note').disabled).toBe(true)
  await click('Continue editing my draft')
  await click('Save note')
  expect(stored.body).toBe('Verse draft')
})
