// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TranslationPopover } from '../mobile/src/TranslationPopover'

let host: HTMLDivElement, anchor: HTMLButtonElement, outside: HTMLButtonElement, root: Root
let bounds: DOMRect
let resizeAnchor: () => void
let viewport: EventTarget & { width: number, height: number, offsetTop: number, offsetLeft: number }
const onClose = vi.fn()
const disconnect = vi.fn()
const popover = () => host.querySelector<HTMLElement>('[role="dialog"]')!
const selected = () => host.querySelector<HTMLButtonElement>('[aria-pressed="true"]')!
const pointerDown = (target: Element) => target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
async function render() {
  await act(async () => root.render(createElement(TranslationPopover, { id: 'editions', anchor, onClose },
    createElement('button', { 'aria-pressed': false }, 'KJV'),
    createElement('button', { 'aria-pressed': true }, 'BSB'))))
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div')
  anchor = document.createElement('button')
  anchor.textContent = 'BSB'
  outside = document.createElement('button')
  outside.textContent = 'Settings'
  document.body.append(anchor, host, outside)
  bounds = new DOMRect(16, 32, 80, 48)
  vi.spyOn(anchor, 'getBoundingClientRect').mockImplementation(() => bounds)
  viewport = Object.assign(new EventTarget(), { width: 390, height: 800, offsetTop: 0, offsetLeft: 0 })
  vi.stubGlobal('visualViewport', viewport)
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resizeAnchor = callback }
    observe() {}
    disconnect = disconnect
  })
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove(); anchor.remove(); outside.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('opens below the anchor with a clamped phone width and focuses the selected translation', async () => {
  await render()
  expect(popover().getAttribute('aria-label')).toBe('Translations')
  expect(popover().getAttribute('aria-modal')).toBe('false')
  expect(popover().style).toMatchObject({ top: '88px', left: '8px', width: '374px', maxHeight: '704px' })
  expect(popover().style.getPropertyValue('--popover-arrow-left')).toBe('48px')
  expect(document.activeElement).toBe(selected())
  expect(host.querySelector('dialog')).toBeNull()
  expect(host.querySelector('[aria-label="Close"]')).toBeNull()
})

it('limits wide-window size and follows anchor, viewport resize, and viewport scrolling', async () => {
  viewport.width = 1000
  bounds = new DOMRect(800, 32, 80, 48)
  await render()
  expect(popover().style).toMatchObject({ left: '552px', width: '440px' })
  bounds = new DOMRect(100, 60, 100, 48)
  await act(async () => resizeAnchor())
  expect(popover().style).toMatchObject({ top: '116px', left: '100px' })
  viewport.width = 320
  viewport.height = 400
  await act(async () => viewport.dispatchEvent(new Event('resize')))
  expect(popover().style).toMatchObject({ left: '8px', width: '304px', maxHeight: '276px' })
  viewport.offsetTop = 30
  viewport.offsetLeft = 20
  await act(async () => viewport.dispatchEvent(new Event('scroll')))
  expect(popover().style).toMatchObject({ left: '28px', maxHeight: '306px' })
  bounds = new DOMRect(80, 70, 100, 48)
  await act(async () => window.dispatchEvent(new Event('resize')))
  expect(popover().style.top).toBe('126px')
})

it('leaves the trigger and picker clickable, but dismisses once on an outside pointer', async () => {
  await render()
  const child = document.createElement('span')
  anchor.append(child)
  await act(async () => { pointerDown(child); pointerDown(selected()) })
  expect(onClose).not.toHaveBeenCalled()
  await act(async () => { pointerDown(outside); pointerDown(outside) })
  expect(onClose).toHaveBeenCalledOnce()
  outside.focus()
  await act(async () => root.render(null))
  expect(document.activeElement).toBe(outside)
})

it('handles Escape once without also triggering app Back, and returns focus to the toolbar', async () => {
  await render()
  const back = vi.fn()
  window.addEventListener('keydown', back)
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  await act(async () => {
    selected().dispatchEvent(escape)
    selected().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
  expect(escape.defaultPrevented).toBe(true)
  expect(back).not.toHaveBeenCalled()
  expect(onClose).toHaveBeenCalledOnce()
  await act(async () => root.render(null))
  expect(document.activeElement).toBe(anchor)
  expect(disconnect).toHaveBeenCalledOnce()
  window.removeEventListener('keydown', back)
})

it('restores the anchor after selection but preserves focus moved to another control', async () => {
  await render()
  await act(async () => root.render(null))
  expect(document.activeElement).toBe(anchor)
  await render()
  outside.focus()
  await act(async () => root.render(null))
  expect(document.activeElement).toBe(outside)
})

it('allows keyboard focus on the trigger but closes when focus leaves the picker and trigger', async () => {
  await render()
  await act(async () => anchor.focus())
  expect(onClose).not.toHaveBeenCalled()
  await act(async () => selected().focus())
  expect(onClose).not.toHaveBeenCalled()
  await act(async () => outside.focus())
  expect(onClose).toHaveBeenCalledOnce()
  await act(async () => root.render(null))
  expect(document.activeElement).toBe(outside)
})
