"use client";

import { useEffect, useMemo, useState } from "react";

type AdvancedPreferences = {
  enableHardwareAcceleration: boolean;
  openLinksInApp: boolean;
  confirmBeforeQuit: boolean;
  enableDebugOverlay: boolean;
  enableSpellCheck: boolean;
  diagnosticsLevel: "off" | "basic" | "verbose";
};

const ADVANCED_PREFERENCES_STORAGE_KEY = "inaccord:advanced:preferences";

const defaultAdvancedPreferences: AdvancedPreferences = {
  enableHardwareAcceleration: true,
  openLinksInApp: true,
  confirmBeforeQuit: true,
  enableDebugOverlay: false,
  enableSpellCheck: true,
  diagnosticsLevel: "basic",
};

const normalizeAdvancedPreferences = (value: unknown): AdvancedPreferences => {
  if (!value || typeof value !== "object") {
    return { ...defaultAdvancedPreferences };
  }

  const source = value as Partial<Record<keyof AdvancedPreferences, unknown>>;
  const diagnosticsLevel =
    source.diagnosticsLevel === "off" ||
    source.diagnosticsLevel === "basic" ||
    source.diagnosticsLevel === "verbose"
      ? source.diagnosticsLevel
      : defaultAdvancedPreferences.diagnosticsLevel;

  return {
    enableHardwareAcceleration:
      typeof source.enableHardwareAcceleration === "boolean"
        ? source.enableHardwareAcceleration
        : defaultAdvancedPreferences.enableHardwareAcceleration,
    openLinksInApp:
      typeof source.openLinksInApp === "boolean"
        ? source.openLinksInApp
        : defaultAdvancedPreferences.openLinksInApp,
    confirmBeforeQuit:
      typeof source.confirmBeforeQuit === "boolean"
        ? source.confirmBeforeQuit
        : defaultAdvancedPreferences.confirmBeforeQuit,
    enableDebugOverlay:
      typeof source.enableDebugOverlay === "boolean"
        ? source.enableDebugOverlay
        : defaultAdvancedPreferences.enableDebugOverlay,
    enableSpellCheck:
      typeof source.enableSpellCheck === "boolean"
        ? source.enableSpellCheck
        : defaultAdvancedPreferences.enableSpellCheck,
    diagnosticsLevel,
  };
};

const applyAdvancedPreferencesToDocument = (preferences: AdvancedPreferences) => {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  root.classList.toggle("inaccord-advanced-debug-overlay", preferences.enableDebugOverlay);
  root.setAttribute("data-inaccord-diagnostics-level", preferences.diagnosticsLevel);
  root.setAttribute(
    "data-inaccord-hardware-acceleration",
    preferences.enableHardwareAcceleration ? "on" : "off"
  );
  root.setAttribute(
    "data-inaccord-spell-check",
    preferences.enableSpellCheck ? "on" : "off"
  );

  try {
    window.localStorage.setItem("inaccord:advanced:hardwareAcceleration", preferences.enableHardwareAcceleration ? "on" : "off");
    window.localStorage.setItem(ADVANCED_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // ignore storage failures
  }

  const electronApi = typeof window !== "undefined" ? (window as any)?.electronAPI : null;
  if (electronApi && typeof electronApi.setSpellCheckEnabled === "function") {
    void electronApi.setSpellCheckEnabled(preferences.enableSpellCheck).catch(() => undefined);
  }
};

export const AdvancedPreferencesProvider = () => {
  const [advancedPreferences, setAdvancedPreferences] = useState<AdvancedPreferences>({
    ...defaultAdvancedPreferences,
  });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ADVANCED_PREFERENCES_STORAGE_KEY);
      if (!raw) {
        return;
      }

      setAdvancedPreferences(normalizeAdvancedPreferences(JSON.parse(raw) as unknown));
    } catch {
      // ignore local storage failures
    }
  }, []);

  const confirmBeforeQuitEnabled = useMemo(
    () => advancedPreferences.confirmBeforeQuit,
    [advancedPreferences.confirmBeforeQuit]
  );

  const openLinksInAppEnabled = useMemo(
    () => advancedPreferences.openLinksInApp,
    [advancedPreferences.openLinksInApp]
  );

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const response = await fetch("/api/profile/preferences", { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { advanced?: unknown };
        if (cancelled) {
          return;
        }

        setAdvancedPreferences(normalizeAdvancedPreferences(payload.advanced));
      } catch {
        if (!cancelled) {
          setAdvancedPreferences({ ...defaultAdvancedPreferences });
        }
      }
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    applyAdvancedPreferencesToDocument(advancedPreferences);
  }, [advancedPreferences]);

  useEffect(() => {
    const onAdvancedPreferencesUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ advanced?: unknown }>;
      setAdvancedPreferences(normalizeAdvancedPreferences(customEvent.detail?.advanced));
    };

    window.addEventListener("inaccord:advanced-preferences-updated", onAdvancedPreferencesUpdated as EventListener);

    return () => {
      window.removeEventListener("inaccord:advanced-preferences-updated", onAdvancedPreferencesUpdated as EventListener);
    };
  }, []);

  useEffect(() => {
    const isDesktopRuntime = typeof window !== "undefined" && Boolean((window as any)?.electronAPI);
    if (!confirmBeforeQuitEnabled || isDesktopRuntime) {
      return;
    }

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [confirmBeforeQuitEnabled]);

  useEffect(() => {
    if (!openLinksInAppEnabled) {
      return;
    }

    const onDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) {
        return;
      }

      const target = event.target as Element | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) {
        return;
      }

      const href = anchor.getAttribute("href") ?? "";
      if (!/^https?:\/\//i.test(href)) {
        return;
      }

      if (anchor.target !== "_blank") {
        return;
      }

      event.preventDefault();
      window.location.assign(href);
    };

    document.addEventListener("click", onDocumentClick);
    return () => {
      document.removeEventListener("click", onDocumentClick);
    };
  }, [openLinksInAppEnabled]);

  return null;
};
