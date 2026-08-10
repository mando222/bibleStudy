import { app, dialog, BrowserWindow, ipcMain } from 'electron'
import { join, basename } from 'node:path'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  renameSync,
  statSync
} from 'node:fs'
import { safeNotePath } from './notebookPath'
import type { NotebookFile } from '../shared/types'

// Free-form Markdown notes saved to a real folder on disk (default userData/Notebooks, or a
// folder the user picks). All access is confined to that folder and to .md files.

function cfgPath(): string {
  return join(app.getPath('userData'), 'notebook-config.json')
}

function readFolderCfg(): string | null {
  try {
    const j = JSON.parse(readFileSync(cfgPath(), 'utf8')) as { folder?: string }
    return typeof j.folder === 'string' && j.folder ? j.folder : null
  } catch {
    return null
  }
}

function writeFolderCfg(folder: string): void {
  try {
    writeFileSync(cfgPath(), JSON.stringify({ folder }, null, 2))
  } catch {
    /* ignore */
  }
}

/** The active notebook folder, created on demand. */
function baseDir(): string {
  const folder = readFolderCfg() ?? join(app.getPath('userData'), 'Notebooks')
  if (!existsSync(folder)) mkdirSync(folder, { recursive: true })
  return folder
}

/** Resolve a user-supplied name to a safe `.md` path inside the notebook folder, or throw. */
function safePath(name: string): string {
  return safeNotePath(baseDir(), name)
}

function list(): NotebookFile[] {
  const dir = baseDir()
  return readdirSync(dir)
    .filter((f) => /\.md$/i.test(f))
    .map((name) => ({ name, modified: statSync(join(dir, name)).mtimeMs }))
    .sort((a, b) => b.modified - a.modified)
}

function read(name: string): string {
  const p = safePath(name)
  return existsSync(p) ? readFileSync(p, 'utf8') : ''
}

function write(name: string, content: string): NotebookFile {
  const p = safePath(name)
  writeFileSync(p, content, 'utf8')
  return { name: basename(p), modified: statSync(p).mtimeMs }
}

function rename(oldName: string, newName: string): void {
  renameSync(safePath(oldName), safePath(newName))
}

function remove(name: string): void {
  const p = safePath(name)
  if (existsSync(p)) unlinkSync(p)
}

async function chooseFolder(win: BrowserWindow | null): Promise<string> {
  const res = await dialog.showOpenDialog(win ?? undefined!, {
    title: 'Choose a folder for your notebook',
    properties: ['openDirectory', 'createDirectory']
  })
  if (!res.canceled && res.filePaths[0]) writeFolderCfg(res.filePaths[0])
  return baseDir()
}

export function registerNotebookIpc(): void {
  ipcMain.handle('notebook:list', () => list())
  ipcMain.handle('notebook:read', (_e, name: string) => read(name))
  ipcMain.handle('notebook:write', (_e, name: string, content: string) => write(name, content))
  ipcMain.handle('notebook:rename', (_e, oldName: string, newName: string) =>
    rename(oldName, newName)
  )
  ipcMain.handle('notebook:delete', (_e, name: string) => remove(name))
  ipcMain.handle('notebook:getFolder', () => baseDir())
  ipcMain.handle('notebook:chooseFolder', (e) =>
    chooseFolder(BrowserWindow.fromWebContents(e.sender))
  )
}
