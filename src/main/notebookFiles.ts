import { writeFileSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import { safeNotePath } from './notebookPath'
import type { NotebookFile } from '../shared/types'

/** Creating a note must never truncate an existing file, including names normalized to .md. */
export function createNotebookFile(folder: string, name: string): NotebookFile {
  const path = safeNotePath(folder, name.trim())
  try {
    writeFileSync(path, '', { encoding: 'utf8', flag: 'wx' })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('A note with that name already exists. Choose a different name.')
    }
    throw e
  }
  return { name: basename(path), modified: statSync(path).mtimeMs }
}
