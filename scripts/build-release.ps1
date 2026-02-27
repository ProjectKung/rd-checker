param(
  [string]$Version = "1.1.0",
  [string]$OutputDir = "dist"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$targetDir = Join-Path $root $OutputDir
$targetZip = Join-Path $targetDir ("rd-checker-" + $Version + ".zip")

if (-not (Test-Path $targetDir)) {
  New-Item -ItemType Directory -Path $targetDir | Out-Null
}

if (Test-Path $targetZip) {
  Remove-Item $targetZip -Force
}

$include = @(
  "manifest.json",
  "background.js",
  "content.js",
  "popup.html",
  "popup.css",
  "popup.js",
  "pm-pdf-check.js",
  "pdf-extractor.js",
  "data-parser.js",
  "theme.js",
  "pdf.min.js",
  "pdf.worker.min.js",
  "pdf.worker.js",
  "pako.min.js",
  "icon16.png",
  "icon32.png",
  "icon48.png",
  "icon128.png",
  "RDICON.png",
  "README.md",
  "SETUP.md",
  "updater",
  "updater-client"
)

$resolved = @()
foreach ($entry in $include) {
  $full = Join-Path $root $entry
  if (-not (Test-Path $full)) {
    throw "Missing required entry: $entry"
  }
  $resolved += $full
}

Compress-Archive -Path $resolved -DestinationPath $targetZip -Force
Write-Host ("Release package created: " + $targetZip)
