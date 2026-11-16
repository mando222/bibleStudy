// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import ThemeSelect from '../src/renderer/src/components/ThemeSelect'
import { useTheme } from '../src/renderer/src/hooks/useTheme'
import { useAppStore } from '../src/renderer/src/store/useAppStore'

it('remembers the e-ink choice and removes its document styles when the reader switches back', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const recorded = new Map()
  useAppStore.persist.setOptions({ storage: {
    getItem: key => recorded.get(key) ?? null,
    setItem: (key, value) => { recorded.set(key, value) },
    removeItem: key => { recorded.delete(key) }
  } })
  const container = document.createElement('div')
  const root = createRoot(container)
  const html = document.documentElement

  function Appearance() {
    useTheme()
    return createElement(ThemeSelect)
  }
  try {
    await act(async () => root.render(createElement(Appearance)))
    const select = container.querySelector('select')!
    for (const theme of ['eink', 'dark', 'light']) {
      await act(async () => {
        select.value = theme
        select.dispatchEvent(new Event('change', { bubbles: true }))
      })
      const { merge, name } = useAppStore.persist.getOptions()
      expect(merge!(recorded.get(name).state, useAppStore.getInitialState()).theme).toBe(theme)
      expect(html.classList.contains('eink')).toBe(theme === 'eink')
      expect(html.classList.contains('dark')).toBe(theme === 'dark')
      expect(html.style.colorScheme).toBe(theme === 'dark' ? 'dark' : 'light')
    }
  } finally {
    await act(async () => root.unmount())
    html.style.removeProperty('color-scheme')
  }
})
