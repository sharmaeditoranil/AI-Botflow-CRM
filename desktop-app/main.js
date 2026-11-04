// AI Botflow CRM — desktop app (Mac & Windows).
//
// A window onto https://dash.aibotflow.in, like the Android app: the
// CRM stays in the app, sign-in (Google / Facebook) happens inside it,
// and every other link opens in the default browser.

const { app, BrowserWindow, Menu, session, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { startUpdates } = require('./updater')

const APP_URL = 'https://dash.aibotflow.in/inbox'

// Pages that belong inside the app window.
const INTERNAL_HOSTS = ['dash.aibotflow.in', 'behqbokdnwsaflapewjf.supabase.co']
// Sign-in / connect flows that must finish inside the app so the session lands here.
const AUTH_HOSTS = [
  'accounts.google.com',
  'accounts.youtube.com',
  'www.facebook.com',
  'm.facebook.com',
  'web.facebook.com',
  'business.facebook.com',
  'www.instagram.com',
  'api.instagram.com',
]

function hostOf(url) {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

const isInternal = (url) => INTERNAL_HOSTS.includes(hostOf(url))
const isAuth = (url) => AUTH_HOSTS.includes(hostOf(url))

function openExternal(url) {
  if (/^(https?:|mailto:|tel:|whatsapp:)/i.test(url)) shell.openExternal(url)
}

// ---------- window size memory ----------
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json')

function loadBounds() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8'))
  } catch {
    return { width: 1360, height: 860 }
  }
}

function saveBounds(win) {
  try {
    const bounds = win.getNormalBounds()
    fs.writeFileSync(stateFile(), JSON.stringify({ ...bounds, maximized: win.isMaximized() }))
  } catch {
    // Not worth failing over.
  }
}

// ---------- main window ----------
let mainWindow = null

function createWindow() {
  const bounds = loadBounds()
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 600,
    title: 'AI Botflow CRM',
    backgroundColor: '#ffffff',
    icon: path.join(__dirname, 'build', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  })

  if (bounds.maximized) mainWindow.maximize()
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('close', () => saveBounds(mainWindow))

  const wc = mainWindow.webContents

  // Same-window navigation: CRM + sign-in stay, everything else → browser.
  wc.on('will-navigate', (event, url) => {
    if (isInternal(url) || isAuth(url)) return
    event.preventDefault()
    openExternal(url)
  })

  // window.open / target=_blank: sign-in popups open as app windows,
  // other links in the browser.
  wc.setWindowOpenHandler(({ url }) => {
    if (isAuth(url) || isInternal(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 720,
          parent: mainWindow,
          autoHideMenuBar: true,
          webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
        },
      }
    }
    openExternal(url)
    return { action: 'deny' }
  })

  // No internet / server unreachable → friendly retry page.
  wc.on('did-fail-load', (_event, code, _desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* aborted (redirect) */) return
    mainWindow.loadFile(path.join(__dirname, 'offline.html'), { query: { url: url || APP_URL } })
  })

  // Unread count in the title ("(3) Inbox") → dock / taskbar badge.
  wc.on('page-title-updated', (_event, title) => {
    const m = /^\((\d+)\)/.exec(title)
    const count = m ? Number(m[1]) : 0
    if (process.platform === 'darwin') app.dock.setBadge(count ? String(count) : '')
    else if (count && !mainWindow.isFocused()) mainWindow.flashFrame(true)
  })
  mainWindow.on('focus', () => mainWindow.flashFrame(false))

  mainWindow.loadURL(APP_URL)
}

// ---------- menu ----------
function buildMenu() {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Inbox', accelerator: 'CmdOrCtrl+1', click: () => mainWindow?.loadURL(APP_URL) },
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.webContents.reload() },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [{ label: 'Open in Browser', click: () => shell.openExternal(mainWindow?.webContents.getURL() || APP_URL) }],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ---------- app lifecycle ----------
// One instance only: a second launch focuses the open window.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  // Windows shows this app's name and icon on its notifications.
  if (process.platform === 'win32') app.setAppUserModelId('in.aibotflow.crm.desktop')

  app.whenReady().then(() => {
    // Google blocks sign-in from browsers it labels "embedded"; present as
    // the Chrome this app is built on.
    const ua = session.defaultSession.getUserAgent().replace(/\s(Electron|aibotflow-desktop|AI Botflow CRM)\/\S+/g, '')
    session.defaultSession.setUserAgent(ua)
    app.userAgentFallback = ua

    // Notifications, mic (voice notes) and clipboard for the CRM itself only.
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
      const allowed = ['notifications', 'media', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen']
      callback(isInternal(wc.getURL()) && allowed.includes(permission))
    })

    buildMenu()
    createWindow()
    startUpdates(() => mainWindow)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
      else mainWindow?.show()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
