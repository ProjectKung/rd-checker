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
2. Click `Check for Update`
3. If update exists, click `Update Now`
4. Wait until download reaches 100%
5. Click `Install and Restart`

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
