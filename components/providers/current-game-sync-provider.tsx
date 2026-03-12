"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ActivityPrivacyPreferences = {
  shareActivityStatus: boolean;
  shareCurrentGame: boolean;
};

type RegisteredGameEntry = {
  id: string;
  name: string;
  provider?: string;
};

type RegisteredGamesPreferences = {
  showDetectedGames: boolean;
  manualGames: RegisteredGameEntry[];
  hiddenGameIds: string[];
};

const defaultActivityPrivacyPreferences: ActivityPrivacyPreferences = {
  shareActivityStatus: true,
  shareCurrentGame: true,
};

const defaultRegisteredGamesPreferences: RegisteredGamesPreferences = {
  showDetectedGames: true,
  manualGames: [],
  hiddenGameIds: [],
};

const SYNC_INTERVAL_MS = 3_000;

type RuntimeActivity = {
  type?: "game" | "video" | "music";
  title?: string;
  details?: string | null;
  state?: string | null;
  startedAt?: string;
  detectedAt?: string;
} | null;

const normalizeActivityPrivacyPreferences = (value: unknown): ActivityPrivacyPreferences => {
  if (!value || typeof value !== "object") {
    return { ...defaultActivityPrivacyPreferences };
  }

  const source = value as Partial<Record<keyof ActivityPrivacyPreferences, unknown>>;

  return {
    shareActivityStatus:
      typeof source.shareActivityStatus === "boolean"
        ? source.shareActivityStatus
        : defaultActivityPrivacyPreferences.shareActivityStatus,
    shareCurrentGame:
      typeof source.shareCurrentGame === "boolean"
        ? source.shareCurrentGame
        : defaultActivityPrivacyPreferences.shareCurrentGame,
  };
};

const normalizeRegisteredGamesPreferences = (value: unknown): RegisteredGamesPreferences => {
  if (!value || typeof value !== "object") {
    return { ...defaultRegisteredGamesPreferences };
  }

  const source = value as Partial<Record<keyof RegisteredGamesPreferences, unknown>>;

  return {
    showDetectedGames:
      typeof source.showDetectedGames === "boolean"
        ? source.showDetectedGames
        : defaultRegisteredGamesPreferences.showDetectedGames,
    manualGames: Array.isArray(source.manualGames)
      ? source.manualGames
          .filter((entry): entry is RegisteredGameEntry => Boolean(entry && typeof entry === "object"))
          .map((entry) => ({
            id: String(entry.id ?? "").trim().slice(0, 160),
            name: String(entry.name ?? "").trim().slice(0, 120),
            provider: String(entry.provider ?? "").trim().slice(0, 60),
          }))
          .filter((entry) => entry.id.length > 0 || entry.name.length > 0)
      : defaultRegisteredGamesPreferences.manualGames,
    hiddenGameIds: Array.isArray(source.hiddenGameIds)
      ? source.hiddenGameIds
          .map((entry) => String(entry ?? "").trim())
          .filter((entry) => entry.length > 0)
      : defaultRegisteredGamesPreferences.hiddenGameIds,
  };
};

const normalizeAlias = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\.exe$/i, "")
    .replace(/[^a-z0-9]+/g, "");

const createAliasCandidates = (raw: string) => {
  const base = String(raw || "").trim();
  if (!base) {
    return [] as string[];
  }

  const variants = new Set<string>();
  variants.add(base);
  variants.add(base.replace(/[:]/g, " "));
  variants.add(base.replace(/[-_]/g, " "));

  const normalized = Array.from(variants)
    .map((entry) => normalizeAlias(entry))
    .filter((entry) => entry.length > 0);

  return Array.from(new Set(normalized));
};

const getRuntimeActivityFromElectron = async (): Promise<RuntimeActivity> => {
  if (typeof window === "undefined") {
    return null;
  }

  const electronApi = (window as any)?.electronAPI;
  try {
    const payload =
      electronApi && typeof electronApi.getRuntimeActivity === "function"
        ? await electronApi.getRuntimeActivity()
        : await fetch("/api/profile/runtime-activity", { cache: "no-store" }).then((response) =>
            response.ok ? response.json() : null
          );
    if (!payload || typeof payload !== "object") {
      return null;
    }

    const type = String((payload as { type?: string }).type ?? "").trim().toLowerCase();
    const title = String((payload as { title?: string }).title ?? "").trim();

    if (!title) {
      return null;
    }

    if (type !== "game" && type !== "video" && type !== "music") {
      return null;
    }

    return {
      type: type as "game" | "video" | "music",
      title,
    };
  } catch {
    return null;
  }
};

const resolveCurrentGame = (
  activityPrivacy: ActivityPrivacyPreferences,
  runtimeActivity: RuntimeActivity
): string | null => {
  if (!activityPrivacy.shareActivityStatus || !activityPrivacy.shareCurrentGame) {
    return null;
  }

  if (runtimeActivity?.type === "game") {
    return String(runtimeActivity.title ?? "").trim().slice(0, 120) || null;
  }

  return null;
};

export const CurrentGameSyncProvider = () => {
  const [activityPrivacyPreferences, setActivityPrivacyPreferences] = useState<ActivityPrivacyPreferences>({
    ...defaultActivityPrivacyPreferences,
  });
  const [registeredGamesPreferences, setRegisteredGamesPreferences] = useState<RegisteredGamesPreferences>({
    ...defaultRegisteredGamesPreferences,
  });
  const lastSyncedGameRef = useRef<string | null | undefined>(undefined);

  const hydratePreferences = useCallback(async () => {
    try {
      const response = await fetch("/api/profile/preferences", { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        activityPrivacy?: unknown;
        registeredGames?: unknown;
      };

      setActivityPrivacyPreferences(normalizeActivityPrivacyPreferences(payload.activityPrivacy));
      setRegisteredGamesPreferences(normalizeRegisteredGamesPreferences(payload.registeredGames));
    } catch {
      // no-op: best effort
    }
  }, []);

  const syncRuntimeGameCatalog = useCallback(async () => {
    if (typeof window === "undefined") {
      return;
    }

    const electronApi = (window as any)?.electronAPI;
    if (!electronApi || typeof electronApi.setRuntimeGameCatalog !== "function") {
      return;
    }

    try {
      const hidden = new Set(registeredGamesPreferences.hiddenGameIds);

      const manualCatalog = registeredGamesPreferences.manualGames
        .filter((game) => !hidden.has(game.id))
        .map((game) => {
          const aliases = [
            ...createAliasCandidates(game.name),
            ...createAliasCandidates(game.id),
            ...createAliasCandidates(`${game.provider ?? ""} ${game.name}`),
          ];

          return {
            label: game.name || game.id,
            aliases,
          };
        })
        .filter((entry) => entry.label.trim().length > 0 && entry.aliases.length > 0);

      const detectedCatalog = await (async () => {
            if (electronApi && typeof electronApi.getInstalledGames === "function") {
              try {
                const payload = (await electronApi.getInstalledGames()) as {
                  games?: Array<{
                    id?: string;
                    name?: string;
                    provider?: string;
                    processName?: string;
                    processAliases?: string[];
                  }>;
                };

                const games = Array.isArray(payload?.games) ? payload.games : [];
                return games
                  .filter((game) => {
                    const id = String(game?.id ?? "").trim();
                    return id.length > 0 && !hidden.has(id);
                  })
                  .map((game) => {
                    const id = String(game?.id ?? "").trim();
                    const name = String(game?.name ?? "").trim();
                    const provider = String(game?.provider ?? "").trim();
                    const processName = String(game?.processName ?? "").trim();
                    const processAliases = Array.isArray(game?.processAliases)
                      ? game.processAliases.map((value) => String(value ?? "").trim()).filter((value) => value.length > 0)
                      : [];

                    return {
                      label: name || id,
                      aliases: [
                        ...createAliasCandidates(name),
                        ...createAliasCandidates(id),
                        ...createAliasCandidates(`${provider} ${name}`),
                        ...createAliasCandidates(processName),
                        ...processAliases.flatMap((alias) => createAliasCandidates(alias)),
                      ],
                    };
                  })
                  .filter((entry) => entry.label.length > 0 && entry.aliases.length > 0);
              } catch {
                return [] as Array<{ label: string; aliases: string[] }>;
              }
            }

            return [] as Array<{ label: string; aliases: string[] }>;
          })();

      const catalogByLabel = new Map<string, { label: string; aliases: string[] }>();

      for (const entry of [...manualCatalog, ...detectedCatalog]) {
        const labelKey = entry.label.trim().toLowerCase();
        if (!labelKey) {
          continue;
        }

        const existing = catalogByLabel.get(labelKey);
        if (!existing) {
          catalogByLabel.set(labelKey, {
            label: entry.label.trim(),
            aliases: Array.from(new Set(entry.aliases)),
          });
          continue;
        }

        existing.aliases = Array.from(new Set([...existing.aliases, ...entry.aliases]));
      }

      const games = Array.from(catalogByLabel.values()).filter((entry) => entry.aliases.length > 0);
      await electronApi.setRuntimeGameCatalog(games);
    } catch {
      // best effort
    }
  }, [registeredGamesPreferences]);

  const syncCurrentGame = useCallback(async () => {
    try {
      const runtimeActivity = await getRuntimeActivityFromElectron();
      const nextCurrentGame = resolveCurrentGame(activityPrivacyPreferences, runtimeActivity);

      if (nextCurrentGame === lastSyncedGameRef.current) {
        return;
      }

      const updateResponse = await fetch("/api/profile/status", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentGame: nextCurrentGame,
        }),
      });

      if (!updateResponse.ok) {
        return;
      }

      lastSyncedGameRef.current = nextCurrentGame;

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("inaccord:profile-updated", {
            detail: {
              currentGame: nextCurrentGame,
              runtimeActivity,
            },
          })
        );
      }
    } catch {
      // no-op: best effort
    }
  }, [activityPrivacyPreferences]);

  useEffect(() => {
    void hydratePreferences();
  }, [hydratePreferences]);

  useEffect(() => {
    const onActivityPrivacyUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ activityPrivacy?: unknown }>;
      setActivityPrivacyPreferences(
        normalizeActivityPrivacyPreferences(customEvent.detail?.activityPrivacy)
      );
    };

    const onRegisteredGamesUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ registeredGames?: unknown }>;
      setRegisteredGamesPreferences(
        normalizeRegisteredGamesPreferences(customEvent.detail?.registeredGames)
      );
    };

    window.addEventListener(
      "inaccord:activity-privacy-preferences-updated",
      onActivityPrivacyUpdated as EventListener
    );
    window.addEventListener(
      "inaccord:registered-games-preferences-updated",
      onRegisteredGamesUpdated as EventListener
    );

    return () => {
      window.removeEventListener(
        "inaccord:activity-privacy-preferences-updated",
        onActivityPrivacyUpdated as EventListener
      );
      window.removeEventListener(
        "inaccord:registered-games-preferences-updated",
        onRegisteredGamesUpdated as EventListener
      );
    };
  }, []);

  useEffect(() => {
    void syncRuntimeGameCatalog();
  }, [syncRuntimeGameCatalog]);

  useEffect(() => {
    void syncCurrentGame();

    const onWindowFocus = () => {
      void syncCurrentGame();
    };

    const onVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void syncCurrentGame();
      }
    };

    const interval = window.setInterval(() => {
      void syncCurrentGame();
    }, SYNC_INTERVAL_MS);

    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [syncCurrentGame]);

  return null;
};
