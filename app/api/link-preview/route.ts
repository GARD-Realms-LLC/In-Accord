import dns from "dns/promises";
import net from "net";

import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";

type PreviewPayload = {
  url: string;
  siteName: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  canonicalUrl: string;
};

const requestTimeoutMs = 5000;
const maxContentLength = 2 * 1024 * 1024;

const htmlEntityMap: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  nbsp: " ",
};

const decodeHtmlEntities = (value: string) =>
  value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const normalizedEntity = String(entity ?? "").toLowerCase();

    if (normalizedEntity.startsWith("#x")) {
      const codePoint = Number.parseInt(normalizedEntity.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    if (normalizedEntity.startsWith("#")) {
      const codePoint = Number.parseInt(normalizedEntity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    return htmlEntityMap[normalizedEntity] ?? match;
  });

const parseAttributes = (rawTag: string) => {
  const attributes = new Map<string, string>();
  const attributePattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

  let match: RegExpExecArray | null;
  while ((match = attributePattern.exec(rawTag)) !== null) {
    const name = String(match[1] ?? "").trim().toLowerCase();
    const value = decodeHtmlEntities(String(match[3] ?? match[4] ?? match[5] ?? "").trim());

    if (name) {
      attributes.set(name, value);
    }
  }

  return attributes;
};

const findTagAttributes = (html: string, tagName: string) => {
  const tagPattern = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  const matches = html.match(tagPattern) ?? [];
  return matches.map((tag) => parseAttributes(tag));
};

const parseMetaContent = (html: string, attr: "property" | "name", key: string) => {
  const normalizedKey = key.trim().toLowerCase();
  const metaTags = findTagAttributes(html, "meta");

  for (const attributes of metaTags) {
    if (attributes.get(attr)?.trim().toLowerCase() !== normalizedKey) {
      continue;
    }

    const content = attributes.get("content")?.trim();
    if (content) {
      return content;
    }
  }

  return null;
};

const parseTitle = (html: string) => {
  const matched = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const value = matched?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  return decodeHtmlEntities(value) || null;
};

const parseCanonical = (html: string) => {
  const linkTags = findTagAttributes(html, "link");

  for (const attributes of linkTags) {
    const relValues = String(attributes.get("rel") ?? "")
      .split(/\s+/)
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);

    if (!relValues.includes("canonical")) {
      continue;
    }

    const href = attributes.get("href")?.trim();
    if (href) {
      return href;
    }
  }

  return null;
};

const normalizeString = (value: string | null, maxLen = 280) => {
  if (!value) {
    return null;
  }

  const normalized = decodeHtmlEntities(
    value
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  ).trim();

  if (!normalized) {
    return null;
  }

  if (normalized.length <= maxLen) {
    return normalized;
  }

  return `${normalized.slice(0, maxLen - 1)}…`;
};

const toAbsoluteUrl = (candidate: string | null, base: URL) => {
  if (!candidate) {
    return null;
  }

  try {
    const resolved = new URL(candidate, base);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return null;
    }
    return resolved.toString();
  } catch {
    return null;
  }
};

const parseFirstImage = (html: string, base: URL) => {
  const imageTags = findTagAttributes(html, "img");

  for (const attributes of imageTags) {
    const src = attributes.get("src")?.trim() ?? attributes.get("data-src")?.trim() ?? "";
    const absoluteUrl = toAbsoluteUrl(src, base);

    if (absoluteUrl) {
      return absoluteUrl;
    }
  }

  return null;
};

const isPrivateIp = (value: string) => {
  if (net.isIPv4(value)) {
    if (value.startsWith("10.")) {
      return true;
    }
    if (value.startsWith("127.")) {
      return true;
    }
    if (value.startsWith("192.168.")) {
      return true;
    }
    if (value === "0.0.0.0") {
      return true;
    }

    const [a, b] = value.split(".").map((part) => Number(part));
    return a === 172 && b >= 16 && b <= 31;
  }

  if (net.isIPv6(value)) {
    const normalized = value.toLowerCase();
    return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80");
  }

  return false;
};

const isBlockedHostname = (hostname: string) => {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  );
};

const assertSafeTarget = async (target: URL) => {
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error("Unsupported URL protocol");
  }

  if (isBlockedHostname(target.hostname)) {
    throw new Error("Blocked host");
  }

  if (isPrivateIp(target.hostname)) {
    throw new Error("Blocked host");
  }

  const records = await dns.lookup(target.hostname, { all: true, verbatim: true });
  for (const record of records) {
    if (isPrivateIp(record.address)) {
      throw new Error("Blocked host");
    }
  }
};

const buildPreviewFallback = (target: URL, overrides?: Partial<PreviewPayload>): PreviewPayload => ({
  url: target.toString(),
  siteName: normalizeString(target.hostname, 80) ?? target.hostname,
  title:
    normalizeString(overrides?.title ?? target.hostname.replace(/^www\./i, ""), 180) ??
    "Link",
  description: overrides?.description ?? null,
  imageUrl: overrides?.imageUrl ?? null,
  canonicalUrl: overrides?.canonicalUrl ?? target.toString(),
});

export async function GET(req: Request) {
  const profile = await currentProfile();
  if (!profile) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const rawUrl = String(searchParams.get("url") ?? "").trim();

  if (!rawUrl) {
    return new NextResponse("url is required", { status: 400 });
  }

  const target = new URL(rawUrl);

  try {
    await assertSafeTarget(target);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    let response: Response;
    try {
      response = await fetch(target, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "user-agent": "In-Accord-LinkPreview/1.0",
          accept: "text/html,application/xhtml+xml,image/*;q=0.9,*/*;q=0.8",
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return NextResponse.json(
        { preview: buildPreviewFallback(target) },
        {
          status: 200,
          headers: {
            "cache-control": "private, max-age=300",
          },
        }
      );
    }

    const fetchedUrl = new URL(response.url || target.toString());
    const contentType = response.headers.get("content-type") ?? "";

    if (/^image\//i.test(contentType)) {
      const fileName = fetchedUrl.pathname.split("/").filter(Boolean).pop() ?? fetchedUrl.hostname;

      return NextResponse.json(
        {
          preview: buildPreviewFallback(target, {
            title: fileName,
            imageUrl: fetchedUrl.toString(),
            canonicalUrl: fetchedUrl.toString(),
          }),
        },
        {
          status: 200,
          headers: {
            "cache-control": "private, max-age=300",
          },
        }
      );
    }

    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      return NextResponse.json(
        { preview: buildPreviewFallback(target, { canonicalUrl: fetchedUrl.toString() }) },
        {
          status: 200,
          headers: {
            "cache-control": "private, max-age=300",
          },
        }
      );
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > maxContentLength) {
      return NextResponse.json(
        { preview: buildPreviewFallback(target, { canonicalUrl: fetchedUrl.toString() }) },
        {
          status: 200,
          headers: {
            "cache-control": "private, max-age=300",
          },
        }
      );
    }

    const html = await response.text();
    if (html.length > maxContentLength) {
      return NextResponse.json(
        { preview: buildPreviewFallback(target, { canonicalUrl: fetchedUrl.toString() }) },
        {
          status: 200,
          headers: {
            "cache-control": "private, max-age=300",
          },
        }
      );
    }

    const title =
      normalizeString(parseMetaContent(html, "property", "og:title"), 180) ??
      normalizeString(parseMetaContent(html, "name", "twitter:title"), 180) ??
      normalizeString(parseTitle(html), 180) ??
      normalizeString(fetchedUrl.hostname, 180) ??
      "Link";

    const description =
      normalizeString(parseMetaContent(html, "property", "og:description"), 320) ??
      normalizeString(parseMetaContent(html, "name", "description"), 320) ??
      normalizeString(parseMetaContent(html, "name", "twitter:description"), 320) ??
      null;

    const siteName =
      normalizeString(parseMetaContent(html, "property", "og:site_name"), 80) ??
      fetchedUrl.hostname;

    const imageUrl =
      toAbsoluteUrl(parseMetaContent(html, "property", "og:image"), fetchedUrl) ??
      toAbsoluteUrl(parseMetaContent(html, "property", "og:image:secure_url"), fetchedUrl) ??
      toAbsoluteUrl(parseMetaContent(html, "name", "twitter:image"), fetchedUrl) ??
      toAbsoluteUrl(parseMetaContent(html, "name", "twitter:image:src"), fetchedUrl) ??
      parseFirstImage(html, fetchedUrl) ??
      null;

    const canonicalUrl =
      toAbsoluteUrl(parseMetaContent(html, "property", "og:url"), fetchedUrl) ??
      toAbsoluteUrl(parseCanonical(html), fetchedUrl) ??
      fetchedUrl.toString();

    const preview: PreviewPayload = {
      url: target.toString(),
      siteName,
      title,
      description,
      imageUrl,
      canonicalUrl,
    };

    return NextResponse.json(
      { preview },
      {
        status: 200,
        headers: {
          "cache-control": "private, max-age=300",
        },
      }
    );
  } catch (error) {
    console.error("[LINK_PREVIEW_GET]", error);
    return NextResponse.json(
      { preview: buildPreviewFallback(target) },
      {
        status: 200,
        headers: {
          "cache-control": "private, max-age=300",
        },
      }
    );
  }
}
