// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => {
  const records = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value),
    removeItem: (key: string) => records.delete(key)
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', '/')
  vi.resetModules()
})

it('leaves the main window’s updated chat and passage intact when a detached file is selected', async () => {
  const { useAppStore: main } = await import('../src/renderer/src/store/useAppStore')
  main.getState().setActiveNotebookFile('First.md')
  window.history.replaceState({}, '', '/?window=notebook')
  vi.resetModules()
  const { useAppStore: detached } = await import('../src/renderer/src/store/useAppStore')
  expect(detached.getState().activeNotebookFile).toBe('First.md')
  main.getState().setChatMessages([{ role: 'user', content: 'A new study question' }])
  main.getState().goTo('Gen', 2)
  detached.getState().setActiveNotebookFile('Second.md')
  window.history.replaceState({}, '', '/')
  vi.resetModules()
  const { useAppStore: restarted } = await import('../src/renderer/src/store/useAppStore')
  expect(restarted.getState().chatMessages).toEqual([{ role: 'user', content: 'A new study question' }])
  expect(restarted.getState().book).toBe('Gen')
  expect(restarted.getState().activeNotebookFile).toBe('First.md')
})

it('repairs all reading columns when the active imported translation disappears', async () => {
  const { useAppStore: store } = await import('../src/renderer/src/store/useAppStore')
  store.setState({ primary: 'imp_old', parallels: ['imp_old', 'WEB', 'imp_removed'], referenceEdition: 'imp_old' })
  const base = { abbrev: '', name: '', language: 'eng', direction: 'ltr' as const, isOriginal: false, hasStrongs: false, license: '', attribution: '' }
  store.getState().setTranslations([{ ...base, id: 'KJV' }, { ...base, id: 'WEB' }])
  expect(store.getState().parallels).toEqual(['WEB'])
  expect(store.getState().primary).toBe('WEB')
  expect(store.getState().referenceEdition).toBe('WEB')
})
