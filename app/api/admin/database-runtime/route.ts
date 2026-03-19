import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import {
  getDatabaseRuntimeSetup,
  getEffectiveDatabaseConnectionString,
  getEffectiveDatabaseTarget,
  recordDatabaseRuntimeD1Sync,
  setDatabaseRuntimeTarget,
  updateDatabaseRuntimeD1Info,
} from "@/lib/database-runtime-control";
import { syncPostgresSnapshotToD1 } from "@/lib/d1-snapshot-sync";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type DatabaseRuntimeAction =
  | "SET_TARGET"
  | "SYNC_TO_D1";

let activeD1Sync:
  | Promise<{
      message: string;
      setup: ReturnType<typeof getDatabaseRuntimeSetup>;
      sync: Awaited<ReturnType<typeof syncPostgresSnapshotToD1>>;
    }>
  | null = null;

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

const normalizeTarget = (value: unknown) =>
  String(value ?? "").trim().toLowerCase() === "local" ? "local" : "live";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) {
      return auth.error;
    }

    return NextResponse.json({
      setup: getDatabaseRuntimeSetup(),
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

    const hasAnyUpdateField =
      body.d1AccountId !== undefined ||
      body.d1DatabaseId !== undefined ||
      body.d1DatabaseName !== undefined ||
      body.d1ManagementUrl !== undefined;

    if (!hasAnyUpdateField) {
      return new NextResponse("No update fields provided", { status: 400 });
    }

    const setup = updateDatabaseRuntimeD1Info({
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
      message: "Database runtime settings saved.",
    });
  } catch (error) {
    console.error("[ADMIN_DATABASE_RUNTIME_PATCH]", error);
    return new NextResponse(
      error instanceof Error ? error.message : "Internal Error",
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) {
      return auth.error;
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?: unknown;
      target?: unknown;
    };

    const action = String(body.action ?? "").trim().toUpperCase() as DatabaseRuntimeAction;

    if (action === "SET_TARGET") {
      const target = normalizeTarget(body.target);
      const setup = setDatabaseRuntimeTarget(target);

      return NextResponse.json({
        ok: true,
        setup,
        message: `Database runtime switched to ${target === "local" ? "Local PostgreSQL" : "Live PostgreSQL"}.`,
      });
    }

    if (action === "SYNC_TO_D1") {
      if (activeD1Sync) {
        return NextResponse.json(
          {
            ok: false,
            message: "A D1 snapshot sync is already running.",
          },
          { status: 409 },
        );
      }

      activeD1Sync = (async () => {
        const setup = getDatabaseRuntimeSetup();
        if (!setup.d1.databaseName) {
          throw new Error("Set a D1 database name before syncing.");
        }

        const sourceTarget = getEffectiveDatabaseTarget();
        const connectionString = getEffectiveDatabaseConnectionString();
        const sync = await syncPostgresSnapshotToD1({
          connectionString,
          databaseName: setup.d1.databaseName,
        });

        const nextSetup = recordDatabaseRuntimeD1Sync({
          sourceTarget,
          tableCount: sync.tableCount,
          rowsWritten: sync.rowsWritten,
          note: `Snapshot pushed to ${sync.databaseName}${sync.databaseSizeMb ? ` (${sync.databaseSizeMb} MB)` : ""}.`,
        });

        return {
          message: `D1 snapshot sync completed from ${sourceTarget === "local" ? "Local PostgreSQL" : "Live PostgreSQL"}.`,
          setup: nextSetup,
          sync,
        };
      })();

      const result = await activeD1Sync;

      return NextResponse.json({
        ok: true,
        ...result,
      });
    }

    return new NextResponse("Unsupported action", { status: 400 });
  } catch (error) {
    console.error("[ADMIN_DATABASE_RUNTIME_POST]", error);
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "Internal Error",
      },
      { status: 500 },
    );
  } finally {
    activeD1Sync = null;
  }
}
