# Edit Accountability Log

## Mandatory protocol for every future edit in this repo

Before any edit, I must re-read this file and confirm all of the following:

1. Review the most recent Electron / packaging / runtime edits listed below.
2. Identify the exact user-visible failure being targeted.
3. State the single concrete hypothesis for the next change.
4. Confirm which files are in-bounds for that hypothesis.
5. Confirm how the change will be validated after editing.
6. If the failure is still not isolated, do not widen scope with extra edits.
7. Preserve the internal copyable error system; never rely on native system popups.

If an edit does not satisfy all seven items above, it should not be made.

## Current incident: desktop app hard-down Electron startup regression

### User requirements that must not be violated

- Never guess blindly after a failed fix.
- Always inspect recent edits before making another change.
- Always follow the real runtime failure during mandatory testing.
- Always keep errors copyable inside the app; never fall back to native system popups.
- Treat the packaged desktop app as the source of truth, not just dev mode.

### Verified current facts

1. The installed bundle is current:
   - installed `app.asar` contains `version: 1.0.220`
   - display version `1.0.45`
   - `package.json` entrypoint is `electron/main.cjs`
2. The installed `electron/main.cjs` contains the added startup trace markers:
   - `STARTUP_TRACE_PATH`
   - `process:bootstrap`
3. A truly fresh installed launch still produces:
   - main process alive
   - GPU process alive
   - network utility process alive
   - no temp startup trace file
4. Forcing `TEMP` / `TMP` to a known folder still produces no startup trace file.
5. Therefore the failure is not explained by:
   - stale installer contents
   - wrong packaged entrypoint path in `package.json`
   - writing only to the wrong temp folder

### Working conclusion

The repeated visible error can persist after many edits when the changed code is not on the failing execution path. In this incident, the strongest current signal is that the installed executable is not reaching the expected traced bootstrap path in a way that emits the new file evidence, even though the packaged archive contains that code.

## Recent verified edit ledger for this regression

These are the recent edit batches that must be reviewed before any new Electron fix.

1. `electron/main.cjs`
   - Replaced native error dialogs with internal copyable error window flow.
   - Added startup shell / retry / startup status IPC behavior.

2. `electron/preload.cjs`
   - Added startup status bridge methods:
     - `getStartupStatus`
     - `retryStartup`
     - `onStartupStatus`

3. `electron/updater.cjs`
   - Wrapped updater state publish callback in `try/catch`.

4. `electron/main.cjs`
   - Added startup trace file writes using `os.tmpdir()`.
   - Added `process:bootstrap` trace write at top-level.

5. `electron/main.cjs`
   - Added benign startup failure suppression logic for crash hooks.

6. `electron/main.cjs`
   - Added startup shell HTML and connection retry UX.

7. `electron/main.cjs`
   - Reworked `createWindow()` load path to shell-first then app retry.

8. `package.json`
   - Restored missing `scripts` block after it was found stripped.

9. `package.json`
   - Restored missing `devDependencies` after they were found stripped.

10. `package.json`
    - Restored missing Electron Builder `build` config after it was found stripped.

11. `components/navigation/last-location-tracker.tsx`
    - Hardened localStorage read/write behavior and quota handling.

12. `app/(main)/in-aboard/page.tsx`
    - Switched to safe last-location reader.

13. `app/(main)/layout.tsx`
    - Replaced inline dock composition with shared dock component.

14. `components/settings/global-user-status-dock.tsx`
    - Added new shared dock component.

15. `components/server/server-route-shell.tsx`
    - Exposed left-edge CSS variable used for dock centering.

16. `app/(main)/(routes)/users/page.tsx`
    - Centered status dock block in the user page header.

## Explicitly known bad process failures in this thread

1. Too many edits were made before freezing the scope to the packaged Electron launch path.
2. I kept improving recovery / shell / logging behavior while the primary failure was still not proven to occur inside those code paths.
3. I allowed `package.json` manifest churn to happen multiple times during the same investigation.
4. I did not convert this file into the mandatory pre-edit reference early enough.

## What must happen next before another Electron edit

- Re-read this file.
- Re-read the latest `electron/main.cjs` diff.
- Compare the current failure against the exact Electron edits above.
- Prefer rollback / isolation / bisect of the suspect Electron startup changes over adding more instrumentation blindly.
- Only edit the smallest set of Electron files needed for the next hypothesis.

## Current next-edit hypothesis

- Hypothesis: the regression is the packaged startup-model change in `resolveAppUrl()`, where recent Electron history stopped using `startInternalServer()` for packaged localhost mode and instead targeted external `localhost:3000`.
- Why: history comparison shows `11d816c` used `startInternalServer()` for packaged startup, while `3db1250` switched packaged startup to external localhost/web-thin-client behavior; that is a direct startup behavior change in the exact file under investigation.
- In-bounds files for this edit: `electron/main.cjs` only.
- Validation required after edit: check Electron file errors, then run the strict release build so the packaged path is verified instead of assuming dev/runtime parity.

## Wrong or unasked edits made in this thread

1. Misread “top 7 collapsable” request
   - Implemented collapsible behavior on Overview cards first.
   - You intended the Rules/Guide/Events/Members/Invites/Stage block.

2. Partial reverse instead of clean rollback
   - Hid overview collapse controls rather than immediately removing all related behavior.

3. Wrong folder width target (first pass)
   - Matched folder width to the larger home visual (`w-28`) instead of the practical rail button footprint.

4. Wrong width target correction required another pass
   - Required another adjustment to match the actual My Home tile size (`h-10 w-20`).

5. Added behavior you did not explicitly ask for in that step
   - Used +/- collapse behavior first, then adjusted to exact “- control” wording.

6. You had to request this accountability output
   - This follow-up should not have been necessary.

## What should have happened

- Verify the exact target area before first edit.
- Match sizing against the exact existing control referenced by you.
- Apply minimal exact changes with no interpretation drift.
