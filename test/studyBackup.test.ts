import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as user from '../src/main/db/user'
import { aiDb, vecLoadablePath } from '../src/main/ai/vectors'
import { createBackup, registerBackupIpc, stageRestore } from '../src/main/studyBackup'
import { setNotebookFolder } from '../src/main/notebook'
import { activateProfile, studyProfile } from '../src/main/studyProfile'

const profile = vi.hoisted(() => ({ root: '' }))
const desktop = vi.hoisted(() => ({
  handles: new Map<string, Function>(), checkpointError: '', savePath: '', resumed: false
}))
vi.mock('node:sqlite', () => createRequire(import.meta.url)('node:sqlite'))
vi.mock('electron', async () => {
  const { EventEmitter } = await vi.importActual<typeof import('node:events')>('node:events')
  const ipc = Object.assign(new EventEmitter(), { handle: (name: string, fn: Function) => desktop.handles.set(name, fn) })
  const sender = {
    id: 1, isDestroyed: () => false,
    send: (name: string, id?: string) => {
      if (name === 'backup:checkpoint') ipc.emit('backup:ready', { sender }, id, desktop.checkpointError)
      if (name === 'backup:resume') desktop.resumed = true
    }
  }
  const window = { webContents: sender }
  return {
    app: { getPath: () => profile.root }, ipcMain: ipc,
    BrowserWindow: { fromWebContents: () => window, getAllWindows: () => [window] },
    dialog: { showSaveDialog: () => ({ canceled: false, filePath: desktop.savePath }) }, shell: {}
  }
})
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
let temp: string, external: string

function moduleFile(name: string, bad = false) {
  const path = join(temp, name, 'Example.bbl')
  mkdirSync(join(temp, name))
  const db = new DatabaseSync(path)
  try {
    db.exec("CREATE TABLE Bible(Book, Chapter, Verse, Scripture); INSERT INTO Bible VALUES (1,1,1,'Original verse')")
    if (bad) db.exec("INSERT INTO Bible VALUES(1,NULL,2,'Unreadable reference')")
  } finally { db.close() }
  return path
}

beforeAll(() => {
  temp = mkdtempSync(join(tmpdir(), 'obs-study-test-'))
  profile.root = join(temp, 'user-data')
  mkdirSync(profile.root)
  external = join(temp, 'external-notebook')
  mkdirSync(external)
  setNotebookFolder(external)
  user.openUserDb()
})
afterAll(() => rmSync(temp, { recursive: true, force: true }))

describe('study storage', () => {
  it('rolls back an entire invalid module; ordinary saves commit and another import succeeds', () => {
    expect(() => user.importFromSqlite(moduleFile('broken', true))).toThrow('Invalid verse')
    expect(user.listImported()).toEqual([])
    user.saveNote({ book: 'John', chapter: 1, verse: 1, body: 'First line\nSecond line' })
    const other = new DatabaseSync(join(profile.root, 'user.sqlite'), { readOnly: true })
    try { expect(other.prepare('SELECT COUNT(*) n FROM notes').get()?.n).toBe(1) }
    finally { other.close() }

    const original = user.importFromSqlite(moduleFile('original'))
    const ref = { translation: original.id, book: 'Gen', chapter: 1, verse: 1 }
    expect(user.getImportedComparisonVerse(ref)).toEqual({ verse: 1, text: 'Original verse', tokens: null })
    expect(user.getImportedComparisonVerse({ ...ref, verse: 2 })).toBeNull()
    user.saveHighlight({ translation: original.id, book: 'Gen', chapter: 1, verse: 1, color: 'yellow', startToken: null, endToken: null })
    user.deleteImported(original.id)
    const replacement = user.importFromSqlite(moduleFile('replacement'))
    expect(replacement.id).not.toBe(original.id)
    expect(user.listHighlights({ translation: replacement.id, book: 'Gen', chapter: 1 })).toEqual([])
  })

  it('restores annotations, modules, learning, bookmarks, external Markdown, AI documents and reader settings', () => {
    user.addBookmark({ name: 'Opening', book: 'John', chapter: 1, verse: 1 })
    user.reviewCard('G3056', 'greek', 4)
    user.setLearnProgress('grammar', 'lesson-1', 'done')
    user.addHistory('Gen', 3)
    const note = join(external, 'Reading.md')
    writeFileSync(note, '# Reading\n\nλόγος')
    const state = JSON.stringify({ state: {
      theme: 'dark', chatMessages: [{ role: 'user', content: 'Study John' }],
      preferredTextOrder: { nt: ['BYZ', 'TR', 'NA'], ot: ['LXX', 'MT'], masoretic: ['ketiv', 'qere'] }
    }, version: 1 })
    writeFileSync(join(profile.root, 'ai-config.json'), '{"provider":"auto"}')
    const ai = aiDb()
    ai.exec(`INSERT INTO documents VALUES ('doc1','Study document',1,1,42);
      INSERT INTO chunks VALUES (1,'doc1',0,'An original user document');
      CREATE VIRTUAL TABLE chunk_vec USING vec0(embedding float[2]);
      INSERT INTO chunk_vec(rowid,embedding) VALUES (1,'[1,0]')`)

    const archive = join(temp, 'personal.obsbackup')
    createBackup(archive, state)
    writeFileSync(note, 'Edited after taking the backup')
    const dest = join(temp, 'restored')
    stageRestore(archive, dest)
    expect(readFileSync(note, 'utf8')).toBe('Edited after taking the backup')
    expect(readFileSync(join(dest, 'Notebooks', 'Reading.md'), 'utf8')).toBe('# Reading\n\nλόγος')
    expect(readFileSync(join(dest, 'reader-state.json'), 'utf8')).toBe(state)
    expect(readFileSync(join(dest, 'ai-config.json'), 'utf8')).toBe('{"provider":"auto"}')
    const restored = new DatabaseSync(join(dest, 'user.sqlite'), { readOnly: true })
    try {
      const current = new DatabaseSync(join(profile.root, 'user.sqlite'), { readOnly: true })
      try {
        for (const table of ['notes','highlights','bookmarks','reading_history','learn_progress','srs_cards','imported_translations','imported_verses','user_meta']) {
          const sql = `SELECT * FROM ${table} ORDER BY rowid`
          expect(restored.prepare(sql).all(), table).toEqual(current.prepare(sql).all())
        }
      } finally { current.close() }
    } finally { restored.close() }
    const restoredAi = new DatabaseSync(join(dest, 'ai.sqlite'), { readOnly: true, allowExtension: true })
    try {
      restoredAi.loadExtension(vecLoadablePath())
      expect(restoredAi.prepare('SELECT text FROM chunks').get()?.text).toBe('An original user document')
      expect(restoredAi.prepare('SELECT embedding FROM chunk_vec').get()?.embedding).toEqual(ai.prepare('SELECT embedding FROM chunk_vec').get()?.embedding)
    } finally { restoredAi.close() }

    const db = new DatabaseSync(archive)
    db.exec("UPDATE parts SET bytes=x'00' WHERE section='notebook' AND name='Reading.md'")
    db.close()
    const invalid = join(temp, 'invalid')
    expect(() => stageRestore(archive, invalid)).toThrow('Damaged backup file')
    expect(existsSync(invalid)).toBe(false)
    expect(existsSync(join(profile.root, 'active-study-profile'))).toBe(false)
  })

  it('keeps the existing profile and cancels the backup when an editor cannot flush its draft', async () => {
    registerBackupIpc()
    desktop.savePath = join(temp, 'draft-conflicted.obsbackup')
    desktop.checkpointError = 'Changed on disk'
    await expect(desktop.handles.get('backup:create')!({ sender: {} }, null)).rejects.toThrow('Changed on disk')
    expect(desktop.resumed).toBe(true)
    expect(existsSync(desktop.savePath)).toBe(false)
    desktop.checkpointError = ''
    await desktop.handles.get('backup:create')!({ sender: {} }, null)
    expect(existsSync(desktop.savePath)).toBe(true)
  })

  it('keeps open connections on the existing profile until the next launch', async () => {
    const id = '8847efbc-9650-4937-9ae8-5d95b9063413'
    const dest = join(profile.root, 'study-profiles', id)
    mkdirSync(dest, { recursive: true })
    user.snapshotUserDatabase(join(dest, 'user.sqlite'))
    activateProfile(id)
    expect(studyProfile().id).toBe('')
    vi.resetModules()
    const restarted = await import('../src/main/studyProfile')
    expect(restarted.studyProfile()).toEqual({ root: dest, id })
  })
})
