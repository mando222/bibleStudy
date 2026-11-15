// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ChatDrawer from '../src/renderer/src/components/ChatDrawer'
import { useAppStore } from '../src/renderer/src/store/useAppStore'
import type { AiStatus } from '../src/shared/types'

let host: HTMLDivElement
let root: Root
const model = { available: true, activeProvider: 'bundled', config: { chatTier: 'auto' },
  installedTiers: ['balanced'], setupModelLabel: 'Balanced model', setupDownloadBytes: 2_103_484_320 } as AiStatus
const button = (label: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === label)!
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Object.assign(HTMLElement.prototype, { scrollTo: vi.fn() })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  useAppStore.persist.setOptions({ storage: { getItem: () => null, setItem() {}, removeItem() {} } })
  useAppStore.setState({ ...useAppStore.getInitialState(), assistantOpen: true }, true)
  Object.assign(window, { ai: {
    status: async () => model, listDocuments: async () => [], indexStatus: async () => ({}),
    onToken: () => () => {}, onIndexProgress: () => () => {}, onSetupProgress: () => () => {}
  } })
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})
it('clears only after stopping the existing conversation and starts the next turn with a fresh ID', async () => {
  let finish!: () => void
  const chat = vi.fn(() => new Promise<void>(done => { finish = done }))
  const stop = vi.fn()
  Object.assign(window.ai, { chat, stop })
  await act(async () => root.render(createElement(ChatDrawer)))
  const send = async () => {
    const input = host.querySelector('textarea')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, 'Study this')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
  }
  await send()
  const originalId = (chat.mock.calls[0] as unknown[])[0]
  await act(async () => button('Clear').click())
  await act(async () => button('Stop').click())
  expect(stop.mock.calls).toEqual([[originalId], [originalId]])
  await act(async () => finish())
  expect(button('Clear')).toBeUndefined()
  await send()
  expect((chat.mock.calls[1] as unknown[])[0]).not.toBe(originalId)
  await act(async () => finish())
})
it('discloses the transfer before setup and lets the reader cancel without starting indexing', async () => {
  let reject!: (e: Error) => void
  const setup = vi.fn(() => new Promise((_, no) => { reject = no }))
  const cancel = vi.fn(async () => { reject(new Error('Download cancelled')) })
  const buildBibleIndex = vi.fn()
  Object.assign(window.ai, { status: async () => ({ ...model, available: false, activeProvider: 'none' }),
    setupBundled: setup, cancelSetup: cancel, buildBibleIndex })
  await act(async () => root.render(createElement(ChatDrawer)))
  expect(host.textContent).toContain('2.10 GB')
  expect(setup).not.toHaveBeenCalled()
  await act(async () => button('Set up the assistant').click())
  await act(async () => button('Cancel download').click())
  expect(host.textContent).toContain('Download cancelled')
  expect(buildBibleIndex).not.toHaveBeenCalled()
})
