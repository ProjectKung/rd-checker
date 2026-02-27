# RD Checker Changelog

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
