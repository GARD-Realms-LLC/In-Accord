export type QuotedMessageMeta = {
  messageId: string;
  authorName: string;
  snippet: string;
};

const QUOTE_PREFIX = "[[quote:";
const QUOTE_SUFFIX = "]]";

const encodeUtf8ToBinary = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return binary;
};

const decodeBinaryToUtf8 = (binary: string) => {
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const toBase64 = (value: string) => {
  if (typeof window !== "undefined" && typeof window.btoa === "function") {
    return window.btoa(encodeUtf8ToBinary(value));
  }

  return Buffer.from(value, "utf8").toString("base64");
};

const fromBase64 = (value: string) => {
  if (typeof window !== "undefined" && typeof window.atob === "function") {
    return decodeBinaryToUtf8(window.atob(value));
  }

  return Buffer.from(value, "base64").toString("utf8");
};

const sanitizeSnippet = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 180);

export const buildQuotedContent = (body: string, quote?: QuotedMessageMeta | null) => {
  const normalizedBody = String(body ?? "").trim();

  if (!quote) {
    return normalizedBody;
  }

  const normalizedQuote: QuotedMessageMeta = {
    messageId: String(quote.messageId ?? "").trim(),
    authorName: String(quote.authorName ?? "Unknown User").trim() || "Unknown User",
    snippet: sanitizeSnippet(String(quote.snippet ?? "")),
  };

  try {
    const payload = toBase64(JSON.stringify(normalizedQuote));
    return `${QUOTE_PREFIX}${payload}${QUOTE_SUFFIX} ${normalizedBody}`.trim();
  } catch {
    return normalizedBody;
  }
};

export const extractQuotedContent = (
  rawContent: string
): { quote: QuotedMessageMeta | null; body: string } => {
  const source = String(rawContent ?? "");

  if (!source.startsWith(QUOTE_PREFIX)) {
    return { quote: null, body: source };
  }

  const endIndex = source.indexOf(QUOTE_SUFFIX);
  if (endIndex < 0) {
    return { quote: null, body: source };
  }

  const encoded = source.slice(QUOTE_PREFIX.length, endIndex).trim();
  const remaining = source.slice(endIndex + QUOTE_SUFFIX.length).trimStart();

  try {
    const parsed = JSON.parse(fromBase64(encoded)) as Partial<QuotedMessageMeta>;
    const quote: QuotedMessageMeta = {
      messageId: String(parsed.messageId ?? "").trim(),
      authorName: String(parsed.authorName ?? "Unknown User").trim() || "Unknown User",
      snippet: sanitizeSnippet(String(parsed.snippet ?? "")),
    };

    return {
      quote: quote.messageId ? quote : null,
      body: remaining,
    };
  } catch {
    return { quote: null, body: source };
  }
};

export const getQuoteSnippetFromBody = (content: string) =>
  sanitizeSnippet(String(content ?? ""));
