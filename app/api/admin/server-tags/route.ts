import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import { allowedServerTagIconKeys, ensureServerTagSchema, serverTagIconOptions } from "@/lib/server-tags";
import { ensureUserPreferencesSchema } from "@/lib/user-preferences";

type ServerTagRow = {
  serverId: string;
  serverName: string;
  ownerId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  tagCode: string | null;
  iconKey: string | null;
  selectedProfileCount: number | string | null;
};

const normalizeTagCode = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toUpperCase();
};

const buildResponse = async () => {
  await ensureServerTagSchema();
  await ensureUserPreferencesSchema();

  const result = await db.execute(sql`
    select
      s."id" as "serverId",
      s."name" as "serverName",
      s."profileId" as "ownerId",
      u."name" as "ownerName",
      u."email" as "ownerEmail",
      st."tagCode" as "tagCode",
      st."iconKey" as "iconKey",
      (
        select count(*)::int
        from "UserPreference" up
        where up."selectedServerTagServerId" = s."id"
      ) as "selectedProfileCount"
    from "Server" s
    left join "Users" u on u."userId" = s."profileId"
    left join "ServerTag" st on st."serverId" = s."id"
    order by lower(s."name") asc
  `);

  const rows = (result as unknown as { rows?: ServerTagRow[] }).rows ?? [];

  const serverTags = rows.map((row) => ({
    serverId: row.serverId,
    serverName: row.serverName ?? "Untitled Server",
    ownerId: row.ownerId ?? "",
    ownerName: row.ownerName ?? row.ownerEmail ?? row.ownerId ?? "Unknown Owner",
    ownerEmail: row.ownerEmail ?? "",
    tagCode: row.tagCode,
    iconKey: row.iconKey,
    iconEmoji: serverTagIconOptions.find((item) => item.key === row.iconKey)?.emoji ?? "🏷️",
    selectedProfileCount: Number(row.selectedProfileCount ?? 0),
  }));

  return {
    serverTags,
    iconOptions: serverTagIconOptions,
  };
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

    const payload = await buildResponse();
    return NextResponse.json(payload);
  } catch (error) {
    console.error("[ADMIN_SERVER_TAGS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!hasInAccordAdministrativeAccess(profile.role)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    await ensureServerTagSchema();
    await ensureUserPreferencesSchema();

    const body = (await request.json().catch(() => ({}))) as {
      serverId?: string;
      tagCode?: string | null;
      iconKey?: string | null;
    };

    const serverId = String(body.serverId ?? "").trim();
    const tagCode = normalizeTagCode(body.tagCode);
    const iconKey = String(body.iconKey ?? "").trim().toLowerCase();

    if (!serverId) {
      return new NextResponse("serverId is required", { status: 400 });
    }

    const serverCheck = await db.execute(sql`
      select "id"
      from "Server"
      where "id" = ${serverId}
      limit 1
    `);

    const serverExists = Boolean(
      (serverCheck as unknown as { rows?: Array<{ id: string }> }).rows?.[0]?.id
    );

    if (!serverExists) {
      return new NextResponse("Server not found", { status: 404 });
    }

    if (!tagCode) {
      await db.execute(sql`
        delete from "ServerTag"
        where "serverId" = ${serverId}
      `);

      await db.execute(sql`
        update "UserPreference"
        set "selectedServerTagServerId" = null,
            "updatedAt" = now()
        where "selectedServerTagServerId" = ${serverId}
      `);
    } else {
      if (!/^[A-Z]{3,4}$/.test(tagCode)) {
        return new NextResponse("Tag code must be exactly 3 or 4 letters", { status: 400 });
      }

      if (!allowedServerTagIconKeys.has(iconKey)) {
        return new NextResponse("Invalid icon selection", { status: 400 });
      }

      await db.execute(sql`
        insert into "ServerTag" ("serverId", "tagCode", "iconKey", "createdAt", "updatedAt")
        values (${serverId}, ${tagCode}, ${iconKey}, now(), now())
        on conflict ("serverId") do update
        set "tagCode" = excluded."tagCode",
            "iconKey" = excluded."iconKey",
            "updatedAt" = excluded."updatedAt"
      `);
    }

    const payload = await buildResponse();
    return NextResponse.json(payload);
  } catch (error) {
    console.error("[ADMIN_SERVER_TAGS_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
