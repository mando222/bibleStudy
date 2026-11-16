// Reuse the reader's native numbering. Identity addresses need no serialized row.
import { DatabaseSync } from 'node:sqlite'
import { mapPassage } from '../../src/shared/passageMapping'

const db = new DatabaseSync(process.argv[2], { readOnly: true })
const exceptions: Record<string, (number[] | null)[]> = {}
for (const row of db.prepare("SELECT translation_id,book_id,chapter,verse FROM verses WHERE translation_id IN ('ASV','BSB','WEB','KJV')").iterate()) {
  const from = String(row.translation_id)
  const ref = { book: String(row.book_id), chapter: Number(row.chapter), verse: Number(row.verse) }
  const mappings = ['KJV','BSB'].map(to => mapPassage(ref, from, to))
  if (mappings.some(m => !m || m.chapter !== ref.chapter || m.verse !== ref.verse))
    exceptions[[from, ref.book, ref.chapter, ref.verse].join('.')] = mappings.map(m => m && [m.chapter,m.verse])
}
console.log(JSON.stringify(exceptions))
