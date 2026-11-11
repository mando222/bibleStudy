import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { createNotebookFile, NotebookSession } from '../src/main/notebookFiles'

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

describe('concurrent notebook editors', () => {
  it('retains the opened folder and detects another window changing or deleting the note', () => {
    const a = mkdtempSync(join(tmpdir(), 'obs-notebook-a-'))
    const b = mkdtempSync(join(tmpdir(), 'obs-notebook-b-'))
    folders.push(a, b)
    createNotebookFile(a, 'Study', 'First')
    createNotebookFile(b, 'Study', 'Different study')
    const editor = new NotebookSession(a)
    const detached = new NotebookSession(a)
    editor.read('Study.md')
    detached.read('Study.md')
    editor.write('Study.md', 'First window changes')
    expect(() => detached.write('Study.md', 'Detached draft')).toThrow('changed on disk')
    const copy = detached.recover('Study.md', 'Detached draft')
    expect(readFileSync(join(a, copy.name), 'utf8')).toBe('Detached draft')
    expect(readFileSync(join(a, 'Study.md'), 'utf8')).toBe('First window changes')
    const otherFolder = new NotebookSession(b)
    otherFolder.read('Study.md')
    otherFolder.write('Study.md', 'Updated other folder')
    editor.write('Study.md', 'Only changes folder A')
    expect(readFileSync(join(b, 'Study.md'), 'utf8')).toBe('Updated other folder')
    rmSync(join(a, 'Study.md'))
    expect(() => editor.write('Study.md', 'Stale save')).toThrow('changed on disk')
  })
})
