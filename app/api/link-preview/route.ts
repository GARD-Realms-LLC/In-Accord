import dns from "node:dns/promises";
import net from "node:net";

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

const parseMetaContent = (html: string, attr: "property" | "name", key: string) => {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<meta[^>]*(?:${attr}=["']${escapedKey}["'][^>]*content=["']([^"']+)["']|content=["']([^"']+)["'][^>]*${attr}=["']${escapedKey}["'])[^>]*>`,
    "i"
  );

  const matched = html.match(pattern);
  return (matched?.[1] ?? matched?.[2] ?? "").trim() || null;
};

const parseTitle = (html: string) => {
  const matched = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return matched?.[1]?.replace(/\s+/g, " ").trim() || null;
};

const parseCanonical = (html: string) => {
  const matched = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i);
  return matched?.[1]?.trim() || null;
};

const normalizeString = (value: string | null, maxLen = 280) => {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

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

export async function GET(req: Request) {
  try {
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
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return new NextResponse("Failed to fetch URL", { status: 422 });
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      return NextResponse.json({ preview: null }, { status: 200 });
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > maxContentLength) {
      return NextResponse.json({ preview: null }, { status: 200 });
    }

    const html = await response.text();
    if (html.length > maxContentLength) {
      return NextResponse.json({ preview: null }, { status: 200 });
    }

    const fetchedUrl = new URL(response.url || target.toString());

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
      toAbsoluteUrl(parseMetaContent(html, "name", "twitter:image"), fetchedUrl) ??
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
    return NextResponse.json({ preview: null }, { status: 200 });
  }
}
