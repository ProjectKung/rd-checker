# RD Checker Changelog

## 1.1.11 - 2026-02-27
- Merged pending working-tree updates into release.
- Bumped extension/updater version to `1.1.11`.

## 1.1.10 - 2026-02-27
- Version bump to `1.1.10`.
- Kept updater full-folder sync behavior from GitHub `main`.

## 1.1.9 - 2026-02-27
- Added full project-folder sync from GitHub `main` when updater is already on latest version.
- Updater now refreshes extension files in the installed directory, not only its own EXE.
- Bumped extension/updater release to `1.1.9`.

## 1.1.8 - 2026-02-27
- Forced popup startup mode to "เช็คทั้งหมด" in runtime JavaScript.
- Fixed cases where old mode still appeared selected after update.
- Bumped extension/updater release to `1.1.8`.

## 1.1.7 - 2026-02-27
- Changed RD Checker popup default mode to "เช็คทั้งหมด" (`checkModeAll`).
- Updated updater build note text for this release.
- Bumped extension/updater release to `1.1.7`.

## 1.1.6 - 2026-02-27
- Updated Current Build display text to avoid stale commit-hash confusion.
- Bumped updater package version to `1.1.6` so clients on `1.1.5` can auto-update.
- Kept single-file updater package flow (`RD-Checker-Updater-Setup.exe`).

## 1.1.5 - 2026-02-27
- Changed updater manifest source to `.../HEAD/updater/update-manifest.json` to avoid stale `main` cache.
- Updater now resolves package from both GitHub Release API and manifest, then chooses the higher version.
- Updated package URL in manifest to `.../HEAD/updater/RD-Checker-Updater-Setup.exe`.

## 1.1.4 - 2026-02-27
- Added cache-busting query parameters for update checks and package downloads.
- Added no-cache HTTP headers in updater WebClient to reduce stale CDN responses.
- This makes clicking `RD-Checker-Updater-Setup.exe` pick up GitHub updates faster.

## 1.1.3 - 2026-02-27
- Updated documentation to match current updater behavior.
- Kept updater package as single fixed filename (`updater/RD-Checker-Updater-Setup.exe`).
- Cleaned non-runtime helper/temp files from repository.

## 1.1.2 - 2026-02-27
- Test release to validate end-to-end self-update flow from `1.1.1`.
- Kept auto-replace and restart behavior for updater executable packages.
- Switched updater package to a single fixed filename: `RD-Checker-Updater-Setup.exe`.

## 1.1.1 - 2026-02-27
- Updated updater executable icon to use the new design.
- Improved icon scaling so desktop icon appears larger and clearer.
- Updated native build script to prioritize `native-updater/app-zoom.ico`.
- Updater now auto-replaces its own EXE and restarts automatically.

## 1.1.0 - 2026-02-27
- Added standalone updater client in `updater-client/`.
- Added patch note rendering from `updater/update-manifest.json`.
- Added game-style progress bar and download status reporting.
- Added successful completion panel after update package download.

## 1.0.0
- Initial RD Checker extension baseline.
