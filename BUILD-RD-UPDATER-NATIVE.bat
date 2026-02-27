@echo off
setlocal

cd /d "%~dp0"
title Build RD Checker Native Updater

set "CSC=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"

if not exist "%CSC%" (
  echo ERROR: csc.exe not found on this machine.
  pause
  exit /b 1
)

if not exist "native-updater\Program.cs" (
  echo ERROR: native-updater\Program.cs not found.
  pause
  exit /b 1
)

set "ICON_PATH=native-updater\app-zoom.ico"
if not exist "%ICON_PATH%" set "ICON_PATH=native-updater\app.ico"

if not exist "%ICON_PATH%" (
  echo ERROR: no icon file found. Checked native-updater\app-zoom.ico and native-updater\app.ico
  pause
  exit /b 1
)

echo Building RD-Checker-Updater-Setup.exe ...
"%CSC%" /nologo /target:winexe /platform:x64 ^
  /out:"RD-Checker-Updater-Setup.exe" ^
  /win32icon:"%ICON_PATH%" ^
  /reference:System.dll ^
  /reference:System.Core.dll ^
  /reference:System.Drawing.dll ^
  /reference:System.Windows.Forms.dll ^
  /reference:System.Web.Extensions.dll ^
  "native-updater\Program.cs"

if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

echo Build complete: %cd%\RD-Checker-Updater-Setup.exe
start "" "%cd%"
pause
exit /b 0
