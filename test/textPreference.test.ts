// @vitest-environment jsdom
import { act, createElement, Fragment } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import { defaultTextPreference, normalizeTextPreference } from '../src/shared/textPreference'
import SettingsDialog from '../src/renderer/src/components/SettingsDialog'
import TopBar from '../src/renderer/src/components/TopBar'
import { useAppStore } from '../src/renderer/src/store/useAppStore'

it('restores a complete preference for each kind of text from older or partial reader settings', () => {
  expect(normalizeTextPreference(null)).toEqual(defaultTextPreference)
  expect(normalizeTextPreference({ nt: ['BYZ', 'MT', 'BYZ'], ot: 'LXX', masoretic: ['ketiv', 'LXX'] })).toEqual({
    nt: ['BYZ', 'NA', 'TR'], ot: ['MT', 'LXX'], masoretic: ['ketiv', 'qere']
  })
  const { merge } = useAppStore.persist.getOptions()
  expect(merge!({ primary: 'YLT' }, useAppStore.getInitialState())).toMatchObject({
    primary: 'YLT', preferredTextOrder: defaultTextPreference
  })
})

it('reorders texts from global Settings, remembers them and resets the order independently of the reader selection', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  // jsdom lacks the native dialog methods provided by Electron.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { value(this: HTMLDialogElement) { this.open = true }, configurable: true },
    close: { value(this: HTMLDialogElement) { this.open = false }, configurable: true }
  })
  useAppStore.persist.setOptions({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } })
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({ activity: 'words', primary: 'YLT', interlinearEdition: 'TR' })
  const click = async (selector: string) => {
    const button = host.querySelector<HTMLButtonElement>(selector)
    if (!button) throw new Error('Missing settings control ' + selector)
    await act(async () => button.click())
  }
  try {
    await act(async () => root.render(createElement(Fragment, {}, createElement(TopBar), createElement(SettingsDialog))))
    await click('header button[aria-label="Settings"]')
    expect(host.querySelector('dialog[open]')?.textContent).toContain('Preferred text order')
    await click('button[aria-label^="Move Textus Receptus"][aria-label$="up"]')
    await click('button[aria-label^="Move Septuagint"][aria-label$="up"]')
    await click('button[aria-label^="Move Ketiv"][aria-label$="up"]')
    const state = useAppStore.getState()
    const order = { nt: ['TR', 'NA', 'BYZ'], ot: ['LXX', 'MT'], masoretic: ['ketiv', 'qere'] }
    expect(state).toMatchObject({ preferredTextOrder: order, activity: 'words', primary: 'YLT', interlinearEdition: 'TR' })
    expect(host.querySelector('button[aria-label^="Move Ketiv"][aria-label$="up"]')?.getAttribute('aria-disabled')).toBe('true')
    const { partialize, merge } = useAppStore.persist.getOptions()
    const saved = partialize!(state)
    expect(saved).not.toHaveProperty('settingsOpen')
    expect(merge!(saved, useAppStore.getInitialState()).preferredTextOrder).toEqual(order)
    await act(async () => { host.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true })) })
    expect(host.querySelector('dialog')).toBeNull()
    await click('header button[aria-label="Settings"]')
    const reset = [...host.querySelectorAll('dialog button')].find(b => b.textContent === 'Reset text order to defaults')!
    await act(async () => (reset as HTMLButtonElement).click())
    expect(useAppStore.getState()).toMatchObject({ preferredTextOrder: defaultTextPreference, interlinearEdition: 'TR' })
  } finally {
    await act(async () => root.unmount())
    host.remove()
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  }
})
