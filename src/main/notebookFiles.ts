import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { safeNotePath } from './notebookPath'
import type { NotebookFile } from '../shared/types'

export function atomicWrite(path: string, content: string | Buffer): void {
  const temporary = join(dirname(path), `.obs-${randomUUID()}.tmp`)
  try {
    writeFileSync(temporary, content, { flag: 'wx', mode: existsSync(path) ? statSync(path).mode : 0o600, flush: true })
    renameSync(temporary, path)
  } finally {
    rmSync(temporary, { force: true })
  }
}

export function createNotebookFile(folder: string, name: string, content = ''): NotebookFile {
  const path = safeNotePath(folder, name.trim())
  try {
    writeFileSync(path, content, { encoding: 'utf8', flag: 'wx', mode: 0o600, flush: true })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('A note with that name already exists. Choose a different name.')
    }
    throw e
  }
  return { name: basename(path), modified: statSync(path).mtimeMs }
}

const revision = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex')

/** Each window retains its own chosen directory and the revision it actually read. */
export class NotebookSession {
  private revisions = new Map<string, string>()
  constructor(readonly folder: string) {}

  read(name: string): string {
    const path = safeNotePath(this.folder, name)
    const bytes = readFileSync(path)
    this.revisions.set(path, revision(bytes))
    return bytes.toString('utf8')
  }

  checkedPath(name: string): string {
    const path = safeNotePath(this.folder, name)
    const expected = this.revisions.get(path)
    if (!expected || !existsSync(path) || revision(readFileSync(path)) !== expected) {
      throw new Error('This note changed on disk. Save your draft as a copy to keep both versions.')
    }
    return path
  }

  write(name: string, content: string): NotebookFile {
    const path = this.checkedPath(name)
    atomicWrite(path, content)
    this.revisions.set(path, revision(content))
    return { name: basename(path), modified: statSync(path).mtimeMs }
  }

  recover(name: string, content: string): NotebookFile {
    const stem = basename(name, extname(name))
    return createNotebookFile(this.folder, `${stem} (recovered ${randomUUID().slice(0, 8)}).md`, content)
  }
}
