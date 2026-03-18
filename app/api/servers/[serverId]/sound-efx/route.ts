import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { getServerManagementAccess } from "@/lib/server-management-access";
import {
  ensureServerSoundEfxSchema,
  isValidAudioUrl,
  isValidSoundEfxName,
  normalizeAudioUrl,
  normalizeSoundEfxName,
} from "@/lib/server-sound-efx";

type Params = { params: Promise<{ serverId: string }> };

type StatusFilter = "ALL" | "ACTIVE" | "DISABLED";

type ServerSoundEfxRow = {
  id: string;
  serverId: string;
  name: string;
  audioUrl: string;
  isEnabled: boolean | null;
  createdByProfileId: string | null;
  createdByName: string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
};

const normalizeStatusFilter = (value: unknown): StatusFilter => {
  const normalized = String(value ?? "ALL").trim().toUpperCase();
  if (normalized === "ACTIVE" || normalized === "DISABLED") {
    return normalized;
  }
  return "ALL";
};

export async function GET(req: Request, { params }: Params) {
  try {
    const { serverId: rawServerId } = await params;

    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const serverId = String(rawServerId ?? "").trim();
    if (!serverId) {
      return new NextResponse("Server ID is required", { status: 400 });
    }

    await ensureServerSoundEfxSchema();

    const access = await getServerManagementAccess({ serverId, profileId: profile.id, profileRole: profile.role });
    if (!access.canView) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const statusFilter = normalizeStatusFilter(searchParams.get("status"));

    const whereClauses: Array<ReturnType<typeof sql>> = [sql`s."serverId" = ${serverId}`];

    if (statusFilter === "ACTIVE") {
      whereClauses.push(sql`s."isEnabled" = true`);
    } else if (statusFilter === "DISABLED") {
      whereClauses.push(sql`s."isEnabled" = false`);
    }

    const whereSql = sql`where ${sql.join(whereClauses, sql` and `)}`;

    const result = await db.execute(sql`
      select
        s."id" as "id",
        s."serverId" as "serverId",
        s."name" as "name",
        s."audioUrl" as "audioUrl",
        s."isEnabled" as "isEnabled",
        s."createdByProfileId" as "createdByProfileId",
        coalesce(nullif(trim(up."profileName"), ''), nullif(trim(u."name"), ''), u."email", s."createdByProfileId") as "createdByName",
        s."createdAt" as "createdAt",
        s."updatedAt" as "updatedAt"
      from "ServerSoundEfx" s
      left join "Users" u on u."userId" = s."createdByProfileId"
      left join "UserProfile" up on up."userId" = s."createdByProfileId"
      ${whereSql}
      order by s."updatedAt" desc, s."createdAt" desc
      limit 1000
    `);

    const soundEfx = ((result as unknown as { rows?: ServerSoundEfxRow[] }).rows ?? []).map((row) => ({
      id: row.id,
      serverId: row.serverId,
      name: row.name,
      audioUrl: row.audioUrl,
      isEnabled: Boolean(row.isEnabled),
      createdByProfileId: row.createdByProfileId,
      createdByName: row.createdByName ?? row.createdByProfileId ?? "Unknown",
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    }));

    const summary = soundEfx.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.isEnabled) {
          acc.active += 1;
        }
        return acc;
      },
      { total: 0, active: 0 }
    );

    return NextResponse.json({
      soundEfx,
      summary,
      canManageSoundEfx: access.canManage,
    });
  } catch (error) {
    console.error("[SERVER_SOUND_EFX_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { serverId: rawServerId } = await params;

    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const serverId = String(rawServerId ?? "").trim();
    if (!serverId) {
      return new NextResponse("Server ID is required", { status: 400 });
    }

    await ensureServerSoundEfxSchema();

    const access = await getServerManagementAccess({ serverId, profileId: profile.id, profileRole: profile.role });
    if (!access.canManage) {
      return new NextResponse("Only the server owner or an In-Accord administrator can manage sound EFX", { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      audioUrl?: string;
    };

    const name = normalizeSoundEfxName(body.name);
    const audioUrl = normalizeAudioUrl(body.audioUrl);

    if (!isValidSoundEfxName(name)) {
      return new NextResponse("name must be 2-32 chars using lowercase letters, numbers, or underscore", { status: 400 });
    }

    if (!audioUrl || !isValidAudioUrl(audioUrl)) {
      return new NextResponse("audioUrl must be an absolute URL or app-relative path", { status: 400 });
    }

    await db.execute(sql`
      insert into "ServerSoundEfx" (
        "id",
        "serverId",
        "name",
        "audioUrl",
        "isEnabled",
        "createdByProfileId",
        "createdAt",
        "updatedAt"
      )
      values (
        ${uuidv4()},
        ${serverId},
        ${name},
        ${audioUrl},
        true,
        ${profile.id},
        now(),
        now()
      )
      on conflict ("serverId", "name") do update
      set
        "audioUrl" = excluded."audioUrl",
        "isEnabled" = true,
        "createdByProfileId" = excluded."createdByProfileId",
        "updatedAt" = excluded."updatedAt"
    `);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[SERVER_SOUND_EFX_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { serverId: rawServerId } = await params;

    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const serverId = String(rawServerId ?? "").trim();
    if (!serverId) {
      return new NextResponse("Server ID is required", { status: 400 });
    }

    await ensureServerSoundEfxSchema();

    const access = await getServerManagementAccess({ serverId, profileId: profile.id, profileRole: profile.role });
    if (!access.canManage) {
      return new NextResponse("Only the server owner or an In-Accord administrator can manage sound EFX", { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      itemId?: string;
      action?: string;
    };

    const itemId = String(body.itemId ?? "").trim();
    const action = String(body.action ?? "").trim().toUpperCase();

    if (!itemId) {
      return new NextResponse("itemId is required", { status: 400 });
    }

    if (action === "DELETE") {
      await db.execute(sql`
        delete from "ServerSoundEfx"
        where "id" = ${itemId}
          and "serverId" = ${serverId}
      `);

      return NextResponse.json({ ok: true, action });
    }

    if (action !== "ENABLE" && action !== "DISABLE") {
      return new NextResponse("action must be ENABLE, DISABLE, or DELETE", { status: 400 });
    }

    await db.execute(sql`
      update "ServerSoundEfx"
      set
        "isEnabled" = ${action === "ENABLE"},
        "updatedAt" = now()
      where "id" = ${itemId}
        and "serverId" = ${serverId}
    `);

    return NextResponse.json({ ok: true, action });
  } catch (error) {
    console.error("[SERVER_SOUND_EFX_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
