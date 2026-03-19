import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import {
  getCloudflareRuntimeConfig,
  updateCloudflareRuntimeConfig,
} from "@/lib/cloudflare-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CloudflareApiResponse<T> = {
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result?: T;
  result_info?: {
    page?: number;
    per_page?: number;
    total_pages?: number;
    count?: number;
    total_count?: number;
  };
};

type CloudflareZone = {
  id: string;
  name: string;
  status?: string;
};

type CloudflareDnsRecord = {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied?: boolean;
  ttl?: number;
};

const maskToken = (value: string | null | undefined) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return "";
  }

  if (normalized.length <= 10) {
    return "••••••••••";
  }

  return `${normalized.slice(0, 5)}••••••••${normalized.slice(-5)}`;
};

const toNullableTrimmed = (value: unknown, max = 4096) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, max);
};

const getCloudflareJson = async <T>(
  endpoint: string,
  token: string,
  init?: RequestInit
): Promise<T> => {
  const response = await fetch(`https://api.cloudflare.com/client/v4${endpoint}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const data = (await response.json().catch(() => ({}))) as CloudflareApiResponse<T>;

  if (!response.ok || !data.success) {
    const errorMessage =
      data.errors?.map((entry) => entry.message).filter(Boolean).join("; ") ||
      `Cloudflare request failed (${response.status})`;
    throw new Error(errorMessage);
  }

  if (data.result === undefined) {
    throw new Error("Cloudflare response missing result payload");
  }

  return data.result;
};

const requireAdmin = async () => {
  const profile = await currentProfile();

  if (!profile) {
    return { error: new NextResponse("Unauthorized", { status: 401 }) } as const;
  }

  if (!hasInAccordAdministrativeAccess(profile.role)) {
    return { error: new NextResponse("Forbidden", { status: 403 }) } as const;
  }

  return { profile } as const;
};

export async function GET() {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) {
      return auth.error;
    }

    const config = await getCloudflareRuntimeConfig();

    let zones: CloudflareZone[] = [];
    let dnsRecords: CloudflareDnsRecord[] = [];
    let apiError: string | null = null;

    if (config.apiToken) {
      try {
        const zoneQuery = config.accountId
          ? `/zones?account.id=${encodeURIComponent(config.accountId)}&per_page=100&page=1`
          : "/zones?per_page=100&page=1";

        zones = await getCloudflareJson<CloudflareZone[]>(zoneQuery, config.apiToken);

        if (config.zoneId) {
          dnsRecords = await getCloudflareJson<CloudflareDnsRecord[]>(
            `/zones/${encodeURIComponent(config.zoneId)}/dns_records?per_page=100&page=1`,
            config.apiToken
          );
        }
      } catch (error) {
        apiError = error instanceof Error ? error.message : "Unable to reach Cloudflare API";
      }
    }

    return NextResponse.json({
      setup: {
        hasApiToken: Boolean(config.apiToken),
        apiTokenPreview: maskToken(config.apiToken),
        accountId: config.accountId,
        zoneId: config.zoneId,
        zoneName: config.zoneName,
        updatedAt: config.updatedAt,
      },
      zones,
      dnsRecords,
      apiError,
    });
  } catch (error) {
    console.error("[ADMIN_CLOUDFLARE_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) {
      return auth.error;
    }

    const body = (await req.json().catch(() => ({}))) as {
      apiToken?: unknown;
      accountId?: unknown;
      zoneId?: unknown;
      zoneName?: unknown;
    };

    const hasAnyUpdateField =
      body.apiToken !== undefined ||
      body.accountId !== undefined ||
      body.zoneId !== undefined ||
      body.zoneName !== undefined;

    if (!hasAnyUpdateField) {
      return new NextResponse("No update fields provided", { status: 400 });
    }

    const nextConfig = await updateCloudflareRuntimeConfig({
      ...(body.apiToken !== undefined ? { apiToken: toNullableTrimmed(body.apiToken, 4096) } : {}),
      ...(body.accountId !== undefined ? { accountId: toNullableTrimmed(body.accountId, 191) } : {}),
      ...(body.zoneId !== undefined ? { zoneId: toNullableTrimmed(body.zoneId, 191) } : {}),
      ...(body.zoneName !== undefined ? { zoneName: toNullableTrimmed(body.zoneName, 191) } : {}),
    });

    return NextResponse.json({
      ok: true,
      setup: {
        hasApiToken: Boolean(nextConfig.apiToken),
        apiTokenPreview: maskToken(nextConfig.apiToken),
        accountId: nextConfig.accountId,
        zoneId: nextConfig.zoneId,
        zoneName: nextConfig.zoneName,
        updatedAt: nextConfig.updatedAt,
      },
    });
  } catch (error) {
    console.error("[ADMIN_CLOUDFLARE_PATCH]", error);
    return new NextResponse(error instanceof Error ? error.message : "Internal Error", { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) {
      return auth.error;
    }

    const config = await getCloudflareRuntimeConfig();
    if (!config.apiToken) {
      return new NextResponse("Cloudflare API token is not configured", { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?: unknown;
      zoneId?: unknown;
      zoneName?: unknown;
      url?: unknown;
      urls?: unknown;
      recordId?: unknown;
      type?: unknown;
      name?: unknown;
      content?: unknown;
      ttl?: unknown;
      proxied?: unknown;
    };

    const action = String(body.action ?? "").trim().toUpperCase();
    const zoneId = String(body.zoneId ?? config.zoneId ?? "").trim();
    const zoneName = String(body.zoneName ?? config.zoneName ?? "").trim() || null;

    if (!zoneId) {
      return new NextResponse("Zone is required", { status: 400 });
    }

    if (action === "SELECT_ZONE") {
      const updated = await updateCloudflareRuntimeConfig({
        zoneId,
        zoneName,
      });

      const dnsRecords = await getCloudflareJson<CloudflareDnsRecord[]>(
        `/zones/${encodeURIComponent(zoneId)}/dns_records?per_page=100&page=1`,
        config.apiToken
      );

      return NextResponse.json({
        ok: true,
        setup: {
          hasApiToken: Boolean(updated.apiToken),
          apiTokenPreview: maskToken(updated.apiToken),
          accountId: updated.accountId,
          zoneId: updated.zoneId,
          zoneName: updated.zoneName,
          updatedAt: updated.updatedAt,
        },
        dnsRecords,
      });
    }

    if (action === "PURGE_CACHE") {
      await getCloudflareJson<{ id: string }>(
        `/zones/${encodeURIComponent(zoneId)}/purge_cache`,
        config.apiToken,
        {
          method: "POST",
          body: JSON.stringify({ purge_everything: true }),
        }
      );

      return NextResponse.json({ ok: true });
    }

    if (action === "PURGE_CACHE_URL") {
      const singleUrl = String(body.url ?? "").trim();
      const urls = Array.isArray(body.urls)
        ? body.urls.map((entry) => String(entry ?? "").trim()).filter(Boolean)
        : singleUrl
          ? [singleUrl]
          : [];

      if (urls.length === 0) {
        return new NextResponse("At least one URL is required", { status: 400 });
      }

      await getCloudflareJson<{ id: string }>(
        `/zones/${encodeURIComponent(zoneId)}/purge_cache`,
        config.apiToken,
        {
          method: "POST",
          body: JSON.stringify({ files: urls }),
        }
      );

      return NextResponse.json({ ok: true });
    }

    if (action === "UPSERT_DNS") {
      const type = String(body.type ?? "A").trim().toUpperCase().slice(0, 20);
      const name = String(body.name ?? "").trim();
      const content = String(body.content ?? "").trim();
      const ttlNumber = Number(body.ttl ?? 1);
      const ttl = Number.isFinite(ttlNumber) && ttlNumber >= 1 ? Math.floor(ttlNumber) : 1;
      const proxied = Boolean(body.proxied);
      const recordId = String(body.recordId ?? "").trim();

      if (!name || !content) {
        return new NextResponse("DNS name and content are required", { status: 400 });
      }

      const endpoint = recordId
        ? `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(recordId)}`
        : `/zones/${encodeURIComponent(zoneId)}/dns_records`;

      await getCloudflareJson<CloudflareDnsRecord>(endpoint, config.apiToken, {
        method: recordId ? "PUT" : "POST",
        body: JSON.stringify({
          type,
          name,
          content,
          ttl,
          proxied,
        }),
      });

      const dnsRecords = await getCloudflareJson<CloudflareDnsRecord[]>(
        `/zones/${encodeURIComponent(zoneId)}/dns_records?per_page=100&page=1`,
        config.apiToken
      );

      return NextResponse.json({ ok: true, dnsRecords });
    }

    if (action === "DELETE_DNS") {
      const recordId = String(body.recordId ?? "").trim();
      if (!recordId) {
        return new NextResponse("DNS record id is required", { status: 400 });
      }

      await getCloudflareJson<{ id: string }>(
        `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(recordId)}`,
        config.apiToken,
        {
          method: "DELETE",
        }
      );

      const dnsRecords = await getCloudflareJson<CloudflareDnsRecord[]>(
        `/zones/${encodeURIComponent(zoneId)}/dns_records?per_page=100&page=1`,
        config.apiToken
      );

      return NextResponse.json({ ok: true, dnsRecords });
    }

    return new NextResponse("Unsupported action", { status: 400 });
  } catch (error) {
    console.error("[ADMIN_CLOUDFLARE_POST]", error);
    return new NextResponse(error instanceof Error ? error.message : "Internal Error", { status: 500 });
  }
}
