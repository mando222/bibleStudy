import { describe, it, expect } from 'vitest'
import { sep } from 'node:path'
import { safeNotePath } from '../src/main/notebookPath'

const BASE = sep === '\\' ? 'C:\\notes' : '/tmp/notes'
const inside = (p: string): boolean => p.startsWith(BASE + sep)

describe('notebook path safety', () => {
  it('resolves a plain name to a .md file directly inside the folder', () => {
    const p = safeNotePath(BASE, 'Study on Romans')
    expect(inside(p)).toBe(true)
    expect(p.endsWith('.md')).toBe(true)
  })

  it('keeps an existing .md extension (no double .md)', () => {
    const p = safeNotePath(BASE, 'notes.md')
    expect(p.endsWith('.md')).toBe(true)
    expect(p.endsWith('.md.md')).toBe(false)
  })

  it('blocks path traversal and absolute paths (stays inside the folder)', () => {
    for (const evil of ['../secret', '../../etc/passwd', 'a/b/c', 'sub/../../escape']) {
      const p = safeNotePath(BASE, evil)
      expect(inside(p)).toBe(true) // basename-stripped, never escapes
    }
  })

  it('rejects dotfiles and empty / dot names', () => {
    for (const bad of ['', '.', '..', '.hidden', '.gitignore']) {
      expect(() => safeNotePath(BASE, bad)).toThrow()
    }
  })
})
