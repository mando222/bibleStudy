import { bibleDb, retrieveByKeywords } from '../db/bible'
import { getImportedPassage } from '../db/user'
import { readPassage } from '../db/passage'
import { citationLabel, namedPassages, type ScripturePassage } from '../../shared/refs'
import { BOOK_BY_ID } from '../../shared/books'
import { chatTurn, embed } from './provider'
import { retrieveDocs } from './documents'
import { retrieveGuide } from './appGuide'
import { hasBibleIndex, searchBible } from './vectors'
import { buildSystemPrompt } from './prompts'
import type { ChatMessage, ChatCitation } from '../../shared/types'

const STOP = new Set(
  (
    'the a an of to in on at and or but is are was were be been being this that these those it its ' +
    'he him his she her they them their you your we our us i me my what where when who whom how why which ' +
    'do does did done use used using term word say said about there here with without for from as by not ' +
    'no yes can could would should shall may might into out over under again'
  ).split(/\s+/)
)

function keywords(q: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const w of q.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)) {
    if (w.length > 2 && !STOP.has(w) && !seen.has(w)) {
      seen.add(w)
      out.push(w)
    }
  }
  return out.slice(0, 6)
}

const citeKey = (c: ChatCitation): string =>
  c.source ? `doc:${c.source}:${c.text.slice(0, 48)}` : `${c.translation ?? ''}:${c.book}:${c.chapter}:${c.verse}:${c.endVerse ?? c.verse}`

/**
 * Hybrid Bible retrieval: keyword (FTS) always; semantic (embeddings) when the index exists.
 * The two ranked lists are merged with reciprocal-rank fusion so the best of each rises. Pass a
 * precomputed query vector to avoid embedding the question a second time.
 */
export async function retrieveBible(
  question: string,
  translation: string,
  qvec?: number[]
): Promise<ChatCitation[]> {
  const fts: ChatCitation[] = retrieveByKeywords(translation, keywords(question), 8).map((h) => ({
    translation,
    book: h.book,
    bookName: h.bookName,
    chapter: h.chapter,
    verse: h.verse,
    text: h.snippet
  }))
  let sem: ChatCitation[] = []
  try {
    if (qvec && hasBibleIndex(translation)) {
      sem = searchBible(translation, qvec, 8).map((m) => ({
        translation,
        book: m.book,
        bookName: BOOK_BY_ID[m.book]?.name ?? m.book,
        chapter: m.chapter,
        verse: m.verse,
        text: m.text
      }))
    }
  } catch {
    /* semantic retrieval unavailable */
  }
  return fuse([sem, fts]).slice(0, 10)
}

/** Reciprocal-rank fusion of several ranked citation lists (dedup by verse/doc key). */
function fuse(lists: ChatCitation[][], k = 60): ChatCitation[] {
  const score = new Map<string, number>()
  const byKey = new Map<string, ChatCitation>()
  for (const list of lists) {
    list.forEach((c, rank) => {
      const key = citeKey(c)
      score.set(key, (score.get(key) ?? 0) + 1 / (k + rank))
      if (!byKey.has(key)) byKey.set(key, c)
    })
  }
  return [...byKey.keys()]
    .sort((a, b) => (score.get(b) ?? 0) - (score.get(a) ?? 0))
    .map((key) => byKey.get(key) as ChatCitation)
}

/** Dedup + budget the assembled context so it can't overflow the model's window. */
function assembleContext(cites: ChatCitation[], maxChars = 6000): ChatCitation[] {
  const seen = new Set<string>()
  const out: ChatCitation[] = []
  let used = 0
  for (const c of cites) {
    const key = citeKey(c)
    if (seen.has(key)) continue
    if (out.length && used + c.text.length > maxChars) break
    seen.add(key)
    out.push(c)
    used += c.text.length
  }
  return out
}

function passageInEdition(translation: string, ref: ScripturePassage): ChatCitation[] {
  if (translation.startsWith('imp_')) return getImportedPassage(translation, ref)
  const db = bibleDb()
  return db ? readPassage(db, 'verses', translation, ref) : []
}

// Older saved turns could contain a custom display word under a Bible reference.
// Validate a selected excerpt against the named edition every time it is cited.
function publishedSelection(selection: ChatCitation, fallback?: string): ChatCitation[] {
  if (selection.source) return [selection]
  const translation = selection.translation ?? fallback
  if (!translation || !BOOK_BY_ID[selection.book]) return []
  const { book, chapter, verse, endVerse } = selection
  const rows = passageInEdition(translation, {
    book, chapter, lastChapter: chapter, firstVerse: verse, lastVerse: endVerse ?? verse
  })
  if (rows.length && selection.text.length && rows.map(row => row.text).join(' ').includes(selection.text)) {
    return [{ ...selection, translation, bookName: BOOK_BY_ID[book].name }]
  }
  return rows
}

/** Stream a grounded answer: yields citations first, then content tokens. */
export async function* answer(
  conversationId: string,
  messages: ChatMessage[],
  grounding: { translation: string } | null,
  extraContext: ChatCitation[] = [],
  activeContext?: string,
  signal?: AbortSignal
): AsyncGenerator<{ token?: string; citations?: ChatCitation[] }> {
  const priorTurns = messages.slice(0, -1).filter((m) => m.role !== 'system')
  const lastUser =
    messages[messages.length - 1]?.role === 'user'
      ? messages[messages.length - 1].content
      : ([...messages].reverse().find((m) => m.role === 'user')?.content ?? '')

  // Embed the question once and reuse it for both document and Scripture retrieval.
  let qvec: number[] | undefined
  if (lastUser) {
    try {
      qvec = (await embed([lastUser], 'query'))[0]
    } catch {
      qvec = undefined
    }
  }

  // App-guide sections when the question is about using the app; user documents; Scripture.
  const guideCites: ChatCitation[] = (lastUser ? retrieveGuide(lastUser) : []).map((h) => ({
    book: '',
    bookName: h.source,
    chapter: 0,
    verse: 0,
    text: h.text,
    source: h.source
  }))
  const docHits = lastUser ? await retrieveDocs(lastUser, 5, qvec) : []
  const docCites: ChatCitation[] = docHits.map((h) => ({
    book: '',
    bookName: h.source,
    chapter: 0,
    verse: 0,
    text: h.text,
    source: h.source
  }))
  const explicit = grounding ? namedPassages(lastUser) : []
  const readerReference = lastUser.match(/\b(?:this|current|selected|open)\s+(verse|chapter|passage|text)\b/i)
  if (grounding && !explicit.length && !extraContext.length && activeContext && readerReference) {
    const current = namedPassages(activeContext)[0]
    if (current) {
      explicit.push(readerReference[1].toLowerCase() === 'chapter'
        ? { book: current.book, chapter: current.chapter, lastChapter: current.chapter }
        : current)
    }
  }
  // A question naming a passage gets that translation's actual text, including verse ranges.
  // Missing verses in a partial edition stay missing; ranked hits must not impersonate them.
  const passages = grounding ? explicit.map(ref => passageInEdition(grounding.translation, ref)) : []
  const referenced = passages.flat()
  const bibleCites = grounding && lastUser && !explicit.length
    ? await retrieveBible(lastUser, grounding.translation, qvec) : []
  const selections = extraContext.flatMap(item => publishedSelection(item, grounding?.translation))
  const citations = assembleContext([...referenced, ...selections, ...guideCites, ...docCites, ...bibleCites])
  yield { citations }

  const blocks: string[] = []
  for (const [index, rows] of passages.entries()) {
    if (rows.length) continue
    const { book, chapter, firstVerse } = explicit[index]
    const start = `${BOOK_BY_ID[book].name} ${chapter}${firstVerse == null ? '' : ':' + firstVerse}`
    blocks.push(`The requested passage starting at ${start} is unavailable in the selected translation. Tell the reader.`)
  }
  const included = new Set(citations.map(citeKey))
  if (referenced.some(c => !included.has(citeKey(c)))) {
    blocks.push('The provided text covers only part of the requested passages. Tell the reader which part is covered.')
  }
  if (activeContext?.trim()) blocks.push(`Reader's current context:\n${activeContext.trim()}`)
  if (citations.length)
    blocks.push(
      'Context passages:\n' +
        citations
          .map((c) =>
            c.source
              ? `[${c.source}] ${c.text}`
              : `(${citationLabel(c)}) ${c.text}`
          )
          .join('\n')
    )
  const userPrompt = blocks.length ? `${blocks.join('\n\n')}\n\nQuestion: ${lastUser}` : lastUser
  const system = buildSystemPrompt({ grounded: !!grounding })

  for await (const tok of chatTurn({
    conversationId,
    system,
    priorTurns,
    userPrompt,
    signal
  }))
    yield { token: tok }
}
