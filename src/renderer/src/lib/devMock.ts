/**
 * Dev-only mock of `window.api`, used ONLY when the renderer runs in a plain
 * browser (no Electron preload) during development — e.g. previewing the UI at
 * http://localhost:5173. Never active in the packaged app.
 */
import type {
  AiApi,
  AiDoc,
  AiSetupProgress,
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
    version: async () => '0.0.0-dev',
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
    browseLexicon: async () => ({ total: 0, entries: [] }),
    getPeople: async () => [],
    getPerson: async () => null,
    getAncestry: async () => [],
    getPlaces: async () => [],
    getPlaceVerses: async () => [],
    getEvents: async () => [],
    getMapLand: async () => '',
    getMapRegions: async () => '',
    getCrossReferences: async () => [],
    getVocab: async () => [],
    getGrammarLessons: async () => [],
    getGrammarLesson: async () => null,
    getLexiconByWord: async (word) => (/θε/.test(word) ? 'G2316' : null),
    getLexiconEntries: async (strongs) => {
      const greek = !strongs.toUpperCase().startsWith('H')
      return greek
        ? [
            {
              lexicon: 'TBESG',
              name: 'Abbott-Smith',
              basedOn: 'Abbott-Smith · Greek NT (STEPBible, CC BY)',
              entries: [
                {
                  extKey: strongs.toUpperCase(),
                  headword: 'ἀγάπη',
                  translit: 'agapē',
                  gloss: 'love',
                  body: '<b>ἀγάπη</b>, -ης, ἡ\n<b>love, goodwill, esteem</b> — (preview mock lexicon body).'
                }
              ]
            }
          ]
        : [
            {
              lexicon: 'TBESH',
              name: 'BDB',
              basedOn: 'Brown-Driver-Briggs · Hebrew OT (STEPBible, CC BY)',
              entries: [
                { extKey: strongs.toUpperCase(), headword: 'אֱלֹהִים', translit: 'elohim', gloss: 'God', body: '(preview mock lexicon body).' }
              ]
            }
          ]
    },
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
    getInterlinear: async (book, chapter, edition, translations = [], includeParses = false) => {
      const base = data.interlinear?.[`${edition}/${book}/${chapter}`] ?? {
        book,
        chapter,
        edition,
        direction: 'ltr' as const,
        verses: []
      }
      if (!translations.length && !includeParses) return base
      // Deep-clone; align tagged translations by Strong's, stack untagged ones as verse lines.
      const out = {
        ...base,
        verses: base.verses.map((v) => ({ ...v, tokens: v.tokens.map((t) => ({ ...t })), lines: [] as { id: string; text: string }[] }))
      }
      if (includeParses)
        for (const v of out.verses)
          for (const t of v.tokens) {
            const self = { strongs: t.strongs, morph: t.morph, gloss: t.gloss ?? t.surface, count: 6 }
            // give λόγος a second attested parse to preview genuine ambiguity
            t.parses = /^λόγ/.test(t.lemma ?? '')
              ? [self, { strongs: 'G3004', morph: 'V-PAI', gloss: 'to say', count: 2 }]
              : [self]
          }
      for (const tid of translations) {
        const ch = data.chapters[`${tid}/${book}/${chapter}`]
        if (!ch) continue
        const tagged = ch.verses.some((v) => (v.tokens ?? []).some((t) => t.strongs))
        for (const v of out.verses) {
          const src = ch.verses.find((x) => x.verse === v.verse)
          if (tagged) {
            const q = new Map<string, string[]>()
            for (const tok of src?.tokens ?? [])
              if (tok.strongs) (q.get(tok.strongs) ?? q.set(tok.strongs, []).get(tok.strongs)!).push(tok.surface)
            for (const t of v.tokens) {
              if (!t.strongs) continue
              const w = q.get(t.strongs)?.shift()
              if (w) t.aligned = { ...(t.aligned ?? {}), [tid]: w }
            }
          } else if (src) {
            v.lines.push({ id: tid, text: src.text })
          }
        }
      }
      return out
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
    deleteImportedTranslation: async () => undefined,
    listBookmarks: async () => [],
    addBookmark: async (input) => ({
      id: 1,
      name: input.name,
      book: input.book,
      chapter: input.chapter,
      verse: input.verse ?? 1,
      note: input.note ?? null,
      createdAt: Date.now()
    }),
    deleteBookmark: async () => undefined,
    addHistory: async () => undefined,
    listHistory: async () => [],
    listDueCards: async () => [],
    reviewCard: async (strongs, language, grade) => ({
      strongs,
      language,
      ease: 2.5,
      intervalDays: 1,
      dueAt: Date.now() + 86_400_000,
      reps: 1,
      lapses: 0,
      lastGrade: grade,
      updatedAt: Date.now()
    }),
    srsStats: async () => ({ total: 0, due: 0, learned: 0 }),
    getLearnProgress: async () => ({}),
    setLearnProgress: async () => undefined,
    exportMarkdown: async () => null
  }

  ;(window as unknown as { api: BibleApi }).api = mock

  // Simulated assistant so the chat UI previews in the browser (real one runs on Ollama in-app).
  const tokenListeners = new Set<(e: AiTokenEvent) => void>()
  const emit = (e: AiTokenEvent): void => tokenListeners.forEach((cb) => cb(e))
  const cfg = {
    baseUrl: 'http://localhost:11434',
    chatModel: '',
    embedModel: 'nomic-embed-text',
    provider: 'auto' as const,
    chatTier: 'auto' as 'auto' | 'fast' | 'balanced' | 'quality'
  }
  const installed = new Set<'fast' | 'balanced' | 'quality'>()
  // Preview starts un-set-up so the seamless "Set up the assistant" flow is visible.
  let setupDone = false
  const setupListeners = new Set<(p: AiSetupProgress) => void>()
  const mockCites = (): ChatCitation[] =>
    (data.search?.hits ?? []).slice(0, 4).map((h) => ({
      book: h.book,
      bookName: h.bookName,
      chapter: h.chapter,
      verse: h.verse,
      text: h.snippet.replace(/\{\{|\}\}/g, '')
    }))
  const mockDocs: AiDoc[] = [
    { id: 'doc_sample', name: 'Position paper — ecclesiology.pdf', chunks: 12, active: true, addedAt: Date.now() }
  ]
  let mockIndexed = 0
  const idxListeners = new Set<(s: { bibleIndexed: number; bibleTotal: number; building: boolean }) => void>()
  const ai: AiApi = {
    status: async () => {
      const label = { fast: 'Llama 3.2 1B Instruct', balanced: 'Llama 3.2 3B Instruct', quality: 'Qwen2.5 7B Instruct' }
      const tier = cfg.chatTier === 'auto' ? 'quality' : cfg.chatTier
      return {
        available: setupDone,
        activeProvider: (setupDone ? 'bundled' : 'none') as 'bundled' | 'none',
        needsSetup: !setupDone,
        hasGpu: true,
        models: [] as string[],
        config: cfg,
        chatModelLabel: setupDone ? label[tier] : '',
        installedTiers: [...installed]
      }
    },
    setConfig: async (patch) => Object.assign(cfg, patch),
    setupBundled: async () => {
      const tier = cfg.chatTier === 'auto' ? 'quality' : cfg.chatTier
      const chat = { fast: ['Llama 3.2 1B Instruct', 807_694_016], balanced: ['Llama 3.2 3B Instruct', 2_019_377_696], quality: ['Qwen2.5 7B Instruct', 4_683_074_240] }[tier] as [string, number]
      // Simulate the one-time model download with progress, then flip to ready.
      const steps: { role: 'chat' | 'embed'; label: string; total: number }[] = [
        { role: 'chat', label: chat[0], total: chat[1] },
        { role: 'embed', label: 'Nomic Embed Text v1.5', total: 84_106_624 }
      ]
      for (const s of steps) {
        for (let got = 0; got < s.total; got += Math.ceil(s.total / 20)) {
          await new Promise((r) => setTimeout(r, 60))
          setupListeners.forEach((cb) =>
            cb({ role: s.role, label: s.label, received: Math.min(got, s.total), total: s.total, done: false })
          )
        }
        setupListeners.forEach((cb) =>
          cb({ role: s.role, label: s.label, received: s.total, total: s.total, done: true })
        )
      }
      installed.add(tier)
      setupDone = true
    },
    onSetupProgress: (cb) => {
      setupListeners.add(cb)
      return () => setupListeners.delete(cb)
    },
    chat: async (_conversationId, _messages, grounding, extraContext) => {
      const cites = [...(extraContext ?? []), ...(grounding ? mockCites() : [])]
      emit({ citations: cites })
      const refs = cites
        .filter((c) => !c.source)
        .map((c) => `${c.bookName} ${c.chapter}:${c.verse}`)
        .join(', ')
      const text = `This is a preview reply — in the desktop app the assistant runs privately on your computer. Grounding in the cited passages${refs ? ` (${refs})` : ''}, it would answer your question here, streaming word by word and citing the verses it used.`
      for (const w of text.split(/(\s+)/)) {
        await new Promise((r) => setTimeout(r, 18))
        emit({ token: w })
      }
      emit({ done: true })
      return { text, citations: cites }
    },
    stop: async () => undefined,
    complete: async (_messages, _grounding, activeContext) => ({
      text: `(Preview) The desktop assistant would revise your note here${
        activeContext ? `, aware you're reading ${activeContext}` : ''
      }.`
    }),
    onToken: (cb) => {
      tokenListeners.add(cb)
      return () => tokenListeners.delete(cb)
    },
    listDocuments: async () => mockDocs,
    importDocument: async () => {
      const d: AiDoc = {
        id: `doc_${mockDocs.length + 1}`,
        name: `document-${mockDocs.length + 1}.txt`,
        chunks: 8,
        active: true,
        addedAt: Date.now()
      }
      mockDocs.unshift(d)
      return d
    },
    setDocumentActive: async (id, active) => {
      const d = mockDocs.find((x) => x.id === id)
      if (d) d.active = active
    },
    deleteDocument: async (id) => {
      const i = mockDocs.findIndex((x) => x.id === id)
      if (i >= 0) mockDocs.splice(i, 1)
    },
    indexStatus: async () => ({ bibleIndexed: mockIndexed, bibleTotal: 31102, building: false }),
    buildBibleIndex: async () => {
      let n = mockIndexed
      const total = 31102
      const step = (): void => {
        n = Math.min(total, n + 5000)
        idxListeners.forEach((cb) => cb({ bibleIndexed: n, bibleTotal: total, building: n < total }))
        if (n < total) setTimeout(step, 180)
        else mockIndexed = total
      }
      step()
    },
    onIndexProgress: (cb) => {
      idxListeners.add(cb)
      return () => idxListeners.delete(cb)
    }
  }
  ;(window as unknown as { ai: AiApi }).ai = ai
}
