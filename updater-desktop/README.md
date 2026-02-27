# RD Checker Updater Desktop (.exe)

This wraps the updater UI into a Windows executable using Electron.

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
- `RD-Checker-Updater-1.1.0.exe`

## Run in dev mode

```powershell
npm start
```
