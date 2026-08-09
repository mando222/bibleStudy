/**
 * Dev-only mock of `window.api`, used ONLY when the renderer runs in a plain
 * browser (no Electron preload) during development — e.g. previewing the UI at
 * http://localhost:5173. Never active in the packaged app.
 */
import type {
  AiApi,
  AiTokenEvent,
  BibleApi,
  ChapterContent,
  ChatCitation,
  ConcordanceHit,
  Edition,
  Highlight,
  InterlinearContent,
  Note,
  SearchResponse,
  VerseVariant
} from '@shared/types'

interface MockData {
  translations: unknown[]
  chapters: Record<string, ChapterContent>
  strongs: Record<string, unknown>
  search: SearchResponse
  editions: Edition[]
  interlinear: Record<string, InterlinearContent>
  apparatus: Record<string, VerseVariant[]>
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
    getChapterApparatus: async (book, chapter) => data.apparatus?.[`${book}/${chapter}`] ?? [],
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
    },
    importTranslation: async () => null, // file import only works in the Electron app
    deleteImportedTranslation: async () => undefined
  }

  ;(window as unknown as { api: BibleApi }).api = mock

  // Simulated assistant so the chat UI previews in the browser (real one runs on Ollama in-app).
  const tokenListeners = new Set<(e: AiTokenEvent) => void>()
  const emit = (e: AiTokenEvent): void => tokenListeners.forEach((cb) => cb(e))
  const cfg = { baseUrl: 'http://localhost:11434', chatModel: 'llama3.1:latest', embedModel: 'nomic-embed-text' }
  const mockCites = (): ChatCitation[] =>
    (data.search?.hits ?? []).slice(0, 4).map((h) => ({
      book: h.book,
      bookName: h.bookName,
      chapter: h.chapter,
      verse: h.verse,
      text: h.snippet.replace(/\{\{|\}\}/g, '')
    }))
  const ai: AiApi = {
    status: async () => ({ available: true, models: ['llama3.1:latest', 'qwen3:1.7b'], config: cfg }),
    setConfig: async (patch) => Object.assign(cfg, patch),
    chat: async (messages, grounding) => {
      const cites = grounding ? mockCites() : []
      emit({ citations: cites })
      const refs = cites.map((c) => `${c.bookName} ${c.chapter}:${c.verse}`).join(', ')
      const text = `This is a preview reply — the real assistant runs on your local Ollama inside the desktop app. Grounding in the cited passages${refs ? ` (${refs})` : ''}, it would answer your question here, streaming word by word and citing the verses it used.`
      for (const w of text.split(/(\s+)/)) {
        await new Promise((r) => setTimeout(r, 18))
        emit({ token: w })
      }
      emit({ done: true })
      return { text, citations: cites }
    },
    onToken: (cb) => {
      tokenListeners.add(cb)
      return () => tokenListeners.delete(cb)
    },
    listDocuments: async () => [],
    importDocument: async () => null,
    setDocumentActive: async () => undefined,
    deleteDocument: async () => undefined,
    indexStatus: async () => ({ bibleIndexed: 0, bibleTotal: 0, building: false }),
    buildBibleIndex: async () => undefined,
    onIndexProgress: () => () => undefined
  }
  ;(window as unknown as { ai: AiApi }).ai = ai
}
