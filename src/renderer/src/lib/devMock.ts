/**
 * Dev-only mock of `window.api`, used ONLY when the renderer runs in a plain
 * browser (no Electron preload) during development — e.g. previewing the UI at
 * http://localhost:5173. Never active in the packaged app.
 */
import type {
  BibleApi,
  ChapterContent,
  ConcordanceHit,
  Edition,
  Highlight,
  InterlinearContent,
  Note,
  SearchResponse
} from '@shared/types'

interface MockData {
  translations: unknown[]
  chapters: Record<string, ChapterContent>
  strongs: Record<string, unknown>
  search: SearchResponse
  editions: Edition[]
  interlinear: Record<string, InterlinearContent>
}

export async function installDevMock(): Promise<void> {
  const data = ((await import('./devMockData.json')).default as unknown) as MockData
  const highlights: Highlight[] = []
  const notes: Note[] = []
  let hid = 1
  let nid = 1

  const mock: BibleApi = {
    listTranslations: async () => data.translations as never,
    getChapter: async (ref) =>
      data.chapters[`${ref.translation}/${ref.book}/${ref.chapter}`] ??
      ({
        ...ref,
        bookName: ref.book,
        direction: 'ltr',
        verses: [
          {
            verse: 1,
            text: `(Preview mock has only John 1. ${ref.translation} ${ref.book} ${ref.chapter} not loaded.)`,
            tokens: null
          }
        ]
      } as ChapterContent),
    getStrongs: async (id) => (data.strongs[id.toUpperCase()] as never) ?? null,
    getConcordance: async (strongs) => {
      const sid = strongs.toUpperCase()
      const ch = data.chapters['KJV/John/1']
      const hits: ConcordanceHit[] = []
      if (ch) {
        for (const v of ch.verses) {
          const surfaces = (v.tokens ?? []).filter((t) => t.strongs === sid).map((t) => t.surface)
          if (!surfaces.length) continue
          let snippet = v.text
          for (const s of [...new Set(surfaces)]) {
            const esc = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            snippet = snippet.replace(new RegExp(`\\b(${esc})\\b`, 'gi'), '{{$1}}')
          }
          hits.push({ book: 'John', bookName: ch.bookName, chapter: 1, verse: v.verse, surface: surfaces[0], snippet })
        }
      }
      return { total: hits.length, hits }
    },
    listEditions: async () => data.editions ?? [],
    getInterlinear: async (book, chapter, edition) =>
      data.interlinear?.[`${edition}/${book}/${chapter}`] ?? {
        book,
        chapter,
        edition,
        direction: 'ltr',
        verses: []
      },
    search: async (q) => {
      const term = q.text.trim().toLowerCase()
      if (!term) return { total: 0, hits: [] }
      if ('love'.includes(term) || term.includes('love')) return data.search
      const hits = data.search.hits.filter((h) => h.snippet.toLowerCase().includes(term))
      return { total: hits.length, hits }
    },
    listHighlights: async (ref) =>
      highlights.filter(
        (h) => h.translation === ref.translation && h.book === ref.book && h.chapter === ref.chapter
      ),
    saveHighlight: async (input) => {
      if (input.startToken == null) {
        const i = highlights.findIndex(
          (h) =>
            h.translation === input.translation &&
            h.book === input.book &&
            h.chapter === input.chapter &&
            h.verse === input.verse &&
            h.startToken == null
        )
        if (i >= 0) highlights.splice(i, 1)
      }
      const h: Highlight = { id: hid++, ...input, createdAt: Date.now() }
      highlights.push(h)
      return h
    },
    deleteHighlight: async (id) => {
      const i = highlights.findIndex((h) => h.id === id)
      if (i >= 0) highlights.splice(i, 1)
    },
    listNotes: async (ref) => notes.filter((n) => n.book === ref.book && n.chapter === ref.chapter),
    saveNote: async (input) => {
      if (input.id) {
        const n = notes.find((x) => x.id === input.id)
        if (n) {
          n.body = input.body
          n.verse = input.verse
          n.updatedAt = Date.now()
          return n
        }
      }
      const n: Note = {
        id: nid++,
        book: input.book,
        chapter: input.chapter,
        verse: input.verse,
        body: input.body,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      notes.push(n)
      return n
    },
    deleteNote: async (id) => {
      const i = notes.findIndex((n) => n.id === id)
      if (i >= 0) notes.splice(i, 1)
    }
  }

  ;(window as unknown as { api: BibleApi }).api = mock
}
