type StreamKind = "game" | "screen" | "generic";

const STREAMING_GAME_HINTS = [
  "game",
  "gaming",
  "steam",
  "epic games",
  "riot",
  "minecraft",
  "fortnite",
  "valorant",
  "league",
  "roblox",
  "rocket league",
  "counter-strike",
  "cs2",
  "dota",
  "apex",
  "halo",
  "overwatch",
  "elden ring",
  "cyberpunk",
  "starfield",
  "sekiro",
  "gta",
  "grand theft auto",
  "forza",
  "pubg",
  "finals",
];

const STREAMING_SCREEN_HINTS = [
  "screen",
  "window",
  "monitor",
  "display",
  "desktop",
  "tab",
  "browser",
  "chrome",
  "edge",
  "firefox",
  "application",
  "app",
];

const normalizeStreamLabel = (label?: string | null) => String(label ?? "").trim();

export const getStreamKind = (label?: string | null): StreamKind => {
  const normalizedLabel = normalizeStreamLabel(label);
  if (!normalizedLabel) {
    return "generic";
  }

  const lowered = normalizedLabel.toLowerCase();

  if (STREAMING_GAME_HINTS.some((hint) => lowered.includes(hint))) {
    return "game";
  }

  if (STREAMING_SCREEN_HINTS.some((hint) => lowered.includes(hint))) {
    return "screen";
  }

  return "screen";
};

export const getStreamActivityCopy = (label?: string | null) => {
  const normalizedLabel = normalizeStreamLabel(label);
  const kind = getStreamKind(normalizedLabel);

  if (kind === "game") {
    return {
      kind,
      title: normalizedLabel || "Game Streaming",
      subtitle: "Game streaming now",
      details: normalizedLabel ? "Live gameplay capture" : undefined,
    };
  }

  if (kind === "screen") {
    return {
      kind,
      title: normalizedLabel || "Screen Sharing",
      subtitle: "Screen sharing now",
      details: undefined,
    };
  }

  return {
    kind,
    title: normalizedLabel || "Streaming",
    subtitle: "Streaming now",
    details: undefined,
  };
};

export const getStreamSummaryText = (label?: string | null) => {
  const normalizedLabel = normalizeStreamLabel(label);
  const suffix = normalizedLabel ? ` • ${normalizedLabel}` : "";
  const kind = getStreamKind(normalizedLabel);

  if (kind === "game") {
    return `Game streaming active${suffix}`;
  }

  if (kind === "screen") {
    return `Screen sharing active${suffix}`;
  }

  return `Streaming active${suffix}`;
};

export const getStreamStageText = (label?: string | null) => {
  const normalizedLabel = normalizeStreamLabel(label);
  const suffix = normalizedLabel ? ` • ${normalizedLabel}` : "";
  const kind = getStreamKind(normalizedLabel);

  if (kind === "game") {
    return `Game stream${suffix}`;
  }

  if (kind === "screen") {
    return `Screen share${suffix}`;
  }

  return `Streaming${suffix}`;
};

export const getStreamBadgeText = (label?: string | null) => {
  const normalizedLabel = normalizeStreamLabel(label);
  const kind = getStreamKind(normalizedLabel);

  if (normalizedLabel) {
    if (kind === "game") {
      return `Game Live: ${normalizedLabel}`;
    }

    if (kind === "screen") {
      return `Sharing: ${normalizedLabel}`;
    }

    return `Live: ${normalizedLabel}`;
  }

  if (kind === "game") {
    return "Game Live";
  }

  if (kind === "screen") {
    return "Screen Live";
  }

  return "Live";
};

export const getStreamTooltipText = (label?: string | null) => {
  const normalizedLabel = normalizeStreamLabel(label);
  const kind = getStreamKind(normalizedLabel);

  if (normalizedLabel) {
    if (kind === "game") {
      return `Game stream: ${normalizedLabel}`;
    }

    if (kind === "screen") {
      return `Screen share: ${normalizedLabel}`;
    }

    return `Streaming: ${normalizedLabel}`;
  }

  if (kind === "game") {
    return "Game streaming";
  }

  if (kind === "screen") {
    return "Screen sharing";
  }

  return "Streaming";
};