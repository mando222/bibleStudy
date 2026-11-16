import { useLayoutEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'

/** Keep portalled panels, native form controls, and the host reader on the same theme. */
export function useTheme() {
  const theme = useAppStore(s => s.theme)
  useLayoutEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.classList.toggle('eink', theme === 'eink')
    root.style.colorScheme = theme === 'dark' ? 'dark' : 'light'
  }, [theme])
  return theme
}
