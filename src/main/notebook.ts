import { studyProfile } from './studyProfile'
import { dialog, BrowserWindow, ipcMain, shell, type WebContents } from 'electron'
import { join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, linkSync, unlinkSync } from 'node:fs'
import { safeNotePath } from './notebookPath'
import { atomicWrite, createNotebookFile, NotebookSession } from './notebookFiles'

function cfgPath(): string {
  return join(studyProfile().root, 'notebook-config.json')
}

export function setNotebookFolder(folder: string): void {
  atomicWrite(cfgPath(), JSON.stringify({ folder }))
}

export function notebookFolder(): string {
  const config = cfgPath()
  const folder = existsSync(config)
    ? (JSON.parse(readFileSync(config, 'utf8')) as { folder: string }).folder
    : join(studyProfile().root, 'Notebooks')
  mkdirSync(folder, { recursive: true })
  return folder
}

const sessions = new WeakMap<WebContents, NotebookSession>()
function session(sender: WebContents): NotebookSession {
  let current = sessions.get(sender)
  if (!current) {
    current = new NotebookSession(notebookFolder())
    sessions.set(sender, current)
  }
  return current
}

export function listNotebook(folder: string) {
  return readdirSync(folder, { withFileTypes: true })
    .filter((f) => (f.isFile() || f.isSymbolicLink()) && !f.name.startsWith('.') && /\.md$/i.test(f.name))
    .map((f) => ({ name: f.name, modified: statSync(join(folder, f.name)).mtimeMs }))
    .sort((a, b) => b.modified - a.modified)
}

export function registerNotebookIpc(): void {
  ipcMain.handle('notebook:create', (e, name: string) => createNotebookFile(session(e.sender).folder, name))
  ipcMain.handle('notebook:list', (e) => listNotebook(session(e.sender).folder))
  ipcMain.handle('notebook:read', (e, name: string) => session(e.sender).read(name))
  ipcMain.handle('notebook:write', (e, name: string, content: string) => session(e.sender).write(name, content))
  ipcMain.handle('notebook:recover', (e, name: string, content: string) => session(e.sender).recover(name, content))
  ipcMain.handle('notebook:rename', (e, oldName: string, newName: string) => {
    const editor = session(e.sender)
    const oldPath = editor.checkedPath(oldName)
    const target = safeNotePath(editor.folder, newName)
    if (oldPath === target) return
    linkSync(oldPath, target)
    unlinkSync(oldPath)
  })
  ipcMain.handle('notebook:delete', (e, name: string) => shell.trashItem(session(e.sender).checkedPath(name)))
  ipcMain.handle('notebook:getFolder', (e) => session(e.sender).folder)
  ipcMain.handle('notebook:chooseFolder', async (e) => {
    const current = session(e.sender)
    const res = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender)!, {
      title: 'Choose a folder for your notebook', properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || !res.filePaths[0]) return current.folder
    const folder = res.filePaths[0]
    setNotebookFolder(folder)
    sessions.set(e.sender, new NotebookSession(folder))
    return folder
  })
}

export function bindDetachedNotebook(source: WebContents, target: WebContents): void {
  sessions.set(target, new NotebookSession(session(source).folder))
}
