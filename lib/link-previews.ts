const urlPattern = /https?:\/\/[^\s<>{}\[\]`"']+/gi;

const trimTrailingCharacters = (value: string) => {
  let next = value;

  while (/[),.;!?]$/.test(next)) {
    const openCount = (next.match(/\(/g) ?? []).length;
    const closeCount = (next.match(/\)/g) ?? []).length;

    if (next.endsWith(")") && openCount >= closeCount) {
      break;
    }

    next = next.slice(0, -1);
  }

  return next;
};

export const extractUrlsFromText = (input: string, maxUrls = 3): string[] => {
  const text = String(input ?? "").trim();
  if (!text) {
    return [];
  }

  const seen = new Set<string>();
  const urls: string[] = [];

  const regex = new RegExp(urlPattern.source, "gi");
  let match: RegExpExecArray | null = null;

  while ((match = regex.exec(text)) !== null) {
    const raw = String(match[0] ?? "");
    const candidate = trimTrailingCharacters(raw);

    if (!candidate) {
      continue;
    }

    try {
      const normalized = new URL(candidate).toString();
      if (seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      urls.push(normalized);
      if (urls.length >= maxUrls) {
        break;
      }
    } catch {
      // ignore invalid url-like strings
    }
  }

  return urls;
};

export const splitTextWithUrls = (text: string): Array<{ kind: "text" | "url"; value: string }> => {
  const value = String(text ?? "");
  if (!value) {
    return [];
  }

  const pieces: Array<{ kind: "text" | "url"; value: string }> = [];
  let cursor = 0;

  const regex = new RegExp(urlPattern.source, "gi");
  let match: RegExpExecArray | null = null;

  while ((match = regex.exec(value)) !== null) {
    const start = match.index ?? 0;
    const raw = String(match[0] ?? "");
    const normalized = trimTrailingCharacters(raw);
    const effectiveLength = normalized.length;

    if (start > cursor) {
      pieces.push({ kind: "text", value: value.slice(cursor, start) });
    }

    if (normalized) {
      pieces.push({ kind: "url", value: normalized });
    }

    cursor = start + effectiveLength;
  }

  if (cursor < value.length) {
    pieces.push({ kind: "text", value: value.slice(cursor) });
  }

  return pieces;
};
