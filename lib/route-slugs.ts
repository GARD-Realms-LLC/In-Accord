const ROUTE_SLUG_SEPARATOR = "--";
const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

export const slugifyRouteName = (value: string): string => {
  const normalized = normalizeWhitespace(String(value ?? ""));
  if (!normalized) {
    return "item";
  }

  const folded = normalized
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return folded || "item";
};

const shortStableToken = (value: string): string => {
  const input = String(value ?? "");
  let hash = 0x811c9dc5;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  const unsigned = hash >>> 0;
  return unsigned.toString(36).padStart(6, "0").slice(0, 6);
};

export const buildRouteSegment = (name: string, id: string): string => {
  const slug = slugifyRouteName(name);
  const token = shortStableToken(id);
  return `${slug}${ROUTE_SLUG_SEPARATOR}${token}`;
};

export const parseRouteSegment = (segment: string): { slug: string; token: string | null } => {
  const raw = safeDecode(String(segment ?? "").trim());
  if (!raw) {
    return { slug: "", token: null };
  }

  const separatorIndex = raw.lastIndexOf(ROUTE_SLUG_SEPARATOR);
  if (separatorIndex < 0) {
    return { slug: slugifyRouteName(raw), token: null };
  }

  const slugPart = raw.slice(0, separatorIndex);
  const tokenPart = raw.slice(separatorIndex + ROUTE_SLUG_SEPARATOR.length).trim().toLowerCase();

  return {
    slug: slugifyRouteName(slugPart),
    token: tokenPart || null,
  };
};

export const isDirectEntityId = (value: string): boolean => {
  const normalized = safeDecode(String(value ?? "").trim());
  if (!normalized) {
    return false;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized);
};

export const matchesRouteParam = (
  routeParam: string,
  entity: { id: string; name: string }
): boolean => {
  const decodedParam = safeDecode(String(routeParam ?? "").trim());
  if (!decodedParam) {
    return false;
  }

  if (decodedParam === entity.id) {
    return true;
  }

  const expectedToken = shortStableToken(entity.id);
  const parsed = parseRouteSegment(decodedParam);
  if (!parsed.slug) {
    return false;
  }

  if (parsed.slug !== slugifyRouteName(entity.name)) {
    return false;
  }

  if (!parsed.token) {
    return true;
  }

  return parsed.token === expectedToken;
};

export const buildServerPath = (server: { id: string; name: string }): string =>
  `/servers/${encodeURIComponent(buildRouteSegment(server.name, server.id))}`;

export const buildChannelPath = (input: {
  server: { id: string; name: string };
  channel: { id: string; name: string };
}): string =>
  `${buildServerPath(input.server)}/channels/${encodeURIComponent(buildRouteSegment(input.channel.name, input.channel.id))}`;

export const buildThreadPath = (input: {
  server: { id: string; name: string };
  channel: { id: string; name: string };
  threadId: string;
}): string => `${buildChannelPath({ server: input.server, channel: input.channel })}/threads/${encodeURIComponent(input.threadId)}`;
