# UI Scaling Audit Report — Modals, Toasts, Popups

Date: 2026-03-09
Workspace: `e:\In-Accord`

## Scope
Reviewed scaling behavior for:
- Modals / Dialogs (`DialogContent`)
- Popovers (`PopoverContent`)
- Toasts (`sonner` + custom toast content)

## Summary (High-Level)
Scaling is **partially responsive** but contains repeated fixed-size patterns that can cause clipping, cramped layouts, or oversized surfaces on smaller windows.

### Severity Snapshot
- **High:** 6 hotspots
- **Medium:** 11 hotspots
- **Low / Style-only:** 20+ repeated class simplification opportunities

---

## Key Findings

### 1) Fixed-width popovers repeated across app (High)
Hard widths like `w-[320px]`, `w-[340px]`, `w-[280px]` appear in user/profile popovers.

Examples:
- `components/chat/chat-item.tsx:1255` → `w-[320px]`
- `components/settings/user-status-menu.tsx:539` → `w-[320px]`
- `components/navigation/navigation-item.tsx:217` → `w-[340px]`
- `components/modals/server-profile-popover.tsx:57` → `w-[340px]`
- `components/server/online-users-list.tsx:431` → `w-[320px]`
- `components/modals/in-accord-admin-modal.tsx:3995` → `w-[320px]`
- `components/modals/in-accord-admin-modal.tsx:5568` → `w-[280px]`

Risk:
- On narrow windows/split view, popovers can overflow or render uncomfortably dense.

Recommendation:
- Replace fixed widths with responsive caps, e.g. `w-[min(90vw,20rem)]` / `max-w-[90vw]`.

---

### 2) Viewport-fixed mega dialogs are consistent but aggressive (Medium)
Large shells use `h-[85vh] w-[85vw]` or `h-[80vh] w-[80vw]`.

Examples:
- `components/modals/settings-modal.tsx:8377`
- `components/modals/edit-server-modal.tsx:2244`
- `components/modals/edit-channel-modal.tsx:490`
- `components/modals/in-accord-admin-modal.tsx:3413` (`calc(100vw-1rem)` variant)

Risk:
- Can be acceptable on desktop, but may feel oversized or cramped if content has many nested fixed-width blocks.

Recommendation:
- Keep shell strategy, but ensure all nested cards/controls inside are fluid (`max-w-full`, `min-w-0`, `overflow-y-auto`).

---

### 3) Oversized fixed max-width dialogs (Medium)
Hard dialog caps without smaller breakpoints may exceed comfort on medium screens.

Examples:
- `components/modals/create-server-modal.tsx:144` → `sm:max-w-[860px]`
- `components/settings-modal.tsx:5943, 5983, 6023` → `sm:max-w-[42rem]`
- `components/navigation/navigation-servers-collection.tsx:526` → `sm:max-w-[430px]`

Recommendation:
- Normalize to semantic widths (`sm:max-w-md`, `sm:max-w-2xl`, etc.) with optional `max-w-[90vw]` safety.

---

### 4) Settings modal has repeated fixed card widths and pixel-height bars (Medium)
Found repeated `max-w-[28rem]`, `max-w-[32rem]`, and `h-[6px]` usage blocks.

Examples:
- `components/modals/settings-modal.tsx:4750, 4839, 4863, 4923, 8476, 9601`
- `components/modals/settings-modal.tsx:4860, 4880, 4900, 4920, 4939, 9602`

Risk:
- Inconsistent density/scaling across zoom levels and low-width layouts.

Recommendation:
- Replace with design tokens (`max-w-md`, `max-w-lg`, `h-1.5`) for consistency.

---

### 5) Toasts are generally okay; one custom toast width should be normalized (Low/Medium)
Global toaster:
- `components/providers/toaster-provider.tsx:56` → `Toaster position="top-center"` (good baseline)

Custom threads toast:
- `components/topbar/threads-toast-button.tsx:88` → `w-90 max-w-[90vw]`

Risk:
- `w-90` token may not align with other sizing patterns.

Recommendation:
- Standardize to `w-[min(90vw,22rem)]` or `max-w-sm w-full` depending on desired density.

---

## Prioritized Fix Plan

### Priority 1 (Do first)
1. Convert all profile-related popovers to responsive width constraints.
2. Ensure popovers include viewport-safe max width (`max-w-[90vw]`) and internal wrapping.

### Priority 2
3. Normalize `settings-modal` repeated fixed widths/heights to semantic utility classes.
4. Reconcile large dialog caps (`sm:max-w-[860px]`, `[42rem]`) with standardized size tokens.

### Priority 3
5. Standardize custom toast width token (`w-90`) to a shared responsive pattern.

---

## Suggested Standards (Project-wide)
- Popovers: `className="w-[min(90vw,20rem)] ..."`
- Standard dialogs: `sm:max-w-md|lg|2xl` + `max-w-[90vw]` guard
- Full-shell dialogs: keep `%/vh` outer shell, enforce fluid internals
- Micro-size tokens: prefer semantic (`h-1.5`, `max-w-md`) over literal pixel/rem values unless justified

---

## Bottom Line
- The UI is close, but **fixed-width popovers and repeated hard-coded size blocks** are the main bad-scaling sources.
- Addressing those will materially improve behavior on smaller windows, split panes, and high zoom settings.
