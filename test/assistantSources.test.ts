import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'

import { describe, expect, it, vi } from 'vitest'
import { answer } from '../src/main/ai/assistant'
import { importDocument } from '../src/main/ai/documents'
import { addChunks } from '../src/main/ai/vectors'
import { chatTurn } from '../src/main/ai/provider'
import { citationLabel } from '../src/shared/refs'

vi.mock('node:sqlite', () => createRequire(import.meta.url)('node:sqlite'))
vi.mock('electron', () => ({ app: { getAppPath: () => process.cwd() } }))
vi.mock('../src/main/ai/provider', () => ({
  embed: async (texts: string[]) => texts.map(() => [1, 2]),
  chatTurn: vi.fn(async function* () { yield 'answer' })
}))
vi.mock('../src/main/ai/vectors', () => ({
  hasBibleIndex: () => false, searchChunks: () => [], upsertDocument: vi.fn(), addChunks: vi.fn()
}))

it('imports readable text from a real one-page PDF using the installed parser', async () => {
  const doc = await importDocument('test/fixtures/study-note.pdf')
  expect(doc.chunks).toBe(1)
  expect(addChunks).toHaveBeenCalledWith(doc.id, [
    { text: 'The shepherd study note.', embedding: [1, 2] }
  ])
})

describe.skipIf(!existsSync('resources/bible.sqlite'))('named-passage grounding', () => {
  it('recovers the published wording when a saved selection contains a custom display word', async () => {
    const reply = answer('test', [{ role: 'user', content: 'Explain the selection.' }],
      { translation: 'KJV' }, [{ translation: 'KJV', book: 'Gen', bookName: 'Genesis', chapter: 1,
        verse: 1, text: 'AuditDisplay' }])
    const { value } = await reply.next()
    expect(value?.citations?.[0]).toMatchObject({ text: 'In the beginning God created the heaven and the earth.' })
    for await (const _event of reply) { /* inspect the generated prompt */ }
    expect(vi.mocked(chatTurn).mock.lastCall?.[0].userPrompt).not.toContain('AuditDisplay')
  })
  it('reads the open chapter when a single verse has focus', async () => {
    const reply = answer('test', [{ role: 'user', content: 'Explain this chapter.' }],
      { translation: 'KJV' }, [], 'Open passage: Psalm 23:4 (KJV)')
    const { value } = await reply.next()
    expect(value?.citations?.filter(c => c.book === 'Ps').map(c => c.verse)).toEqual([1, 2, 3, 4, 5, 6])
    await reply.return()
  })

  it('reports a missing passage even if a second reference was found', async () => {
    const reply = answer('test', [{ role: 'user', content: 'Compare John 3:16 and John 3:99.' }], { translation: 'KJV' })
    for await (const _event of reply) { /* consume the answer to inspect the prompt */ }
    expect(vi.mocked(chatTurn).mock.lastCall?.[0].userPrompt).toContain('John 3:99 is unavailable')
  })

  it('retains the bounds of an explicitly selected range', () => {
    expect(citationLabel({ book: 'Ps', bookName: 'Psalms', chapter: 23, verse: 1, endVerse: 4, text: 'selection' }))
      .toBe('Psalms 23:1–4')
  })
  it('places the requested full text first without needing a semantic index', async () => {
    const reply = answer('test', [{ role: 'user', content: 'Explain John 3:16–18.' }], { translation: 'KJV' })
    const { value } = await reply.next()
    expect(value?.citations?.slice(0, 3)).toMatchObject([
      { book: 'John', chapter: 3, verse: 16, translation: 'KJV', text: expect.stringMatching(/^For God so loved the world.*everlasting life\.$/) },
      { verse: 17 }, { verse: 18 }
    ])
    await reply.return()
  })
})
