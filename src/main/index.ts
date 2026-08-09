import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { registerAiIpc } from './ai/ipc'
import { openBibleDb } from './db/bible'
import { openUserDb } from './db/user'
import { runSmokeTest } from './smoke'

// Never let a stray rejection tear the whole app down for a tester — log it and keep running.
process.on('uncaughtException', (err) => console.error('[main] uncaughtException:', err))
process.on('unhandledRejection', (reason) => console.error('[main] unhandledRejection:', reason))

const isSmokeTest = process.argv.includes('--smoke-test')

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'Open Bible Study',
    backgroundColor: '#faf8f4',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  // External links open in the user's browser, never in-app.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
  // Block any in-app navigation away from the SPA (e.g. a dropped file or stray link).
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      e.preventDefault()
      if (/^https?:/.test(url)) shell.openExternal(url)
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Only one instance may write to user.sqlite. A second launch focuses the existing window.
if (!isSmokeTest && !app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(async () => {
    registerIpc()
    registerAiIpc()
    openBibleDb() // open the bundled DB if present; renderer shows a hint otherwise
    openUserDb() // create/open the writable user DB (notes + highlights)

    if (isSmokeTest) {
      await runSmokeTest() // exits the process with 0 (ok) or 1 (a release would be broken)
      return
    }

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
