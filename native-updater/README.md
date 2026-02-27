# Native Updater

Windows Forms updater executable for RD Checker.

- Main source: `native-updater/Program.cs`
- Root output: `RD-Checker-Updater-Setup.exe`
- Published package: `updater/RD-Checker-Updater-Setup.exe`

## Runtime Flow

1. App checks latest package from GitHub Release API.
2. If no release asset is found, app falls back to `updater/update-manifest.json`.
3. App downloads package to `%TEMP%\RDCheckerUpdater`.
4. If package is `.exe`, app schedules self-replace and restarts from original path.
5. If started from temp (legacy flow), app promotes itself back to installed path automatically.
6. Non-`.exe` package types are launched after download.

## Build (Developer)

Compile with C# compiler (`csc.exe`), then copy output to both:

- `RD-Checker-Updater-Setup.exe`
- `updater/RD-Checker-Updater-Setup.exe`
