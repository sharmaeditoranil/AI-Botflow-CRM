# AI Botflow CRM — desktop app (Mac & Windows)

An Electron window onto https://dash.aibotflow.in, like `android-app/`.
CRM changes ship with the website and appear in the app on the next
load. A new app build is only needed to change the shell (`main.js`,
`updater.js`, icon, menu).

## Build

```bash
cd desktop-app
npm install
# If your shell sets ELECTRON_RUN_AS_NODE (VS Code does), unset it first.
env -u ELECTRON_RUN_AS_NODE CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac   # dist/AI-Botflow-CRM-Mac.dmg (universal)
env -u ELECTRON_RUN_AS_NODE npm run dist:win                                     # dist/AI-Botflow-CRM-Setup.exe (x64)
```

Builds are unsigned: macOS asks to confirm the first open (right-click →
Open), Windows SmartScreen shows "More info → Run anyway".

## Release an update

1. Bump `version` in `package.json` (e.g. 1.0.0 → 1.0.1) and build both.
2. Upload to `/var/www/downloads/desktop/` on the server:
   `AI-Botflow-CRM-Mac.dmg`, `AI-Botflow-CRM-Setup.exe`,
   `AI-Botflow-CRM-Setup.exe.blockmap`, `latest.yml`, and `version.json`
   with the new version (`{"version":"1.0.1","mac":"…dmg","win":"…exe"}`).
3. Installed apps check every 6 hours and at launch: Windows downloads
   and offers "Restart now"; Mac offers to download the new .dmg.
