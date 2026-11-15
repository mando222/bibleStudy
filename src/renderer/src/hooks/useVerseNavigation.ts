import { useEffect, useRef, type RefObject } from 'react'
import type { ChapterRef } from '@shared/types'
import { mapPassage } from '@shared/passageMapping'
import { activeChapter } from '@/lib/readingPosition'
import { useAppStore } from '@/store/useAppStore'

/** Consume a verse jump only after the current passage has rendered. */
export function useVerseNavigation(
  container: RefObject<HTMLDivElement>,
  rendered: ChapterRef,
  ready: boolean,
  enabled = true,
  continuous = false
): void {
  const verse = useAppStore((s) => s.scrollToVerse)
  const book = useAppStore((s) => s.book)
  const chapter = useAppStore((s) => s.chapter)
  const sourceEdition = useAppStore((s) => s.referenceEdition || s.primary)
  const activeVerse = useAppStore((s) => s.activeVerse)
  const pending = useRef<{ key: string; verse: number } | null>(null)
  const target = verse == null ? null : mapPassage({ book, chapter, verse }, sourceEdition, rendered.translation)
  // Store navigation can arrive before the parent commits its new column props.
  const localVerse = target?.book === rendered.book && target.chapter === rendered.chapter ? target.verse : null
  const passage = JSON.stringify([rendered.translation, rendered.book, rendered.chapter])
  const key = JSON.stringify([passage, book, chapter, sourceEdition, activeVerse])
  const clearScroll = useAppStore((s) => s.clearScroll)

  useEffect(() => {
    if (container.current && !continuous) {
      delete container.current.dataset.readerAnchor
      container.current.scrollTop = 0
    }
  }, [container, passage, continuous])

  useEffect(() => {
    if (localVerse != null) pending.current = { key, verse: localVerse }
    if (!ready || pending.current?.key !== key) return
    const target = pending.current.verse
    pending.current = null
    const el = container.current && activeChapter(container.current).querySelector<HTMLElement>(`[data-verse="${target}"]`)
    if (el) {
      if (container.current) container.current.dataset.readerAnchor = String(target)
      if (enabled) el.focus({ preventScroll: true })
      if (import.meta.env.VITE_STUDY_MOBILE === 'true' && container.current) {
        // Scrolling the individual column keeps a parallel jump from moving its horizontal strip.
        container.current.scrollTop += el.getBoundingClientRect().top - container.current.getBoundingClientRect().top - 12
      } else {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
      el.classList.add('verse-flash')
      window.setTimeout(() => el.classList.remove('verse-flash'), 1600)
    }
    if (enabled) clearScroll()
  }, [container, key, ready, enabled, localVerse, clearScroll])
}
