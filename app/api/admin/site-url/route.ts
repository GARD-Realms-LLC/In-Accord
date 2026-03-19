import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import { emitInAccordSystemEvent } from "@/lib/in-accord-event-system";
import {
  getEffectiveSiteUrl,
  getRuntimeSiteUrlConfig,
  updateRuntimeSiteUrlConfig,
} from "@/lib/runtime-site-url-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const normalizeSiteUrl = (value: unknown): string | null => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
};

export async function GET() {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!hasInAccordAdministrativeAccess(profile.role)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const config = await getRuntimeSiteUrlConfig();
    const effectiveAppBaseUrl = await getEffectiveSiteUrl();
    const envAppBaseUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

    return NextResponse.json({
      setup: {
        appBaseUrl: config.appBaseUrl,
        hostingServiceName: config.hostingServiceName,
        hostingHostName: config.hostingHostName,
        hostingHostUrl: config.hostingHostUrl,
        hostingLogin: config.hostingLogin,
        hostingPassword: config.hostingPassword,
        hostingCost: config.hostingCost,
        databaseServiceName: config.databaseServiceName,
        databaseHostName: config.databaseHostName,
        databaseHostUrl: config.databaseHostUrl,
        databaseLogin: config.databaseLogin,
        databasePassword: config.databasePassword,
        databaseCost: config.databaseCost,
        effectiveAppBaseUrl,
        envAppBaseUrl,
        usesOverride: Boolean(config.appBaseUrl),
        updatedAt: config.updatedAt,
      },
    });
  } catch (error) {
    console.error("[ADMIN_SITE_URL_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!hasInAccordAdministrativeAccess(profile.role)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      appBaseUrl?: unknown;
      hostingServiceName?: unknown;
      hostingHostName?: unknown;
      hostingHostUrl?: unknown;
      hostingLogin?: unknown;
      hostingPassword?: unknown;
      hostingCost?: unknown;
      databaseServiceName?: unknown;
      databaseHostName?: unknown;
      databaseHostUrl?: unknown;
      databaseLogin?: unknown;
      databasePassword?: unknown;
      databaseCost?: unknown;
    };

    const hasAnyUpdateField =
      body.appBaseUrl !== undefined ||
      body.hostingServiceName !== undefined ||
      body.hostingHostName !== undefined ||
      body.hostingHostUrl !== undefined ||
      body.hostingLogin !== undefined ||
      body.hostingPassword !== undefined ||
      body.hostingCost !== undefined ||
      body.databaseServiceName !== undefined ||
      body.databaseHostName !== undefined ||
      body.databaseHostUrl !== undefined ||
      body.databaseLogin !== undefined ||
      body.databasePassword !== undefined ||
      body.databaseCost !== undefined;

    const updatedFields = [
      ...(body.appBaseUrl !== undefined ? ["appBaseUrl"] : []),
      ...(body.hostingServiceName !== undefined ? ["hostingServiceName"] : []),
      ...(body.hostingHostName !== undefined ? ["hostingHostName"] : []),
      ...(body.hostingHostUrl !== undefined ? ["hostingHostUrl"] : []),
      ...(body.hostingLogin !== undefined ? ["hostingLogin"] : []),
      ...(body.hostingPassword !== undefined ? ["hostingPassword"] : []),
      ...(body.hostingCost !== undefined ? ["hostingCost"] : []),
      ...(body.databaseServiceName !== undefined ? ["databaseServiceName"] : []),
      ...(body.databaseHostName !== undefined ? ["databaseHostName"] : []),
      ...(body.databaseHostUrl !== undefined ? ["databaseHostUrl"] : []),
      ...(body.databaseLogin !== undefined ? ["databaseLogin"] : []),
      ...(body.databasePassword !== undefined ? ["databasePassword"] : []),
      ...(body.databaseCost !== undefined ? ["databaseCost"] : []),
    ];

    if (!hasAnyUpdateField) {
      return new NextResponse("No update fields provided", { status: 400 });
    }

    const toNullableTrimmed = (value: unknown) => {
      const normalized = String(value ?? "").trim();
      return normalized ? normalized : null;
    };

    const nextConfig = await updateRuntimeSiteUrlConfig({
      ...(body.appBaseUrl !== undefined ? { appBaseUrl: toNullableTrimmed(body.appBaseUrl) } : {}),
      ...(body.hostingServiceName !== undefined ? { hostingServiceName: toNullableTrimmed(body.hostingServiceName) } : {}),
      ...(body.hostingHostName !== undefined ? { hostingHostName: toNullableTrimmed(body.hostingHostName) } : {}),
      ...(body.hostingHostUrl !== undefined ? { hostingHostUrl: toNullableTrimmed(body.hostingHostUrl) } : {}),
      ...(body.hostingLogin !== undefined ? { hostingLogin: toNullableTrimmed(body.hostingLogin) } : {}),
      ...(body.hostingPassword !== undefined ? { hostingPassword: toNullableTrimmed(body.hostingPassword) } : {}),
      ...(body.hostingCost !== undefined ? { hostingCost: toNullableTrimmed(body.hostingCost) } : {}),
      ...(body.databaseServiceName !== undefined ? { databaseServiceName: toNullableTrimmed(body.databaseServiceName) } : {}),
      ...(body.databaseHostName !== undefined ? { databaseHostName: toNullableTrimmed(body.databaseHostName) } : {}),
      ...(body.databaseHostUrl !== undefined ? { databaseHostUrl: toNullableTrimmed(body.databaseHostUrl) } : {}),
      ...(body.databaseLogin !== undefined ? { databaseLogin: toNullableTrimmed(body.databaseLogin) } : {}),
      ...(body.databasePassword !== undefined ? { databasePassword: toNullableTrimmed(body.databasePassword) } : {}),
      ...(body.databaseCost !== undefined ? { databaseCost: toNullableTrimmed(body.databaseCost) } : {}),
    });
    const effectiveAppBaseUrl = await getEffectiveSiteUrl();
    const envAppBaseUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

    await emitInAccordSystemEvent({
      eventType: "ADMIN_SETTINGS_UPDATED",
      scope: "admin-controls",
      actorProfileId: profile.id,
      actorUserId: (profile as { userId?: string }).userId ?? null,
      targetId: "site-url-config",
      metadata: {
        updatedFields,
      },
    });

    return NextResponse.json({
      ok: true,
      setup: {
        appBaseUrl: nextConfig.appBaseUrl,
        hostingServiceName: nextConfig.hostingServiceName,
        hostingHostName: nextConfig.hostingHostName,
        hostingHostUrl: nextConfig.hostingHostUrl,
        hostingLogin: nextConfig.hostingLogin,
        hostingPassword: nextConfig.hostingPassword,
        hostingCost: nextConfig.hostingCost,
        databaseServiceName: nextConfig.databaseServiceName,
        databaseHostName: nextConfig.databaseHostName,
        databaseHostUrl: nextConfig.databaseHostUrl,
        databaseLogin: nextConfig.databaseLogin,
        databasePassword: nextConfig.databasePassword,
        databaseCost: nextConfig.databaseCost,
        effectiveAppBaseUrl,
        envAppBaseUrl,
        usesOverride: Boolean(nextConfig.appBaseUrl),
        updatedAt: nextConfig.updatedAt,
      },
    });
  } catch (error) {
    console.error("[ADMIN_SITE_URL_PATCH]", error);
    return new NextResponse(error instanceof Error ? error.message : "Internal Error", { status: 500 });
  }
}
