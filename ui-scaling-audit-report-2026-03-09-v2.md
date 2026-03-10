# UI Scaling Audit Report (Repost v2) — Modals, Toasts, Popups, Panels

Date: 2026-03-09  
Workspace: `e:\In-Accord`

## What changed in this repost
This v2 audit expands scope vs prior report:
- Includes **modals + popovers + dropdowns + sheets + toast surfaces + panel containers**.
- Uses full workspace scans over `components/**` and `app/**` for fixed sizing patterns.
- Adds an explicit **"not fixed yet"** status and a stricter priority queue.

---

## Current Status
**NOT FIXED** (audit-only repost).  
There are still multiple high-impact fixed-size patterns that can cause bad scaling.

---

## High-Impact Findings (Blocking)

### A) Repeated fixed-width profile popovers (high)
These appear in core social surfaces and are likely to overflow/feel cramped in narrow windows.

- `components/chat/chat-item.tsx:1255` → `w-[320px]`
- `components/settings/user-status-menu.tsx:539` → `w-[320px]`
- `components/navigation/navigation-item.tsx:217` → `w-[340px]`
- `components/modals/server-profile-popover.tsx:57` → `w-[340px]`
- `components/server/online-users-list.tsx:431` → `w-[320px]`
- `components/modals/in-accord-admin-modal.tsx:3995` → `w-[320px]`
- `components/modals/in-accord-admin-modal.tsx:5568` → `w-[280px]`

**Why it’s bad scaling:** hard widths don’t adapt to split-pane/smaller displays.

---

### B) Large modal shells with fixed viewport ratios + nested fixed cards (high)
Outer shells are responsive-ish (`80vw/85vw`) but inner fixed blocks can still cause pressure.

- `components/modals/settings-modal.tsx:8377` → `h-[85vh] w-[85vw]`
- `components/modals/edit-server-modal.tsx:2244` → `h-[85vh] w-[85vw]`
- `components/modals/edit-channel-modal.tsx:490` → `h-[80vh] w-[80vw]`
- `components/modals/in-accord-admin-modal.tsx:3413` → full viewport calc shell

Nested pressure spots:
- `settings-modal.tsx` repeated `max-w-[28rem]`, `max-w-[32rem]`
- various fixed 2-column rails (`grid-cols-[1fr_260px]`, `grid-cols-[1fr_220px]`) without small-breakpoint collapse

**Why it’s bad scaling:** works desktop-wide, but degrades at reduced width/zoom.

---

### C) Dialog max-width literals without standard scale (medium/high)
- `components/modals/create-server-modal.tsx:144` → `sm:max-w-[860px]`
- `components/modals/settings-modal.tsx:5943/5983/6023` → `sm:max-w-[42rem]`
- `components/navigation/navigation-servers-collection.tsx:526` → `sm:max-w-[430px]`
- `components/settings/user-status-menu.tsx:712` → `w-105` (nonstandard width token)

**Why it’s bad scaling:** inconsistent sizing policy across dialog surfaces.

---

## Medium Findings

### D) Settings modal style-literal repetition (non-blocking but noisy)
`settings-modal.tsx` contains many repeated literals:
- `max-w-[28rem]`, `max-w-[32rem]`, `h-[6px]`, `break-words`

These were already flagged by diagnostics and remain widespread.

### E) Toast width inconsistency
- `components/topbar/threads-toast-button.tsx:88` → `w-90 max-w-[90vw]`

Not catastrophic, but inconsistent with the rest of sizing conventions.

### F) Good patterns observed (keep)
- Many modal bodies already use `overflow-y-auto` / `min-w-0` / `max-w-full`.
- Global toaster baseline is clean:
  - `components/providers/toaster-provider.tsx:56` → `<Toaster position="top-center" closeButton={false} />`

---

## Quantified Pattern Counts (from scans)

Approximate recurring patterns identified:
- Fixed popover widths (`320/340/280px`): **8+ distinct occurrences** in high-traffic surfaces.
- Large viewport modal shells (`80/85vh` + `80/85vw`): **4+ primary shells**.
- Literal dialog caps (`sm:max-w-[...]`): **5+ key occurrences**.
- Settings literal-size repeats (`28rem/32rem/6px` etc.): **15+ occurrences** in one file.

---

## Priority Fix Queue (Actionable)

### Priority 1 — must fix first
1. Convert fixed profile popovers to responsive widths:
   - recommended: `w-[min(90vw,20rem)]` or `max-w-[90vw] w-full` with bounded parent.
2. Standardize `user-status-menu` dialog width (`w-105`) to responsive dialog scale.

### Priority 2
3. Normalize dialog max-width literals to semantic tokens (`sm:max-w-md/lg/2xl`) plus `max-w-[90vw]` safety.
4. Add small-breakpoint behavior for rail grids (`[1fr_260px]`, `[1fr_220px]`) in settings/admin/server editors.

### Priority 3
5. Clean repeated literal sizes in `settings-modal.tsx` (`28rem`, `32rem`, `6px`, `break-words`).
6. Normalize custom threads toast width token.

---

## Recommended Target Standard

- **Popover:** `className="w-[min(90vw,20rem)] ..."`
- **Dialog:** semantic `sm:max-w-*` + `max-w-[90vw]`
- **Large shell dialogs:** keep viewport shell, enforce fluid internals (`min-w-0`, `overflow-y-auto`, no nested fixed-width cards)
- **Toasts:** `max-w-[90vw]` + bounded semantic width (`max-w-sm` / `max-w-md`)

---

## Final Repost Conclusion
You were correct to call this out: the UI scaling is **still not fully fixed**.  
This repost confirms specific unresolved hotspots and gives a stricter fix order.

Saved as:
`e:\In-Accord\ui-scaling-audit-report-2026-03-09-v2.md`
