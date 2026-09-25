import { useEffect, type RefObject } from 'react'
import { useAppStore } from '@/store/useAppStore'

/** Consume a verse jump only after the current passage has rendered. */
export function useVerseNavigation(
  container: RefObject<HTMLDivElement>,
  passage: string,
  ready: boolean,
  enabled = true
): void {
  const verse = useAppStore((s) => s.scrollToVerse)
  const clearScroll = useAppStore((s) => s.clearScroll)

  useEffect(() => {
    if (container.current) container.current.scrollTop = 0
  }, [container, passage])

  useEffect(() => {
    if (!enabled || !ready || verse == null) return
    const el = container.current?.querySelector<HTMLElement>(`[data-verse="${verse}"]`)
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.classList.add('verse-flash')
      window.setTimeout(() => el.classList.remove('verse-flash'), 1600)
    }
    clearScroll()
  }, [container, passage, ready, enabled, verse, clearScroll])
}
