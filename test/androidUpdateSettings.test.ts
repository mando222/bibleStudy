// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AndroidUpdates, { AndroidUpdateNotice } from '../mobile/src/AndroidUpdates'
import type { DownloadState } from '../mobile/src/updateService'

const bridge = vi.hoisted(() => ({
  status: vi.fn(), download: vi.fn(), install: vi.fn(), check: vi.fn(), cached: vi.fn(),
  addListener: vi.fn(), removeListener: vi.fn()
}))
vi.mock('../mobile/node_modules/@capacitor/app', () => ({
  App: { getInfo: async () => ({version: '0.4.2'}), addListener: bridge.addListener }
}))
vi.mock('../mobile/src/updateService', () => ({
  apkUpdater: {getStatus: bridge.status, download: bridge.download, install: bridge.install},
  cachedUpdate: bridge.cached, checkAndroidUpdates: bridge.check, autoChecksEnabled: () => false, setAutoChecks: vi.fn()
}))

const update = {version: '0.4.3', url:'https://github.com/mando222/bibleStudy/releases/download/v0.4.3/Open-Bible-Study-Android-0.4.3.apk'}
let state: DownloadState
let host: HTMLElement
let root: Root
let resume: () => void
const button = (label: string) => [...host.querySelectorAll('button')].find(b => b.textContent === label)
const click = async (label: string) => {
  const action = button(label)
  expect(action, label).toBeDefined()
  await act(async () => action!.click())
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT:true})
  vi.stubGlobal('localStorage', sessionStorage)
  localStorage.clear()
  state = { phase:'idle', canInstall:false }
  bridge.status.mockImplementation(async () => state)
  bridge.addListener.mockImplementation(async (_: string, cb: () => void) => {
    resume = cb
    return { remove: bridge.removeListener }
  })
  bridge.check.mockResolvedValue(update)
  bridge.download.mockImplementation(async () => {
    state = {phase:'downloading', version:update.version, received:50, total:100, canInstall:false}
    return state
  })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
const open = async () => act(async () => root.render(createElement(AndroidUpdates)))

it('downloads on request, reports progress, and can hand off after the Android permission screen', async () => {
  await open()
  expect(bridge.check).not.toHaveBeenCalled()
  await click('Check now')
  expect(bridge.check).toHaveBeenCalledWith(true)
  expect(bridge.download).not.toHaveBeenCalled()
  await click('Download update')
  expect(bridge.download).toHaveBeenCalledWith(update)
  expect(host.querySelector('a')).toBeNull()
  expect(host.querySelector('progress')?.value).toBe(50)
  state = {phase:'ready', version:update.version, canInstall:false}
  await act(async () => vi.advanceTimersByTimeAsync(1000))
  expect(bridge.install).not.toHaveBeenCalled()
  bridge.install.mockResolvedValue({action:'permission'})
  await click('Allow installation')
  state = {...state, canInstall:true}
  await act(async () => resume())
  bridge.install.mockResolvedValue({action:'installer'})
  await click('Install update')
  expect(bridge.install).toHaveBeenCalledTimes(2)
})

it('recovers a ready installer after reopening settings offline with launch checks off', async () => {
  state = {phase:'ready', version:update.version, canInstall:true}
  await open()
  expect(host.textContent).toContain('0.4.3 is ready')
  expect(bridge.check).not.toHaveBeenCalled()
  expect(bridge.download).not.toHaveBeenCalled()
  await click('Install update')
  expect(bridge.install).toHaveBeenCalledOnce()
})

it('can retry a failed transfer after reopening without a cached GitHub response', async () => {
  state = {phase:'failed', ...update, message:'Connection interrupted.', canInstall:true}
  await open()
  expect(host.querySelector('[role=alert]')?.textContent).toContain('Connection interrupted')
  await click('Retry download')
  expect(bridge.download).toHaveBeenCalledWith(update)
  expect(bridge.check).not.toHaveBeenCalled()
  expect(host.querySelector('[role=alert]')).toBeNull()
})

it('can check again after a network error and download a newer release over an older staged APK', async () => {
  state = {phase:'ready', version:'0.4.3', canInstall:true}
  const newer = {version:'0.4.4', url:update.url.replaceAll('0.4.3', '0.4.4')}
  bridge.check.mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(newer)
  await open()
  await click('Check now')
  expect(host.textContent).toContain('Could not check for updates')
  expect(button('Install update')).toBeDefined()
  await click('Check now')
  expect(host.textContent).toContain('Android 0.4.4 is available.')
  await click('Download update')
  expect(bridge.download).toHaveBeenCalledWith(newer)
})

it('the launch notice opens the updater without navigating away or starting a download', async () => {
  const openUpdates = vi.fn()
  await act(async () => root.render(createElement(AndroidUpdateNotice, {openUpdates})))
  expect(host.querySelector('a')).toBeNull()
  await click('Android 0.4.3 available · View update')
  expect(openUpdates).toHaveBeenCalledOnce()
  expect(bridge.download).not.toHaveBeenCalled()
})
