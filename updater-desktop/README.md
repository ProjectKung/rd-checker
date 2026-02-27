# RD Checker Updater Desktop (.exe)

This wraps the updater UI into an installable Windows application with in-app update support.

## Build Steps

1. Open terminal at `updater-desktop`
2. Install dependencies

```powershell
npm install
```

3. Build `.exe`

```powershell
npm run build:win
```

Output will be in `updater-desktop/dist-exe/` as:
- `RD-Checker-Updater-Setup-1.1.0.exe`

## In-App Update Flow (Installed App)

1. Install and open `RD Checker Updater`
2. App auto-checks update immediately
3. If update exists, app auto-downloads and auto-installs
4. App restarts itself after update is installed

User side does not need terminal commands. They only run:
- `RD-Checker-Updater-Setup-<version>.exe`

## GitHub Release Publish (for real update delivery)

In `updater-desktop`:

```powershell
$env:GH_TOKEN="<your_github_token>"
npm run publish:win
```

This publishes installer + update metadata (`latest.yml`) to GitHub Releases for:
- `ProjectKung/rd-checker`

## Run in dev mode

```powershell
npm start
```

Note: `npm start` is dev mode only. In-app auto update works only in installed (packaged) app.
