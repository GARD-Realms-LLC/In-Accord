"use client";

import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const LOADING_TOAST_ID = "global-delayed-loading-toast";
const LOADING_DELAY_MS = 2000;

type RequestHandle = symbol;

type PendingEntry = {
  timer: ReturnType<typeof setTimeout>;
  hasShownToast: boolean;
};

const pending = new Map<RequestHandle, PendingEntry>();
let visibleSlowRequestCount = 0;

function showLoadingToast() {
  toast.custom(
    () => (
      <div className="pointer-events-auto flex items-center gap-2 rounded-md border border-zinc-300/70 bg-white px-3 py-2 text-sm text-zinc-900 shadow-md dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="animate-pulse font-semibold tracking-wide">LOADING ...</span>
      </div>
    ),
    {
      id: LOADING_TOAST_ID,
      duration: Infinity,
    }
  );
}

function hideLoadingToastIfIdle() {
  if (visibleSlowRequestCount <= 0) {
    visibleSlowRequestCount = 0;
    toast.dismiss(LOADING_TOAST_ID);
  }
}

export function beginTrackedLoading(): RequestHandle {
  const handle: RequestHandle = Symbol("tracked-loading-request");

  const entry: PendingEntry = {
    hasShownToast: false,
    timer: setTimeout(() => {
      const current = pending.get(handle);
      if (!current) {
        return;
      }

      current.hasShownToast = true;
      visibleSlowRequestCount += 1;

      if (visibleSlowRequestCount === 1) {
        showLoadingToast();
      }
    }, LOADING_DELAY_MS),
  };

  pending.set(handle, entry);
  return handle;
}

export function shouldTrackLoadingRequest(input: RequestInfo | URL, init?: RequestInit) {
  const request = input instanceof Request ? input : null;
  const method = String(init?.method ?? request?.method ?? "GET").trim().toUpperCase();
  const headers = new Headers(init?.headers ?? request?.headers ?? undefined);
  const backgroundRefresh = headers.get("X-InAccord-Background-Refresh");

  if (backgroundRefresh === "1") {
    return false;
  }

  // Keep background GET polling silent so passive refresh loops do not spam the global loader.
  if (method === "GET" && headers.get("X-InAccord-Silent-Loading") === "1") {
    return false;
  }

  return true;
}

export function endTrackedLoading(handle: RequestHandle | undefined | null) {
  if (!handle) {
    return;
  }

  const entry = pending.get(handle);
  if (!entry) {
    return;
  }

  clearTimeout(entry.timer);
  pending.delete(handle);

  if (entry.hasShownToast) {
    visibleSlowRequestCount -= 1;
    hideLoadingToastIfIdle();
  }
}

export function resetTrackedLoading() {
  pending.forEach((entry) => {
    clearTimeout(entry.timer);
  });

  pending.clear();
  visibleSlowRequestCount = 0;
  toast.dismiss(LOADING_TOAST_ID);
}
