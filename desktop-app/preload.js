// Lets the web app know it runs inside the desktop app (e.g. to hide
// "Download app" prompts). Nothing else is exposed to the page.
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('aibotflowDesktop', {
  platform: process.platform,
})
