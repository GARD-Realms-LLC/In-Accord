export const presenceStatusValues = ["ONLINE", "DND", "INVISIBLE", "OFFLINE"] as const;

export type PresenceStatus = (typeof presenceStatusValues)[number];

export const normalizePresenceStatus = (value: unknown): PresenceStatus => {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "DND" || normalized === "INVISIBLE" || normalized === "OFFLINE") {
    return normalized;
  }
  return "ONLINE";
};

export const presenceStatusLabelMap: Record<PresenceStatus, string> = {
  ONLINE: "Online",
  DND: "DND",
  INVISIBLE: "Invisible",
  OFFLINE: "Offline",
};

export const presenceStatusDotClassMap: Record<PresenceStatus, string> = {
  ONLINE: "bg-emerald-500",
  DND: "bg-rose-500",
  INVISIBLE: "bg-yellow-400",
  OFFLINE: "bg-black border border-zinc-400",
};

export const resolveAutoPresenceStatus = (
  rawStatus: unknown,
  rawUpdatedAt: unknown
): PresenceStatus => {
  const normalized = normalizePresenceStatus(rawStatus);

  if (normalized === "DND" || normalized === "INVISIBLE") {
    return normalized;
  }

  const updatedAt = rawUpdatedAt instanceof Date ? rawUpdatedAt : new Date(String(rawUpdatedAt ?? ""));
  if (!Number.isNaN(updatedAt.getTime())) {
    const ageMs = Date.now() - updatedAt.getTime();
    if (ageMs > 5 * 60 * 1000) {
      return "OFFLINE";
    }
  }

  return normalized;
};
