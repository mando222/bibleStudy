import { app, BrowserWindow, shell, nativeImage, ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { registerAiIpc } from './ai/ipc'
import { registerNotebookIpc } from './notebook'
import { registerUpdateIpc } from './updates'
import { openBibleDb } from './db/bible'
import { openUserDb } from './db/user'
import { runSmokeTest } from './smoke'

// Never let a stray rejection tear the whole app down for a tester — log it and keep running.
process.on('uncaughtException', (err) => console.error('[main] uncaughtException:', err))
process.on('unhandledRejection', (reason) => console.error('[main] unhandledRejection:', reason))

const isSmokeTest = process.argv.includes('--smoke-test')

/** The app icon at runtime: shipped to resources when packaged, else the repo's build/icon.png. */
function iconPath(): string | undefined {
  const candidates = [
    join(process.resourcesPath ?? '', 'icon.png'), // packaged (electron-builder extraResources)
    join(app.getAppPath(), 'build', 'icon.png'), // dev
    join(app.getAppPath(), '..', 'build', 'icon.png')
  ]
  return candidates.find((p) => p && existsSync(p))
}

const PRELOAD = () => join(__dirname, '../preload/index.js')
const RENDERER_HTML = () => join(__dirname, '../renderer/index.html')

/** External links open in the browser; in-app navigation away from the SPA is blocked. */
function hardenWindow(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) {
      e.preventDefault()
      if (/^https?:/.test(url)) shell.openExternal(url)
    }
  })
}

/** Load the SPA renderer into a window, optionally in a "?window=<mode>" sub-view. */
function loadRenderer(win: BrowserWindow, mode?: string): void {
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'] + (mode ? `?window=${mode}` : ''))
  } else {
    win.loadFile(RENDERER_HTML(), mode ? { query: { window: mode } } : {})
  }
}

function createWindow(): void {
  const icon = iconPath()
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'Open Bible Study',
    backgroundColor: '#faf8f4',
    ...(icon ? { icon } : {}), // window/taskbar icon (esp. Linux; ignored on macOS)
    webPreferences: {
      preload: PRELOAD(),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())
  hardenWindow(mainWindow)
  loadRenderer(mainWindow)
}

// The detachable Notebook — its own movable window, part of the same app. One at a time; a second
// request just focuses the existing one.
let notebookWin: BrowserWindow | null = null
function openNotebookWindow(): void {
  if (notebookWin && !notebookWin.isDestroyed()) {
    notebookWin.focus()
    return
  }
  const icon = iconPath()
  notebookWin = new BrowserWindow({
    width: 480,
    height: 680,
    minWidth: 320,
    minHeight: 360,
    title: 'Notebook — Open Bible Study',
    backgroundColor: '#faf8f4',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: PRELOAD(),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  notebookWin.on('closed', () => {
    notebookWin = null
  })
  hardenWindow(notebookWin)
  loadRenderer(notebookWin, 'notebook')
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
    registerNotebookIpc()
    registerUpdateIpc()
    ipcMain.handle('notebook:openWindow', () => openNotebookWindow())
    openBibleDb() // open the bundled DB if present; renderer shows a hint otherwise
    openUserDb() // create/open the writable user DB (notes + highlights)

    if (isSmokeTest) {
      await runSmokeTest() // exits the process with 0 (ok) or 1 (a release would be broken)
      return
    }

    // macOS dock icon: packaged apps get it from the .app bundle, but `npm run dev` shows the
    // default Electron icon unless we set it explicitly.
    if (process.platform === 'darwin' && !app.isPackaged) {
      const icon = iconPath()
      if (icon) app.dock?.setIcon(nativeImage.createFromPath(icon))
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
