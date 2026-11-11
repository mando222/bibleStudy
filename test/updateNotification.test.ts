// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../src/renderer/src/App'
import { useAppStore } from '../src/renderer/src/store/useAppStore'
import type { UpdateInfo, UpdatesApi } from '../src/shared/types'

vi.mock('@/components/ChatDrawer', () => ({ default: () => null }))
vi.mock('@/components/NotebookDrawer', () => ({ default: () => null }))
vi.mock('@/components/WordsView', () => ({ default: () => null }))

const release: UpdateInfo = {
  current: '0.4.0', latest: '0.4.1', notes: '', assetName: 'installer.dmg',
  releaseUrl: 'https://github.com/mando222/bibleStudy/releases/tag/v0.4.1',
  downloadUrl: 'https://github.com/mando222/bibleStudy/releases/download/v0.4.1/installer.dmg'
}
let root: Root
let host: HTMLDivElement
const check = vi.fn<UpdatesApi['check']>()
const download = vi.fn<UpdatesApi['download']>()
const openDownload = vi.fn<UpdatesApi['openDownload']>()
const dismiss = vi.fn<UpdatesApi['dismiss']>()
const offer = () => host.querySelector('[aria-label="Available update"]')

beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Object.assign(window, {
    api: { version: async () => release.current, addHistory: async () => {}, listTranslations: async () => [] },
    updates: {
      check, download, openDownload, dismiss, getPrefs: async () => ({ checkOnLaunch: false }),
      onProgress: () => () => {}
    }
  })
  useAppStore.persist.setOptions({ storage: { getItem: () => null, setItem() {}, removeItem() {} } })
  useAppStore.setState({ ...useAppStore.getInitialState(), activity: 'words' }, true)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root.render(createElement(App)))
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
})

async function clickButton(label: string): Promise<void> {
  const button = [...host.querySelectorAll('button')].find(b =>
    b.title === label || b.textContent?.trim() === label || b.getAttribute('aria-label') === label)
  expect(button, label).toBeDefined()
  await act(async () => button!.click())
}

async function showManualOffer(): Promise<void> {
  await clickButton('About & credits')
  await clickButton('Check now')
  expect(host.querySelector('[role="status"]')?.textContent).toContain('Version 0.4.1 is available')
  await clickButton('View download options')
  expect(useAppStore.getState().aboutOpen).toBe(false)
  expect(document.activeElement).toBe(offer())
}

it('offers both download actions after a manual check, including after dismissal with launch checks off', async () => {
  check.mockImplementation(async force => force ? release : null)
  download.mockResolvedValue({ ok: true, path: '/Downloads/installer.dmg' })
  await act(async () => vi.advanceTimersByTimeAsync(3000))
  expect(check.mock.calls).toEqual([[]])
  expect(offer()).toBeNull()

  await showManualOffer()
  await clickButton('In browser')
  expect(openDownload).toHaveBeenCalledWith(release.downloadUrl)
  await clickButton('Dismiss update')
  expect(dismiss).toHaveBeenCalledWith(release.latest)
  expect(offer()).toBeNull()
  await showManualOffer()
  expect(check.mock.calls).toEqual([[], [true], [true]])
  await clickButton('Download')
  expect(download).toHaveBeenCalledWith(release.downloadUrl, release.assetName)
  expect(offer()?.textContent).toContain('Saved to Downloads')
})

it('preserves a running download when the reader dismisses and reopens the update', async () => {
  check.mockResolvedValue(release)
  let finishDownload!: (result: { ok: true; path: string }) => void
  download.mockImplementation(() => new Promise(resolve => { finishDownload = resolve }))
  await showManualOffer()
  await clickButton('Download')
  await clickButton('Dismiss update')
  expect(offer()).toBeNull()
  await showManualOffer()
  expect(offer()?.textContent).toContain('Cancel')
  expect(download).toHaveBeenCalledTimes(1)
  await act(async () => finishDownload({ ok: true, path: '/Downloads/installer.dmg' }))
  expect(offer()?.textContent).toContain('Saved to Downloads')
})

it('distinguishes a failed manual check from a confirmed current version', async () => {
  check.mockRejectedValueOnce(new Error('HTTP 403')).mockResolvedValueOnce(null)
  await clickButton('About & credits')
  await clickButton('Check now')
  expect(host.querySelector('[role="status"]')?.textContent).toContain('Couldn’t check the latest release')
  await clickButton('Check now')
  expect(host.querySelector('[role="status"]')?.textContent).toBe('You’re on the latest version.')
  expect(offer()).toBeNull()
})

it('keeps a manual result when an older launch response arrives later', async () => {
  let finishLaunch!: (release: UpdateInfo) => void
  check.mockImplementationOnce(() => new Promise(resolve => { finishLaunch = resolve }))
  check.mockResolvedValueOnce(release)
  await act(async () => vi.advanceTimersByTimeAsync(3000))
  await clickButton('About & credits')
  await clickButton('Check now')
  await act(async () => finishLaunch({ ...release, latest: '0.4.0' }))
  await clickButton('View download options')
  expect(offer()?.textContent).toContain('Version 0.4.1 is available')
})
