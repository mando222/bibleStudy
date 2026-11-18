// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LibraryHome } from '../mobile/src/LibraryHome'

vi.mock('../mobile/src/study', () => ({ Study: {} }))
vi.mock('../mobile/src/personalApi', () => ({ hasRecoveryBackup: vi.fn(), exportRecoveryBackup: vi.fn() }))

let host: HTMLDivElement, root: Root
const onNavigate = vi.fn(), onAnnotations = vi.fn()
const button = (label: string) => {
  const node = [...host.querySelectorAll('button')].find(node => node.querySelector('strong')?.textContent === label)
  if (!node) throw new Error(`Missing library action: ${label}`)
  return node
}

beforeEach(async () => {
  vi.clearAllMocks()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root.render(createElement(LibraryHome, { onNavigate, onAnnotations })))
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

it('routes each broad study destination and opens saved annotations directly', async () => {
  for (const [label, page] of [['Atlas', 'maps'], ['People', 'genealogies'], ['Timeline', 'timelines'],
    ['Languages', 'learn'], ['Notebook', 'notebook']]) {
    await act(async () => button(label).click())
    expect(onNavigate).toHaveBeenLastCalledWith(page)
  }
  expect(onNavigate).toHaveBeenCalledTimes(5)
  expect(onAnnotations).not.toHaveBeenCalled()
  await act(async () => button('All notes & highlights').click())
  expect(onAnnotations).toHaveBeenCalledOnce()
  expect(onNavigate).toHaveBeenCalledTimes(5)
})

it('keeps Library to six destinations without duplicate reader or settings controls', () => {
  expect(host.querySelector('.library-description')?.textContent).toBe('Explore Scripture and browse your saved study.')
  expect([...host.querySelectorAll('h2')].map(node => node.textContent)).toEqual(['Explore Scripture', 'My study'])
  expect(host.querySelectorAll('button')).toHaveLength(6)
  for (const duplicate of ['Chapter notes', 'Current chapter', 'Translations', 'Bookmarks', 'History', 'Files', 'Settings']) {
    expect(host.textContent).not.toContain(duplicate)
  }
  expect(button('All notes & highlights').textContent).toContain('across the Bible')
})
