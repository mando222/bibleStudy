import { retrieveByKeywords } from '../db/bible'
import { chatStream } from './ollama'
import { ensureChatModel } from './config'
import type { ChatMessage, ChatCitation } from '../../shared/types'

const SYSTEM =
  'You are a careful Bible-study assistant inside an offline study app. Answer using the provided ' +
  "Scripture context and the user's active documents when given. Cite verses inline as " +
  '(Book Chapter:Verse). If the context does not contain the answer, say so honestly rather than ' +
  'guessing, and never invent verses or references. Be concise, warm, and accurate.'

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

export function retrieveBible(question: string, translation: string): ChatCitation[] {
  return retrieveByKeywords(translation, keywords(question), 10).map((h) => ({
    book: h.book,
    bookName: h.bookName,
    chapter: h.chapter,
    verse: h.verse,
    text: h.snippet
  }))
}

/** Stream a grounded answer: yields citations first, then content tokens. */
export async function* answer(
  messages: ChatMessage[],
  grounding: { translation: string } | null,
  extraContext: ChatCitation[] = []
): AsyncGenerator<{ token?: string; citations?: ChatCitation[] }> {
  const cfg = await ensureChatModel()
  if (!cfg.chatModel) throw new Error('No chat model is available in Ollama.')

  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
  const bibleCites = grounding && lastUser ? retrieveBible(lastUser, grounding.translation) : []
  const citations = [...extraContext, ...bibleCites]
  yield { citations }

  const ctx = citations.length
    ? 'Context passages:\n' +
      citations
        .map((c) =>
          c.source
            ? `[${c.source}] ${c.text}`
            : `(${c.bookName} ${c.chapter}:${c.verse}) ${c.text}`
        )
        .join('\n')
    : ''

  const full: ChatMessage[] = [
    { role: 'system', content: SYSTEM },
    ...(ctx ? [{ role: 'system' as const, content: ctx }] : []),
    ...messages
  ]
  for await (const tok of chatStream(cfg.baseUrl, cfg.chatModel, full)) yield { token: tok }
}
