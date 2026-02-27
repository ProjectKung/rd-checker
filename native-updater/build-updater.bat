@echo off
setlocal

cd /d "%~dp0"

set "ROOT_DIR=%~dp0.."
for %%I in ("%ROOT_DIR%") do set "ROOT_DIR=%%~fI"

set "SRC_FILE=%~dp0Program.cs"
set "ICON_FILE=%~dp0app.ico"
set "OUT_ROOT=%ROOT_DIR%\RD-Checker-Updater-Setup.exe"
set "OUT_UPDATER=%ROOT_DIR%\updater\RD-Checker-Updater-Setup.exe"

if not exist "%SRC_FILE%" (
  echo [ERROR] Program.cs not found: "%SRC_FILE%"
  exit /b 1
)

if not exist "%ICON_FILE%" (
  echo [ERROR] app.ico not found: "%ICON_FILE%"
  exit /b 1
)

if not exist "%ROOT_DIR%\updater" (
  mkdir "%ROOT_DIR%\updater" >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] Cannot create updater folder: "%ROOT_DIR%\updater"
    exit /b 1
  )
)

set "CSC_EXE="
where /q csc
if not errorlevel 1 (
  set "CSC_EXE=csc"
)

if not defined CSC_EXE if exist "%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" (
  set "CSC_EXE=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
)

if not defined CSC_EXE if exist "%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe" (
  set "CSC_EXE=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)

if not defined CSC_EXE (
  echo [ERROR] csc.exe not found.
  echo         Install .NET Framework developer tools or run from VS Developer Command Prompt.
  exit /b 1
)

echo [INFO] Using compiler: "%CSC_EXE%"
echo [INFO] Building updater...

"%CSC_EXE%" /nologo /target:winexe /out:"%OUT_ROOT%" ^
  /win32icon:"%ICON_FILE%" ^
  /r:System.dll ^
  /r:System.Core.dll ^
  /r:System.Drawing.dll ^
  /r:System.Windows.Forms.dll ^
  /r:System.Web.Extensions.dll ^
  /r:System.IO.Compression.dll ^
  /r:System.IO.Compression.FileSystem.dll ^
  "%SRC_FILE%"

if errorlevel 1 (
  echo [ERROR] Build failed.
  exit /b 1
)

copy /y "%OUT_ROOT%" "%OUT_UPDATER%" >nul
if errorlevel 1 (
  echo [ERROR] Built root exe, but failed to copy to updater folder.
  exit /b 1
)

echo [OK] Build completed.
echo [OK] Updated:
echo      "%OUT_ROOT%"
echo      "%OUT_UPDATER%"
exit /b 0
