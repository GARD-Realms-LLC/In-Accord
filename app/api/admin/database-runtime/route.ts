import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import {
  getDatabaseRuntimeSetup,
  updateDatabaseRuntimeD1Info,
} from "@/lib/database-runtime-control";
import { isDatabaseRuntimeReady } from "@/lib/d1-runtime";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

const toNullableTrimmed = (value: unknown, max = 4096) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, max);
};

export async function GET() {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) {
      return auth.error;
    }

    return NextResponse.json({
      setup: await getDatabaseRuntimeSetup(),
      ready: await isDatabaseRuntimeReady(),
    });
  } catch (error) {
    console.error("[ADMIN_DATABASE_RUNTIME_GET]", error);
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
      d1AccountId?: unknown;
      d1DatabaseId?: unknown;
      d1DatabaseName?: unknown;
      d1ManagementUrl?: unknown;
    };

    const setup = await updateDatabaseRuntimeD1Info({
      ...(body.d1AccountId !== undefined
        ? { accountId: toNullableTrimmed(body.d1AccountId, 191) }
        : {}),
      ...(body.d1DatabaseId !== undefined
        ? { databaseId: toNullableTrimmed(body.d1DatabaseId, 191) }
        : {}),
      ...(body.d1DatabaseName !== undefined
        ? { databaseName: toNullableTrimmed(body.d1DatabaseName, 191) }
        : {}),
      ...(body.d1ManagementUrl !== undefined
        ? { managementUrl: toNullableTrimmed(body.d1ManagementUrl, 2048) }
        : {}),
    });

    return NextResponse.json({
      ok: true,
      setup,
      ready: await isDatabaseRuntimeReady(),
      message: "Cloudflare D1 settings saved.",
    });
  } catch (error) {
    console.error("[ADMIN_DATABASE_RUNTIME_PATCH]", error);
    return new NextResponse(
      error instanceof Error ? error.message : "Internal Error",
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) {
      return auth.error;
    }

    return NextResponse.json({
      ok: true,
      setup: await getDatabaseRuntimeSetup(),
      ready: await isDatabaseRuntimeReady(),
      message:
        "In-Accord now runs on Cloudflare D1. PostgreSQL snapshot imports are not available from this route.",
    });
  } catch (error) {
    console.error("[ADMIN_DATABASE_RUNTIME_POST]", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Internal Error",
      },
      { status: 500 },
    );
  }
}
