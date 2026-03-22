@echo off
setlocal
cd /d E:\In-Accord

echo [push-script] staging source files
git add app\api\admin\database-runtime\route.ts
git add dev\app\package-win.cjs
git add instrumentation.ts
git add lib\d1-snapshot-sql.ts
git add lib\d1-snapshot-sync.ts
git add lib\db.ts
git add lib\db\schema.ts
git add lib\realtime-events-server.ts
git add middleware.ts
git add next.config.js
git add scripts\build-app.cjs
git add scripts\repair-next-install.cjs
git add tsconfig.json
git rm --ignore-unmatch --quiet proxy.ts
if errorlevel 1 exit /b %errorlevel%

echo [push-script] committing
git commit -m "push D1 build and packaging fixes"
if errorlevel 1 exit /b %errorlevel%

echo [push-script] pushing to origin main
git push origin main
exit /b %errorlevel%
