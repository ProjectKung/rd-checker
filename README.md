# RD Checker

RD Checker consists of:
- Chrome extension (`manifest.json`, `popup.*`, `background.js`, `content.js`)
- Native updater executable (`RD-Checker-Updater-Setup.exe`)

## Current Versions

- Extension version: `1.1.5`
- Native updater version: `1.1.5`

## Updater Package Policy

Repository now keeps a single updater package filename only:

- `updater/RD-Checker-Updater-Setup.exe`

No version-suffixed updater package files are kept in `updater/`.

## Native Updater Behavior

When you run `RD-Checker-Updater-Setup.exe`:

1. It checks GitHub Release API and `updater/update-manifest.json`.
2. It compares both sources and uses the higher version package.
3. It downloads update package into `%TEMP%\\RDCheckerUpdater`.
4. If the package is `.exe`, it auto-replaces itself and restarts from installed path.
5. If an old updater launches from temp, it promotes itself back to installed path automatically.

## Key Files

- Extension manifest: `manifest.json`
- Native updater source: `native-updater/Program.cs`
- Updater manifest: `updater/update-manifest.json`
- Published updater binary: `updater/RD-Checker-Updater-Setup.exe`

## Developer Notes

- Build output should be copied to both:
  - `RD-Checker-Updater-Setup.exe`
  - `updater/RD-Checker-Updater-Setup.exe`
- Temporary compiler artifacts (`CSC*.TMP`) are not runtime files and should be cleaned.

