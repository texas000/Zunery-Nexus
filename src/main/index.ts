import { app, shell, BrowserWindow, ipcMain, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc-handlers'
import { startAdkServer, stopAdkServer } from './adk-bridge'
import { getSettings } from './database'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const iconPath = process.platform === 'darwin'
    ? undefined
    : (is.dev ? join(process.cwd(), 'build/icons/icon.png') : join(__dirname, '../build/icons/icon.png'))

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#09090b',
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  registerIpcHandlers(mainWindow)
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.zunery.nexus')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  // Ensure macOS Dock shows the custom icon during dev and in production
  if (process.platform === 'darwin') {
    try {
      const dockIconPath = is.dev ? join(process.cwd(), 'build/icons/icon.png') : join(__dirname, '../build/icons/icon.png')
      const dockImg = nativeImage.createFromPath(dockIconPath)
      if (!dockImg.isEmpty()) app.dock.setIcon(dockImg)
    } catch (e) {
      console.warn('[Main] failed to set dock icon', e)
    }
  }

  // Start ADK server in background
  const settings = getSettings()
  if (settings['adk.enabled'] === 'true') {
    const rawPythonPath = settings['adk.pythonPath'] || 'python3'
    // On Windows, 'python3' is a Microsoft Store alias — use 'python' instead
    const pythonPath = process.platform === 'win32' && rawPythonPath === 'python3' ? 'python' : rawPythonPath
    startAdkServer(pythonPath)
      .then((result) => {
        if (result.ok) {
          console.log('[Main] ADK server started')
          mainWindow?.webContents.send('adk:status-change', { running: true })
        } else {
          console.log('[Main] ADK server not available:', result.error)
          mainWindow?.webContents.send('adk:status-change', { running: false, error: result.error })
        }
      })
      .catch(console.error)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopAdkServer()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopAdkServer()
})

// Keep ipcMain reference for ping test
ipcMain.on('ping', () => console.log('pong'))
