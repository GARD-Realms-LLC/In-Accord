@echo off
setlocal
cd /d E:\In-Accord

echo [push-all-script] staging all remaining local changes
git add -A
if errorlevel 1 exit /b %errorlevel%

echo [push-all-script] committing
git commit -m "push remaining local repo state"
if errorlevel 1 exit /b %errorlevel%

echo [push-all-script] pushing to origin main
git push origin main
exit /b %errorlevel%
