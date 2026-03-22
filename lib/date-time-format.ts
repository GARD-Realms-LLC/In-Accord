export const DEFAULT_USER_TIMESTAMP_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
};

export const normalizeDateForDisplay = (value: Date | string | number | null | undefined) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
};

export const formatDateTimeForUser = (
  value: Date | string | number | null | undefined,
  options: Intl.DateTimeFormatOptions = DEFAULT_USER_TIMESTAMP_FORMAT,
  fallback = ""
) => {
  const parsed = normalizeDateForDisplay(value);

  if (!parsed) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
  }

  return parsed.toLocaleString(undefined, options);
};
