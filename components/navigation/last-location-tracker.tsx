"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { CLIENT_PERSISTENCE_DISABLED } from "@/lib/client-persistence-policy";

const LAST_LOCATION_STORAGE_KEY = "inaccord:last-non-aboard-location";
const MAX_STORED_LOCATION_LENGTH = 2048;

const normalizeStoredLocation = (value: unknown) => {
  const raw = String(value || "").trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "";
  }

  try {
    const parsed = new URL(raw, "http://in-accord.local");
    const nextLocation = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (!nextLocation || nextLocation.length > MAX_STORED_LOCATION_LENGTH) {
      return parsed.pathname.slice(0, MAX_STORED_LOCATION_LENGTH);
    }

    return nextLocation;
  } catch {
    return raw.slice(0, MAX_STORED_LOCATION_LENGTH);
  }
};

const isQuotaExceededError = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { name?: unknown; code?: unknown };
  return candidate.name === "QuotaExceededError" || candidate.code === 22 || candidate.code === 1014;
};

export const readLastInAccordLocation = () => {
  if (CLIENT_PERSISTENCE_DISABLED || typeof window === "undefined") {
    return "";
  }

  try {
    return normalizeStoredLocation(window.localStorage.getItem(LAST_LOCATION_STORAGE_KEY));
  } catch (error) {
    console.warn("[LastLocationTracker] Failed to read last location from storage.", error);
    return "";
  }
};

export const writeLastInAccordLocation = (value: unknown) => {
  if (CLIENT_PERSISTENCE_DISABLED || typeof window === "undefined") {
    return false;
  }

  const nextLocation = normalizeStoredLocation(value);
  if (!nextLocation) {
    try {
      window.localStorage.removeItem(LAST_LOCATION_STORAGE_KEY);
    } catch (error) {
      console.warn("[LastLocationTracker] Failed to clear invalid last location from storage.", error);
    }
    return false;
  }

  try {
    window.localStorage.setItem(LAST_LOCATION_STORAGE_KEY, nextLocation);
    return true;
  } catch (error) {
    if (isQuotaExceededError(error)) {
      try {
        window.localStorage.removeItem(LAST_LOCATION_STORAGE_KEY);
        window.localStorage.setItem(LAST_LOCATION_STORAGE_KEY, nextLocation);
        return true;
      } catch (retryError) {
        console.warn("[LastLocationTracker] Storage quota prevented persisting the last location.", retryError);
        return false;
      }
    }

    console.warn("[LastLocationTracker] Failed to persist last location.", error);
    return false;
  }
};

export const LastLocationTracker = () => {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const currentPath = String(pathname || "").trim() || "/";
    if (currentPath.startsWith("/in-aboard")) {
      return;
    }

    const queryString = searchParams?.toString() || "";
    const nextLocation = `${currentPath}${queryString ? `?${queryString}` : ""}`;
    writeLastInAccordLocation(nextLocation);
  }, [pathname, searchParams]);

  return null;
};

export const LAST_IN_ACCORD_LOCATION_STORAGE_KEY = LAST_LOCATION_STORAGE_KEY;
