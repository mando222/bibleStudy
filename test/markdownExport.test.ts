import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { exportMarkdown } from '../src/main/export'

const saveDialog = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({ dialog: { showSaveDialog: saveDialog } }))
vi.mock('../src/main/db/user', () => ({
  listAllNotes: () => [{ book: 'John', chapter: 1, verse: 1, body: 'First line\r\nSecond line\n\nNext paragraph' },
    { book: 'Rom', chapter: 16, verse: 25, body: 'My WEB note' }, { book: 'Dan', chapter: 4, verse: 1, body: 'My Geneva note' }],
  listAllHighlights: () => [
    { book: 'John', chapter: 1, verse: 1, translation: 'KJV', color: 'yellow' },
    { book: 'Rom', chapter: 14, verse: 24, translation: 'WEB', color: 'yellow' },
    { book: 'Dan', chapter: 3, verse: 31, translation: 'GNV', color: 'yellow' },
    { book: 'John', chapter: 1, verse: 1, translation: 'imp_123', color: 'yellow', startToken: 2, endToken: 3 }
  ],
  listImported: () => [{ id: 'imp_123', name: 'Personal study edition' }]
}))

it('exports multiline notes and labels highlights of the same verse by translation', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'obs-markdown-export-'))
  try {
    const path = join(folder, 'annotations.md')
    saveDialog.mockResolvedValue({ canceled: false, filePath: path })
    expect(await exportMarkdown(null)).toBe(path)
    const markdown = readFileSync(path, 'utf8')
    expect(markdown).toContain('First line\n  Second line\n  \n  Next paragraph')
    expect(markdown).toContain('- _highlight_ John 1:1 (KJV) — yellow')
    expect(markdown).toContain('- _highlight_ John 1:1 (Personal study edition) (tokens 2–3) — yellow')
    expect(markdown).toContain('## Romans 16 (KJV numbering)\n\n- **Romans 16:25** (KJV numbering) — My WEB note\n- _highlight_ Romans 14:24 (WEB) · Romans 16:25 (KJV numbering)')
    expect(markdown).toContain('## Daniel 4 (KJV numbering)\n\n- **Daniel 4:1** (KJV numbering) — My Geneva note\n- _highlight_ Daniel 3:31 (GNV) · Daniel 4:1 (KJV numbering)')
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})
