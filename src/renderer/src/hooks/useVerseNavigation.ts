import { useEffect, useRef, type RefObject } from 'react'
import { mapPassage } from '@shared/passageMapping'
import { useAppStore } from '@/store/useAppStore'

/** Consume a verse jump only after the current passage has rendered. */
export function useVerseNavigation(
  container: RefObject<HTMLDivElement>,
  passage: string,
  ready: boolean,
  enabled = true,
  targetEdition?: string
): void {
  const verse = useAppStore((s) => s.scrollToVerse)
  const book = useAppStore((s) => s.book)
  const chapter = useAppStore((s) => s.chapter)
  const sourceEdition = useAppStore((s) => s.referenceEdition || s.primary)
  const activeVerse = useAppStore((s) => s.activeVerse)
  const pending = useRef<{ key: string; verse: number } | null>(null)
  const localVerse = verse == null ? null : targetEdition
    ? mapPassage({ book, chapter, verse }, sourceEdition, targetEdition)?.verse ?? null : verse
  const key = JSON.stringify([passage, book, chapter, sourceEdition, activeVerse])
  const clearScroll = useAppStore((s) => s.clearScroll)

  useEffect(() => {
    if (container.current) container.current.scrollTop = 0
  }, [container, passage])

  useEffect(() => {
    if (localVerse != null) pending.current = { key, verse: localVerse }
    if (!ready || pending.current?.key !== key) return
    const target = pending.current.verse
    pending.current = null
    const el = container.current?.querySelector<HTMLElement>(`[data-verse="${target}"]`)
    if (el) {
      if (enabled) el.focus({ preventScroll: true })
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.classList.add('verse-flash')
      window.setTimeout(() => el.classList.remove('verse-flash'), 1600)
    }
    if (enabled) clearScroll()
  }, [container, key, ready, enabled, localVerse, clearScroll])
}
