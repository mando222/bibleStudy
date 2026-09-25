import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { createNotebookFile } from '../src/main/notebookFiles'

const folders: string[] = []
afterEach(() => folders.splice(0).forEach((folder) => rmSync(folder, { recursive: true, force: true })))
describe('notebook creation', () => {
  it('creates a new Markdown note and refuses a duplicate without losing its text', () => {
    const folder = mkdtempSync(join(tmpdir(), 'obs-notebook-test-'))
    folders.push(folder)
    const file = createNotebookFile(folder, 'Study')
    expect(file.name).toBe('Study.md')
    writeFileSync(join(folder, file.name), 'Keep this study note')
    expect(() => createNotebookFile(folder, 'Study')).toThrow('already exists')
    expect(() => createNotebookFile(folder, 'Study.md')).toThrow('already exists')
    expect(readFileSync(join(folder, file.name), 'utf8')).toBe('Keep this study note')
  })
})
