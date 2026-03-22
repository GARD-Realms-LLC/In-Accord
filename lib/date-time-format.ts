export const DEFAULT_USER_TIMESTAMP_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
};

const EXPLICIT_TIME_ZONE_PATTERN = /(z|[+-]\d{2}:?\d{2})$/i;
const ISO_LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[ t](\d{2})(?::(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?)?$/i;

const parseNaiveDateTimeAsLocal = (value: string) => {
  const match = value.match(ISO_LOCAL_DATE_TIME_PATTERN);
  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, millisecondText] = match;
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const day = Number(dayText);
  const hour = Number(hourText ?? "0");
  const minute = Number(minuteText ?? "0");
  const second = Number(secondText ?? "0");
  const millisecond = Number((millisecondText ?? "0").padEnd(3, "0"));

  const parsed = new Date(year, monthIndex, day, hour, minute, second, millisecond);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

    if (!EXPLICIT_TIME_ZONE_PATTERN.test(normalized)) {
      const parsedLocal = parseNaiveDateTimeAsLocal(normalized);
      if (parsedLocal) {
        return parsedLocal;
      }
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
