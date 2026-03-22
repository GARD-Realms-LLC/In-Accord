@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

title In-Accord Portable Build

if not exist "package.json" (
  echo [ERROR] package.json not found. Run this from the project root.
  exit /b 1
)

set "BUILD_OUTPUT_DIR=dist\Win Dev"
set "ELECTRON_CACHE=%CD%\.electron-cache\electron"
set "ELECTRON_BUILDER_CACHE=%CD%\.electron-cache\builder"
set "TEMP=%CD%\.electron-cache\tmp"
set "TMP=%CD%\.electron-cache\tmp"
set "PROJECT_DIR_SLASH=%CD:\=/%"
set "WIN_ICON=%PROJECT_DIR_SLASH%/dist/Win Dev/fav.ico"
set "NEXT_BUILD_LOG=%CD%\portable-next-build.log"

if not exist "%TEMP%" mkdir "%TEMP%"
if not exist "%ELECTRON_CACHE%" mkdir "%ELECTRON_CACHE%"
if not exist "%ELECTRON_BUILDER_CACHE%" mkdir "%ELECTRON_BUILDER_CACHE%"

echo.
echo [1/5] Stopping likely lock-holding processes...
taskkill /F /IM In-Accord-V2.exe >nul 2>&1
taskkill /F /IM electron.exe >nul 2>&1
taskkill /F /IM app-builder.exe >nul 2>&1
taskkill /F /IM makensis.exe >nul 2>&1
echo [2/5] Cleaning lock state...
call npm run cleanup:dist-locks
if errorlevel 1 goto :fail

echo [3/5] Building app (portable profile)...
echo        This can take several minutes with little output while Next.js compiles.
echo        Lint is enabled for this build (no --no-lint flag).
set "NEXT_BUILD_ATTEMPT=1"

:next_build_retry
echo        Next build attempt !NEXT_BUILD_ATTEMPT!/3...
call npm run clean:next
if errorlevel 1 goto :fail

call npx next build > "%NEXT_BUILD_LOG%" 2>&1
if errorlevel 1 (
  echo [WARN] Next build failed on attempt !NEXT_BUILD_ATTEMPT!.
  findstr /I /C:"Cannot find module './" /C:"webpack-runtime.js" "%NEXT_BUILD_LOG%" >nul
  if not errorlevel 1 (
    if !NEXT_BUILD_ATTEMPT! LSS 3 (
      set /a NEXT_BUILD_ATTEMPT+=1
      echo [WARN] Detected transient Next chunk-resolution failure. Retrying clean build...
      goto :next_build_retry
    )
  )
  echo [ERROR] Next build failed. Last log excerpt:
  powershell -NoProfile -Command "if (Test-Path '%NEXT_BUILD_LOG%') { Get-Content '%NEXT_BUILD_LOG%' -Tail 80 }"
  goto :fail
)

powershell -NoProfile -Command "if (Test-Path '%NEXT_BUILD_LOG%') { Get-Content '%NEXT_BUILD_LOG%' -Tail 20 }"

if not exist ".next\BUILD_ID" (
  echo [WARN] .next\BUILD_ID missing after Next build. Retrying once...
  call npx next build >> "%NEXT_BUILD_LOG%" 2>&1
  if errorlevel 1 goto :fail
)

if not exist ".next\BUILD_ID" (
  echo [ERROR] Missing .next\BUILD_ID after build. Packaging cannot continue.
  goto :fail
)

echo [4/5] Preparing Windows icon...
call npm run prepare:win-fav-icon
if errorlevel 1 goto :fail

if not exist "dist\Win Dev\fav.ico" (
  echo [ERROR] Missing icon: dist\Win Dev\fav.ico
  goto :fail
)

echo [5/5] Building single-file portable EXE (attempt 1)...
echo        This is the longest step. It may appear stalled while packing files.
call .\node_modules\.bin\electron-builder.cmd --win portable --x64 --config.directories.output="dist/Win Dev" --config.win.icon="%WIN_ICON%" --config.win.signAndEditExecutable=false
if errorlevel 1 (
  echo.
  echo [WARN] Attempt 1 failed. Retrying with maximum compression...
  taskkill /F /IM app-builder.exe >nul 2>&1
  taskkill /F /IM makensis.exe >nul 2>&1
  call .\node_modules\.bin\electron-builder.cmd --win portable --x64 --config.directories.output="dist/Win Dev" --config.win.icon="%WIN_ICON%" --config.win.signAndEditExecutable=false --config.compression=maximum
  if errorlevel 1 goto :fail
)

echo.
echo [SUCCESS] Portable build completed.
echo Output EXE(s):
dir /b "dist\Win Dev\*.exe"
echo.
echo Primary output folder:
echo   %CD%\dist\Win Dev
echo.
echo Press any key to close this window.
pause >nul
exit /b 0

:fail
echo.
echo [FAILED] Portable build did not complete.
echo Check output above for the first error and rerun this script.
echo.
echo Press any key to close this window.
pause >nul
exit /b 1
