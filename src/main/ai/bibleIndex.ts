import { allVerses } from '../db/bible'
import { embed } from './ollama'
import { getConfig } from './config'
import { addBibleVerses, indexedVerseKeys, indexedCount } from './vectors'
import type { AiIndexStatus } from '../../shared/types'

let building = false

export function indexStatus(translation: string): AiIndexStatus {
  return { bibleIndexed: indexedCount(translation), bibleTotal: 31102, building }
}

/** Embed all verses of a translation (resumable) so the Bible can be searched semantically. */
export async function buildBibleIndex(
  translation: string,
  onProgress: (s: AiIndexStatus) => void
): Promise<void> {
  if (building) return
  building = true
  try {
    const verses = allVerses(translation)
    const done = indexedVerseKeys(translation)
    const todo = verses.filter((v) => !done.has(`${v.book}:${v.chapter}:${v.verse}`))
    const cfg = getConfig()
    const BATCH = 64
    let indexed = done.size
    onProgress({ bibleIndexed: indexed, bibleTotal: verses.length, building: true })
    for (let i = 0; i < todo.length; i += BATCH) {
      const batch = todo.slice(i, i + BATCH)
      const vecs = await embed(cfg.baseUrl, cfg.embedModel, batch.map((v) => v.text))
      if (vecs.length === batch.length) {
        addBibleVerses(
          translation,
          batch.map((v, j) => ({ ...v, embedding: vecs[j] }))
        )
      }
      indexed += batch.length
      onProgress({ bibleIndexed: indexed, bibleTotal: verses.length, building: true })
    }
    onProgress({ bibleIndexed: verses.length, bibleTotal: verses.length, building: false })
  } finally {
    building = false
  }
}
