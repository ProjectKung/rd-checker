# Native Updater (No HTML)

This updater is a native Windows Forms executable.

- Output file: `RD-Checker-Updater-Setup.exe`
- Source file: `native-updater/Program.cs`
- Build script: `BUILD-RD-UPDATER-NATIVE.bat`

## One-Click Build

Double-click:

`BUILD-RD-UPDATER-NATIVE.bat`

This builds `RD-Checker-Updater-Setup.exe` in the repository root.

## Runtime Flow

1. App auto-checks latest package from GitHub Release
2. If not found, app falls back to `updater/update-manifest.json`
3. App downloads with progress
4. App launches downloaded installer automatically
