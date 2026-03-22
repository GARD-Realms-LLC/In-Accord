# In-Accord Build Playbook (Windows)

This is the **mandatory build sequence** for this project.
Follow these steps in order every time.

## One-command strict release

Use this when you want the full enforced flow with validation:

- `npm run build:release:strict`

It runs the release sequence and fails unless all required artifacts are present.

## 1) Pre-checks

- Use **PowerShell** in repo root: `E:\In-Accord`
- Confirm Node modules are installed.
- Confirm no old installer process is running.

## 2) Clean state

1. Run `npm run cleanup:dist-locks`
2. Run `npm run clean:next`
3. Ensure `dist/win64` is writable

## 3) Web app build

1. Run `npm run build`
2. Expected result: `next build` completes successfully
3. If it fails with missing module/chunk errors, run `npm run clean:next` and retry

## 4) Installer prerequisites

1. Run `npm run prepare:win-fav-icon`
2. Confirm icon exists: `dist/win64/fav.ico`

## 5) Installer build (authoritative)

Use this command when you need the final installer:

- `npm run electron:dist`

This script already:
- bumps version
- builds Next.js
- prepares caches/temp
- builds NSIS x64 installer

## 6) Artifact verification (must pass)

After a successful build, verify:

- `dist/win64/In-Accord Setup v<version>-x64.exe`
- `dist/win64/latest.yml`
- `dist/win64/*.blockmap`

If `.exe` is missing, build is not complete.

## 7) Installer runtime logging locations

During install, check logs in this order:

1. `C:\Users\<user>\AppData\Local\In-Accord\installer-install.log`
2. `C:\Users\<user>\AppData\Local\Temp\In-Accord\installer-install.log`

## 8) Known failure recovery

### A) `Cannot find module './xxxx.js'` during build/dev

- Cause: stale `.next` artifacts
- Fix: run `npm run clean:next` and rebuild

### B) NSIS warning treated as error

- Cause: custom NSIS script warning (build breaks)
- Fix: remove/resolve warning in `build/installer.nsh` and rebuild

### C) Installer lock errors (app/uninstaller in use)

- Ensure app and updater processes are closed
- Re-run build and test installer
- Use installer log files above for exact blocker

## 9) Release gate (do not skip)

Only consider build complete when all are true:

- [ ] `npm run build` passed
- [ ] `npm run electron:dist` passed
- [ ] setup `.exe` exists in `dist/win64`
- [ ] `latest.yml` exists and matches new version
- [ ] installer launches on test machine

## 10) Rule

If any step fails, **stop, fix the exact failure, and re-run from step 2**.
No partial-release artifacts.
