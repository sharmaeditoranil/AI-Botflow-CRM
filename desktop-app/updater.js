// App updates.
//
// The CRM itself is the live website, so its new features show up on the
// next load with no app update. This covers the app shell (window, menu,
// icon…), checked at launch and every 6 hours against
// https://dash.aibotflow.in/downloads/desktop/:
//
//   Windows — downloads in the background, then offers "Restart now"
//             (installs on quit otherwise).
//   Mac     — the app isn't Apple-signed, which macOS requires for silent
//             installs, so it offers to download the new .dmg instead.

const { app, dialog, net, shell } = require('electron')

const FEED = 'https://dash.aibotflow.in/downloads/desktop'
const EVERY_MS = 6 * 60 * 60 * 1000

function isNewer(latest, current) {
  const a = String(latest).split('.').map(Number)
  const b = String(current).split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0)
  }
  return false
}

function startWindows(getWindow) {
  const { autoUpdater } = require('electron-updater')
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('error', (err) => console.warn('[updater]', err?.message || err))
  autoUpdater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox(getWindow(), {
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `AI Botflow CRM ${info.version} is ready`,
      detail: 'Restart the app to finish updating. It will also update the next time you close it.',
    })
    if (response === 0) autoUpdater.quitAndInstall()
  })
  const check = () => autoUpdater.checkForUpdates().catch(() => {})
  check()
  setInterval(check, EVERY_MS)
}

function startMac(getWindow) {
  let offered = null
  const check = async () => {
    try {
      const res = await net.fetch(`${FEED}/version.json`, { cache: 'no-store' })
      if (!res.ok) return
      const { version, mac } = await res.json()
      if (!version || !isNewer(version, app.getVersion()) || offered === version) return
      offered = version
      const { response } = await dialog.showMessageBox(getWindow(), {
        type: 'info',
        buttons: ['Download update', 'Later'],
        defaultId: 0,
        cancelId: 1,
        title: 'Update available',
        message: `AI Botflow CRM ${version} is available`,
        detail: `You have ${app.getVersion()}. Download the new version, open it and drag the app into Applications to replace this one.`,
      })
      if (response === 0) shell.openExternal(mac || `${FEED}/AI-Botflow-CRM-Mac.dmg`)
    } catch {
      // Offline — try again later.
    }
  }
  check()
  setInterval(check, EVERY_MS)
}

/** Start update checks (packaged builds only). */
function startUpdates(getWindow) {
  if (!app.isPackaged) return
  if (process.platform === 'win32') startWindows(getWindow)
  else if (process.platform === 'darwin') startMac(getWindow)
}

module.exports = { startUpdates, isNewer }
