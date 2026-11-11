import { app, BrowserWindow, dialog, ipcMain, type IpcMainEvent } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { listNotebook, notebookFolder } from './notebook'
import { snapshotUserDatabase, USER_SCHEMA_VERSION } from './db/user'
import { aiDb, vecLoadablePath } from './ai/vectors'
import { activateProfile, studyProfile } from './studyProfile'
import { extractStudyArchive, writeStudyArchive } from './studyArchive'

export function createBackup(path: string, state: string | null): void {
  const folder = notebookFolder()
  const profile = studyProfile()
  const temp = mkdtempSync(join(tmpdir(), 'obs-study-backup-'))
  try {
    const user = join(temp, 'user.sqlite')
    snapshotUserDatabase(user)
    const files: Parameters<typeof writeStudyArchive>[1] = [{ section: 'profile', name: 'user.sqlite', source: user }]
    if (existsSync(join(profile.root, 'ai.sqlite'))) {
      const ai = join(temp, 'ai.sqlite')
      aiDb().prepare('VACUUM INTO ?').run(ai)
      files.push({ section: 'profile', name: 'ai.sqlite', source: ai })
    }
    for (const name of ['ai-config.json', 'updates.json', 'system-prompt.md']) {
      const source = join(profile.root, name)
      if (existsSync(source)) files.push({ section: 'profile', name, source })
    }
    if (state !== null) {
      validateReaderState(state)
      files.push({ section: 'profile', name: 'reader-state.json', text: state })
    }
    for (const file of listNotebook(folder)) files.push({ section: 'notebook', name: file.name, source: join(folder, file.name) })
    writeStudyArchive(path, files)
  } finally { rmSync(temp, { recursive: true, force: true }) }
}

function validateReaderState(state: string): void {
  const saved = JSON.parse(state)
  if (!saved || !saved.state || typeof saved.state !== 'object' || Array.isArray(saved.state)) {
    throw new Error('Invalid reader settings in backup.')
  }
}

function verifyDatabase(path: string, isAi: boolean): void {
  const db = new DatabaseSync(path, { readOnly: true, allowExtension: isAi })
  try {
    db.exec('PRAGMA trusted_schema=OFF')
    if (isAi) {
      db.loadExtension(vecLoadablePath())
      db.enableLoadExtension(false)
    }
    const checks = db.prepare('PRAGMA quick_check').all()
    if (checks.length !== 1 || checks[0].quick_check !== 'ok') throw new Error('Damaged study database in backup.')
    if (db.prepare("SELECT 1 FROM sqlite_schema WHERE type IN ('trigger','view')").get()) {
      throw new Error('Unexpected database schema in backup.')
    }
    if (isAi) {
      db.prepare('SELECT id,name,chunks,active FROM documents LIMIT 0')
      db.prepare('SELECT id,doc_id,ordinal,text FROM chunks LIMIT 0')
      return
    }
    const schema = db.prepare("SELECT value FROM user_meta WHERE key='schema_version'").get()?.value
    if (Number(schema) !== USER_SCHEMA_VERSION) throw new Error('Unsupported user database version in backup.')
    for (const [table, columns] of Object.entries({
      highlights: 'id,translation,book,chapter,verse,start_token,end_token,color,created_at',
      notes: 'id,book,chapter,verse,body,created_at,updated_at',
      imported_translations: 'id,abbrev,name,direction,added_at',
      imported_verses: 'translation_id,book_id,chapter,verse,text',
      bookmarks: 'id,name,book,chapter,verse,note,created_at',
      reading_history: 'id,book,chapter,verse,visited_at',
      learn_progress: 'module,key,value,updated_at',
      srs_cards: 'strongs,language,ease,interval_days,due_at,reps,lapses,last_grade,updated_at'
    })) db.prepare(`SELECT ${columns} FROM ${table} LIMIT 0`)
  } finally { db.close() }
}

export function stageRestore(archive: string, profileRoot: string): void {
  mkdirSync(profileRoot, { mode: 0o700 })
  try {
    extractStudyArchive(archive, profileRoot)
    verifyDatabase(join(profileRoot, 'user.sqlite'), false)
    if (existsSync(join(profileRoot, 'ai.sqlite'))) verifyDatabase(join(profileRoot, 'ai.sqlite'), true)
    for (const name of ['ai-config.json', 'updates.json', 'reader-state.json']) {
      const file = join(profileRoot, name)
      if (!existsSync(file)) continue
      const text = readFileSync(file, 'utf8')
      if (name === 'reader-state.json') validateReaderState(text)
      else {
        const config = JSON.parse(text)
        if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Invalid preferences in backup.')
      }
    }
  } catch (err) {
    rmSync(profileRoot, { recursive: true, force: true })
    throw err
  }
}

let busy = false
async function withCheckpoints<T>(fn: () => Promise<T>): Promise<T> {
  if (busy) throw new Error('A backup or restore is already running.')
  busy = true
  const windows = BrowserWindow.getAllWindows()
  const waits = windows.map(w => w.webContents)
  const pending = new Set(waits.map(w => w.id))
  const id = randomUUID()
  let listener: ((event: IpcMainEvent, key: string, error: unknown) => void) | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    await new Promise<void>((resolve, reject) => {
      listener = (event, key, error) => {
        if (key !== id || !pending.delete(event.sender.id)) return
        if (error) reject(new Error(`Save the open notebook draft before continuing. ${String(error)}`))
        else if (!pending.size) resolve()
      }
      ipcMain.on('backup:ready', listener)
      timeout = setTimeout(() => reject(new Error('An open window could not finish saving. Close it and try again.')), 10000)
      for (const sender of waits) sender.send('backup:checkpoint', id)
      if (!pending.size) resolve()
    })
    return await fn()
  } finally {
    clearTimeout(timeout)
    if (listener) ipcMain.removeListener('backup:ready', listener)
    for (const sender of waits) if (!sender.isDestroyed()) sender.send('backup:resume')
    busy = false
  }
}

export function registerBackupIpc(): void {
  ipcMain.handle('backup:profile', () => {
    const { id, root } = studyProfile()
    const initial = join(root, 'reader-state.json')
    return { id, initialState: id && existsSync(initial) ? readFileSync(initial, 'utf8') : null }
  })
  const filters = [{ name: 'Open Bible Study backup', extensions: ['obsbackup'] }]
  ipcMain.handle('backup:create', async (event, state: string | null) => {
    const win = BrowserWindow.fromWebContents(event.sender)!
    const result = await dialog.showSaveDialog(win, {
      title: 'Save study backup', defaultPath: 'Open Bible Study.obsbackup', filters
    })
    if (result.canceled || !result.filePath) return null
    const path = result.filePath
    if (!/\.obsbackup$/i.test(path)) throw new Error('Choose a file with the .obsbackup extension.')
    return withCheckpoints(async () => { createBackup(path, state); return path })
  })
  ipcMain.handle('backup:restore', async (event, state: string | null) => {
    const win = BrowserWindow.fromWebContents(event.sender)!
    const result = await dialog.showOpenDialog(win, { title: 'Restore study backup', properties: ['openFile'], filters })
    if (result.canceled || !result.filePaths[0]) return null
    const consent = await dialog.showMessageBox(win, {
      type: 'question', buttons: ['Cancel', 'Restore and restart'], defaultId: 0, cancelId: 0,
      message: 'Restore this backup and restart Open Bible Study?',
      detail: 'The restored study data and notebooks will open in a new profile. Your current data will also be saved in a recovery backup. Existing notebook folders stay on disk.'
    })
    if (consent.response !== 1) return null
    return withCheckpoints(async () => {
      const id = randomUUID()
      const home = app.getPath('userData')
      const profiles = join(home, 'study-profiles')
      mkdirSync(profiles, { recursive: true, mode: 0o700 })
      const folder = join(profiles, id)
      stageRestore(result.filePaths[0], folder)
      const recoveryDir = join(home, 'study-backups')
      const recovery = join(recoveryDir, `Before restore ${id}.obsbackup`)
      try {
        mkdirSync(recoveryDir, { recursive: true, mode: 0o700 })
        createBackup(recovery, state)
        activateProfile(id)
      } catch (err) {
        rmSync(folder, { recursive: true, force: true })
        throw err
      }
      await dialog.showMessageBox(win, { type: 'info', buttons: ['Restart now'],
        message: 'Your study backup is ready.', detail: `Recovery backup: ${recovery}\nRestored notebooks: ${join(folder, 'Notebooks')}` })
      app.relaunch()
      app.exit(0)
      return { recovery, folder }
    })
  })
}
