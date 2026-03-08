export const PROFILE_NAME_STYLE_KEYS = [
  "standard",
  "bold",
  "italic",
  "glow",
  "mono",
  "serif",
  "blurple",
  "sunset",
  "frost",
  "danger",
] as const;

export type ProfileNameStyleKey = (typeof PROFILE_NAME_STYLE_KEYS)[number];

export const DEFAULT_PROFILE_NAME_STYLE: ProfileNameStyleKey = "standard";

export const PROFILE_NAME_FONT_KEYS = ["default", "bold", "italic", "mono", "serif"] as const;
export type ProfileNameFontKey = (typeof PROFILE_NAME_FONT_KEYS)[number];

export const PROFILE_NAME_EFFECT_KEYS = ["solid", "gradient", "neon", "toon", "pop"] as const;
export type ProfileNameEffectKey = (typeof PROFILE_NAME_EFFECT_KEYS)[number];

export const PROFILE_NAME_COLOR_KEYS = ["default", "blurb", "sunset", "frost", "ruby"] as const;
export type ProfileNameColorKey = (typeof PROFILE_NAME_COLOR_KEYS)[number];

export type ProfileNameStyleParts = {
  font: ProfileNameFontKey;
  effect: ProfileNameEffectKey;
  color: ProfileNameColorKey;
};

export const DEFAULT_PROFILE_NAME_STYLE_PARTS: ProfileNameStyleParts = {
  font: "default",
  effect: "solid",
  color: "default",
};

export const PROFILE_NAME_FONT_OPTIONS: Array<{ key: ProfileNameFontKey; label: string; description: string }> = [
  { key: "default", label: "Default", description: "Use the standard app font." },
  { key: "bold", label: "Bold", description: "Heavy, high-impact text weight." },
  { key: "italic", label: "Italic", description: "Elegant slanted text style." },
  { key: "mono", label: "Mono", description: "Retro monospace lettering." },
  { key: "serif", label: "Serif", description: "Classic serif profile name style." },
];

export const PROFILE_NAME_EFFECT_OPTIONS: Array<{ key: ProfileNameEffectKey; label: string; description: string }> = [
  { key: "solid", label: "Solid", description: "Clean solid text styling." },
  { key: "gradient", label: "Gradient", description: "Apply a smooth gradient effect." },
  { key: "neon", label: "Neon", description: "Glowing neon-style text effect." },
  { key: "toon", label: "Toon", description: "Cartoon-like outlined text style." },
  { key: "pop", label: "Pop", description: "Extra punchy pop effect." },
];

export const PROFILE_NAME_COLOR_OPTIONS: Array<{ key: ProfileNameColorKey; label: string; description: string }> = [
  { key: "default", label: "Default", description: "Default text color." },
  { key: "blurb", label: "Blurb", description: "Classic blurple accent." },
  { key: "sunset", label: "Sunset Gradient", description: "Warm premium-like gradient text." },
  { key: "frost", label: "Frost Gradient", description: "Cool cyan-to-blue gradient text." },
  { key: "ruby", label: "Ruby", description: "Strong ruby-red profile color." },
];

export const PROFILE_NAME_STYLE_OPTIONS: Array<{
  key: ProfileNameStyleKey;
  label: string;
  description: string;
}> = [
  {
    key: "standard",
    label: "Standard",
    description: "Default profile name look.",
  },
  {
    key: "bold",
    label: "Bold",
    description: "Heavy, high-impact text with stronger spacing.",
  },
  {
    key: "italic",
    label: "Italic",
    description: "Elegant slanted style with a smooth look.",
  },
  {
    key: "glow",
    label: "Glow",
    description: "Neon-like glow for a standout profile name.",
  },
  {
    key: "mono",
    label: "Mono",
    description: "Retro monospace styling with crisp spacing.",
  },
  {
    key: "serif",
    label: "Serif",
    description: "Classic serif font for a refined profile name look.",
  },
  {
    key: "blurple",
    label: "Blurb",
    description: "Blurple color with subtle emphasis.",
  },
  {
    key: "sunset",
    label: "Sunset Gradient",
    description: "Warm gradient effect inspired by premium profile styles.",
  },
  {
    key: "frost",
    label: "Frost Gradient",
    description: "Cool cyan-to-blue gradient with a clean neon edge.",
  },
  {
    key: "danger",
    label: "Ruby",
    description: "Strong ruby-red styling for bold identity.",
  },
];

export const isProfileNameStyleKey = (value: unknown): value is ProfileNameStyleKey => {
  if (typeof value !== "string") {
    return false;
  }

  return (PROFILE_NAME_STYLE_KEYS as readonly string[]).includes(value);
};

const isProfileNameFontKey = (value: unknown): value is ProfileNameFontKey => {
  return typeof value === "string" && (PROFILE_NAME_FONT_KEYS as readonly string[]).includes(value);
};

const isProfileNameEffectKey = (value: unknown): value is ProfileNameEffectKey => {
  return typeof value === "string" && (PROFILE_NAME_EFFECT_KEYS as readonly string[]).includes(value);
};

const isProfileNameColorKey = (value: unknown): value is ProfileNameColorKey => {
  return typeof value === "string" && (PROFILE_NAME_COLOR_KEYS as readonly string[]).includes(value);
};

const LEGACY_STYLE_TO_PARTS: Record<ProfileNameStyleKey, ProfileNameStyleParts> = {
  standard: { font: "default", effect: "solid", color: "default" },
  bold: { font: "bold", effect: "solid", color: "default" },
  italic: { font: "italic", effect: "solid", color: "default" },
  glow: { font: "default", effect: "neon", color: "default" },
  mono: { font: "mono", effect: "solid", color: "default" },
  serif: { font: "serif", effect: "solid", color: "default" },
  blurple: { font: "default", effect: "solid", color: "blurb" },
  sunset: { font: "bold", effect: "gradient", color: "sunset" },
  frost: { font: "default", effect: "gradient", color: "frost" },
  danger: { font: "bold", effect: "solid", color: "ruby" },
};

const normalizeLegacyEffectAlias = (value: unknown): ProfileNameEffectKey | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "none") {
    return "solid";
  }

  if (normalized === "glow") {
    return "neon";
  }

  return isProfileNameEffectKey(normalized) ? normalized : null;
};

const STYLE_PARTS_PATTERN = /^font:([a-z-]+)\|effect:([a-z-]+)\|color:([a-z-]+)$/i;

export const normalizeProfileNameStyleParts = (parts: Partial<ProfileNameStyleParts> | null | undefined): ProfileNameStyleParts => {
  const nextFont = parts?.font;
  const nextEffect = normalizeLegacyEffectAlias(parts?.effect);
  const nextColor = parts?.color;

  return {
    font: isProfileNameFontKey(nextFont) ? nextFont : DEFAULT_PROFILE_NAME_STYLE_PARTS.font,
    effect: nextEffect ?? DEFAULT_PROFILE_NAME_STYLE_PARTS.effect,
    color: isProfileNameColorKey(nextColor) ? nextColor : DEFAULT_PROFILE_NAME_STYLE_PARTS.color,
  };
};

export const serializeProfileNameStyleParts = (parts: Partial<ProfileNameStyleParts> | null | undefined) => {
  const normalized = normalizeProfileNameStyleParts(parts);
  return `font:${normalized.font}|effect:${normalized.effect}|color:${normalized.color}`;
};

export const getProfileNameStyleParts = (value: unknown): ProfileNameStyleParts => {
  const raw = typeof value === "string" ? value.trim() : "";

  if (!raw) {
    return { ...DEFAULT_PROFILE_NAME_STYLE_PARTS };
  }

  if (isProfileNameStyleKey(raw)) {
    return { ...LEGACY_STYLE_TO_PARTS[raw] };
  }

  const match = raw.match(STYLE_PARTS_PATTERN);
  if (!match) {
    return { ...DEFAULT_PROFILE_NAME_STYLE_PARTS };
  }

  return normalizeProfileNameStyleParts({
    font: match[1] as ProfileNameFontKey,
    effect: match[2] as ProfileNameEffectKey,
    color: match[3] as ProfileNameColorKey,
  });
};

export const composeProfileNameStyleValue = (parts: Partial<ProfileNameStyleParts> | null | undefined) => {
  return serializeProfileNameStyleParts(parts);
};

export const isProfileNameStyleValue = (value: unknown) => {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    return false;
  }

  if (isProfileNameStyleKey(raw)) {
    return true;
  }

  return STYLE_PARTS_PATTERN.test(raw);
};

export const normalizeProfileNameStyleValue = (value: unknown): string => {
  const raw = typeof value === "string" ? value.trim() : "";

  if (!raw) {
    return DEFAULT_PROFILE_NAME_STYLE;
  }

  if (isProfileNameStyleKey(raw)) {
    return raw;
  }

  const match = raw.match(STYLE_PARTS_PATTERN);
  if (!match) {
    return DEFAULT_PROFILE_NAME_STYLE;
  }

  return serializeProfileNameStyleParts({
    font: match[1] as ProfileNameFontKey,
    effect: match[2] as ProfileNameEffectKey,
    color: match[3] as ProfileNameColorKey,
  });
};

export const normalizeProfileNameStyleKey = (value: unknown): ProfileNameStyleKey => {
  return isProfileNameStyleKey(value) ? value : DEFAULT_PROFILE_NAME_STYLE;
};

export const getProfileNameStyleClass = (value: unknown) => {
  const parts = getProfileNameStyleParts(value);

  const fontClass =
    parts.font === "bold"
      ? "font-black tracking-[0.045em]"
      : parts.font === "italic"
      ? "italic font-semibold tracking-[0.015em]"
      : parts.font === "mono"
      ? "font-mono tracking-[0.06em]"
      : parts.font === "serif"
      ? "font-serif font-semibold tracking-[0.01em]"
      : "";

  const colorClass =
    parts.color === "blurb"
      ? "text-[#7b88ff]"
      : parts.color === "sunset"
      ? "text-[#ff8a5b]"
      : parts.color === "frost"
      ? "text-[#66d9ff]"
      : parts.color === "ruby"
      ? "text-[#ff6b81]"
      : "";

  const gradientClass =
    parts.effect === "gradient"
      ? parts.color === "frost"
        ? "bg-linear-to-r from-[#b6f0ff] via-[#66d9ff] to-[#6f8bff] bg-clip-text text-transparent"
        : parts.color === "ruby"
        ? "bg-linear-to-r from-[#ff8aa0] via-[#ff5c8a] to-[#ff3d71] bg-clip-text text-transparent"
        : parts.color === "blurb"
        ? "bg-linear-to-r from-[#7b88ff] via-[#5865f2] to-[#4752c4] bg-clip-text text-transparent"
        : "bg-linear-to-r from-[#ff8a5b] via-[#ff4da6] to-[#a855f7] bg-clip-text text-transparent"
      : "";

  const neonClass =
    parts.effect === "neon"
      ? "font-bold saturate-150 drop-shadow-[0_0_10px_rgba(88,101,242,0.95)] [text-shadow:0_0_16px_rgba(88,101,242,0.6)]"
      : "";
  const toonClass =
    parts.effect === "toon"
      ? "font-black tracking-[0.03em] [text-shadow:2px_2px_0_rgba(0,0,0,0.7),-2px_2px_0_rgba(0,0,0,0.7),2px_-2px_0_rgba(0,0,0,0.7),-2px_-2px_0_rgba(0,0,0,0.7),0_3px_0_rgba(0,0,0,0.55)]"
      : "";
  const popClass =
    parts.effect === "pop"
      ? "font-black tracking-[0.05em] saturate-150 drop-shadow-[0_3px_0_rgba(0,0,0,0.55)] [text-shadow:0_0_10px_rgba(255,255,255,0.22)]"
      : "";

  return [fontClass, colorClass, gradientClass, neonClass, toonClass, popClass].filter(Boolean).join(" ");
};
