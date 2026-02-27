# RD Checker Updater Client

## Purpose
This client provides a game-style update experience:
- Check for latest version
- Show update notes
- Display download progress bar
- Show successful completion screen

## Run
Open `updater-client/index.html` in a browser.

## Update Source
The client reads `updater/update-manifest.json` from:
- `https://raw.githubusercontent.com/ProjectKung/rd-checker/main/updater/update-manifest.json`
- local fallback manifest (inside `updater-client/app.js`) if remote is unavailable

## Release Package
Generate a release ZIP:

```powershell
.\scripts\build-release.ps1 -Version 1.1.0
```

Then upload the generated file in `dist/` and update:
- `updater/update-manifest.json` (`version`, `package_name`, `package_url`)
- `updater/CHANGELOG.md`
