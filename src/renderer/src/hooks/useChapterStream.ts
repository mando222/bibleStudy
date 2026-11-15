import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { BOOKS, BOOKS_CHRONO } from '@shared/books'
import type { ChapterRef } from '@shared/types'
import { activeChapter, readerViewKey, savePosition, visibleVerse } from '@/lib/readingPosition'
import { useAppStore } from '@/store/useAppStore'
import { useStudyQuery } from './useStudyQuery'

type Chapter = Pick<ChapterRef, 'book' | 'chapter'>
export const chapterKey = (r: Chapter) => r.book + '/' + r.chapter

/** Each edition can omit chapters, and some have numbering beyond the English canon. */
export function useReadingSequence(edition: string, interlinear: boolean) {
  const chronological = useAppStore(s => s.chronological)
  const load = useCallback(() => window.api.listReadingChapters(edition, interlinear), [edition, interlinear])
  const { data } = useStudyQuery(load, !!edition)
  return useMemo(() => {
    const order = new Map((chronological ? BOOKS_CHRONO : BOOKS).map((b, i) => [b.id, i]))
    return data?.filter(r => order.has(r.book)).sort((a, b) => order.get(a.book)! - order.get(b.book)! || a.chapter - b.chapter) ?? []
  }, [data, chronological])
}

/** A sliding three-chapter window. Keep the visible passage stationary when the chapter
 * above it loads, changes height, or falls out of the window. */
export function useChapterStream(container: RefObject<HTMLDivElement>, ref: ChapterRef, interlinear: boolean,
  onEnter?: (ref: Chapter) => void) {
  const sequence = useReadingSequence(ref.translation, interlinear)
  const current = chapterKey(ref)
  const index = sequence.findIndex(r => chapterKey(r) === current)
  const candidates = index < 0 ? [ref] : sequence.slice(Math.max(index - 1, 0), index + 2)
  const [buffered, setBuffered] = useState<string[]>([])
  const pages = candidates.filter(r => chapterKey(r) === current || buffered.includes(chapterKey(r)))
  const previousPage = index > 0 ? sequence[index - 1] : null
  const nextPage = index >= 0 ? sequence[index + 1] : null
  const windowKey = pages.map(chapterKey).join('|')
  const active = ref.translation + '/' + current
  const previous = useRef<{ active: string; height: number }>()
  const crossing = useRef<{ active: string; scroll: number; selectedVerse?: number }>()
  const userScroll = useRef(false)
  const visit = useAppStore(s => s.readerVisit)
  useLayoutEffect(() => { userScroll.current = false }, [visit])

  function bufferNearby() {
    const el = container.current
    if (!el?.clientHeight) return
    const block = activeChapter(el)
    if (!block.querySelector('[data-verse]')) return
    const bounds = block.getBoundingClientRect(), view = el.getBoundingClientRect()
    const preload = el.clientHeight * 1.5
    const wanted = [current]
    if (previousPage && (view.top - bounds.top < preload || buffered.includes(chapterKey(previousPage))))
      wanted.unshift(chapterKey(previousPage))
    if (nextPage && (bounds.bottom - view.bottom < preload || buffered.includes(chapterKey(nextPage))))
      wanted.push(chapterKey(nextPage))
    if (wanted.join('|') !== buffered.join('|')) setBuffered(wanted)
  }

  useLayoutEffect(() => {
    const el = container.current
    if (!el) return
    const preceding = el.querySelector<HTMLElement>('[data-flow-before]')
    const reconcile = () => {
      const height = preceding?.offsetHeight ?? 0
      if (previous.current?.active !== active) {
        const resume = crossing.current?.active === active ? crossing.current : null
        el.scrollTop = height + (resume?.scroll ?? 0)
        if (!resume) userScroll.current = false
        if (resume?.selectedVerse != null) el.dataset.readerAnchor = String(resume.selectedVerse)
        else delete el.dataset.readerAnchor
        crossing.current = undefined
      } else if (height !== previous.current.height) {
        el.scrollTop += height - previous.current.height
      }
      previous.current = { active, height }
    }
    reconcile()
    bufferNearby()
    const observer = new ResizeObserver(() => { reconcile(); bufferNearby() })
    if (preceding) observer.observe(preceding)
    observer.observe(activeChapter(el))
    observer.observe(el)
    return () => observer.disconnect()
  }, [container, active, windowKey, sequence, buffered])

  function enter(page: Chapter, verse: number, selected: boolean) {
    const el = container.current
    if (!el) return
    const key = chapterKey(page)
    const block = el.querySelector<HTMLElement>(`[data-flow-chapter="${key}"]`)
    const state = useAppStore.getState()
    const relative = block ? el.getBoundingClientRect().top - block.getBoundingClientRect().top : 0
    if (key !== current) crossing.current = { active: ref.translation + '/' + key, scroll: relative, selectedVerse: selected ? verse : undefined }
    if (selected) userScroll.current = false
    onEnter?.(page)
    state.focusVerse(page.book, page.chapter, verse, ref.translation)
    if (selected) el.dataset.readerAnchor = String(verse)
    if (el.clientHeight && !el.closest('[hidden]')) savePosition({ ...page, verse, translation: ref.translation, scroll: Math.max(0, relative),
      interlinear, viewKey: readerViewKey(useAppStore.getState()) })
  }

  function crossBoundary() {
    bufferNearby()
    const el = container.current
    if (!el || !userScroll.current || crossing.current || !el.clientHeight || el.closest('[hidden]')) return false
    // A newly fetched chapter above the viewport can reflow between an input event and
    // the ResizeObserver delivery. Wait for compensation before interpreting the scroll.
    const measured = el.querySelector<HTMLElement>('[data-flow-before]')?.offsetHeight ?? 0
    if (previous.current?.height !== measured) return false
    const top = el.getBoundingClientRect().top
    const blocks = [...el.querySelectorAll<HTMLElement>('[data-flow-chapter]')]
    const block = blocks.find(b => b.getBoundingClientRect().bottom > top + 1)
    if (!block || block.dataset.flowChapter === current) return false
    const page = pages.find(r => chapterKey(r) === block.dataset.flowChapter)
    const verse = visibleVerse(block, top)
    if (!page || verse == null) return false
    enter(page, verse, false)
    return true
  }
  return { pages, enter, crossBoundary, input: () => { userScroll.current = true } }
}
