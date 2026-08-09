import { retrieveByKeywords } from '../db/bible'
import { BOOK_BY_ID } from '../../shared/books'
import { chatTurn, embed } from './provider'
import { retrieveDocs } from './documents'
import { retrieveGuide } from './appGuide'
import { hasBibleIndex, searchBible } from './vectors'
import type { ChatMessage, ChatCitation } from '../../shared/types'

const APP_INTRO =
  'You are the careful study assistant built into Open Bible Study — a local, offline desktop app ' +
  "with multiple translations, Strong's numbers, an interlinear with the original Greek and Hebrew, " +
  'scholarly lexicons, notes and highlighting, search, and a Divine Names toggle. ' +
  'When the user asks how to do something in the app, use the "App guide" context to give the exact ' +
  'steps, and never invent features or menus that are not in that guide. '

// Grounded mode (default): answer only from the retrieved context — for careful study.
const SYSTEM_GROUNDED =
  APP_INTRO +
  'Ground every factual and scriptural claim ONLY in the provided Scripture context and the ' +
  "user's active documents — do not rely on memory for quotations or references. Quote verses only " +
  'if they appear in the context, and cite them inline as (Book Chapter:Verse). ' +
  'If the context does not contain the answer, say so plainly (e.g. "The provided passages don\'t ' +
  'address that") instead of guessing, and never invent or paraphrase verses, references, or ' +
  'numbers. Prefer "I\'m not certain" over a confident guess. Be concise, warm, and accurate.'

// General mode (grounding off): answer from your own knowledge, but stay careful with references.
const SYSTEM_GENERAL =
  APP_INTRO +
  'Answer helpfully from your own knowledge as a knowledgeable Bible-study aid, and use any ' +
  'provided context when it is relevant. When you cite Scripture, use the form (Book Chapter:Verse) ' +
  'and get references right; if you are unsure of a quotation or reference, say so rather than ' +
  'inventing it. Be concise, warm, and accurate.'

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
  c.source ? `doc:${c.source}:${c.text.slice(0, 48)}` : `${c.book}:${c.chapter}:${c.verse}`

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

/** Stream a grounded answer: yields citations first, then content tokens. */
export async function* answer(
  conversationId: string,
  messages: ChatMessage[],
  grounding: { translation: string } | null,
  extraContext: ChatCitation[] = [],
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
  const bibleCites =
    grounding && lastUser ? await retrieveBible(lastUser, grounding.translation, qvec) : []
  const citations = assembleContext([...extraContext, ...guideCites, ...docCites, ...bibleCites])
  yield { citations }

  const ctx = citations.length
    ? 'Context passages:\n' +
      citations
        .map((c) =>
          c.source ? `[${c.source}] ${c.text}` : `(${c.bookName} ${c.chapter}:${c.verse}) ${c.text}`
        )
        .join('\n')
    : ''
  const userPrompt = ctx ? `${ctx}\n\nQuestion: ${lastUser}` : lastUser
  const system = grounding ? SYSTEM_GROUNDED : SYSTEM_GENERAL

  for await (const tok of chatTurn({
    conversationId,
    system,
    priorTurns,
    userPrompt,
    signal
  }))
    yield { token: tok }
}
