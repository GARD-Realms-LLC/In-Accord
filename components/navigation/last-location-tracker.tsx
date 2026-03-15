"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const LAST_LOCATION_STORAGE_KEY = "inaccord:last-non-aboard-location";

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
    window.localStorage.setItem(LAST_LOCATION_STORAGE_KEY, nextLocation);
  }, [pathname, searchParams]);

  return null;
};

export const LAST_IN_ACCORD_LOCATION_STORAGE_KEY = LAST_LOCATION_STORAGE_KEY;