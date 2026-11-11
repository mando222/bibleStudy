import { useEffect, useState } from 'react'
import type { VerseVariant } from '@shared/types'

export function useApparatus(book: string, chapter: number, enabled = true): { data: VerseVariant[]; loading: boolean } {
  const [data, setData] = useState<VerseVariant[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setLoading(true)
    window.api
      .getChapterApparatus(book, chapter)
      .then((d) => {
        if (!cancelled) {
          setData(d)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData([])
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [book, chapter, enabled])

  return { data, loading }
}
