import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { ensureServerTagSchema, allowedServerTagIconKeys, serverTagIconOptions } from "@/lib/server-tags";
import { getUserPreferences, updateUserPreferences } from "@/lib/user-preferences";

type OwnerTagRow = {
  serverId: string;
  serverName: string;
  tagCode: string | null;
  iconKey: string | null;
};

type MemberTagRow = {
  serverId: string;
  serverName: string;
  tagCode: string;
  iconKey: string;
};

const normalizeTagCode = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toUpperCase();
};

const buildResponse = async (profileId: string) => {
  await ensureServerTagSchema();

  const ownedResult = await db.execute(sql`
    select
      s."id" as "serverId",
      s."name" as "serverName",
      st."tagCode" as "tagCode",
      st."iconKey" as "iconKey"
    from "Server" s
    left join "ServerTag" st on st."serverId" = s."id"
    where s."profileId" = ${profileId}
    order by lower(s."name") asc
  `);

  const memberResult = await db.execute(sql`
    select
      s."id" as "serverId",
      s."name" as "serverName",
      st."tagCode" as "tagCode",
      st."iconKey" as "iconKey"
    from "Member" m
    inner join "Server" s on s."id" = m."serverId"
    inner join "ServerTag" st on st."serverId" = s."id"
    where m."profileId" = ${profileId}
    order by lower(s."name") asc
  `);

  const preferences = await getUserPreferences(profileId);

  const ownedServers = ((ownedResult as unknown as { rows?: OwnerTagRow[] }).rows ?? []).map((row) => ({
    serverId: row.serverId,
    serverName: row.serverName,
    tagCode: row.tagCode,
    iconKey: row.iconKey,
  }));

  const memberServerTags = ((memberResult as unknown as { rows?: MemberTagRow[] }).rows ?? []).map((row) => ({
    serverId: row.serverId,
    serverName: row.serverName,
    tagCode: row.tagCode,
    iconKey: row.iconKey,
    iconEmoji: serverTagIconOptions.find((item) => item.key === row.iconKey)?.emoji ?? "🏷️",
    isSelected: preferences.selectedServerTagServerId === row.serverId,
  }));

  return {
    ownedServers,
    memberServerTags,
    selectedServerId: preferences.selectedServerTagServerId,
    iconOptions: serverTagIconOptions,
  };
};

export async function GET() {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await buildResponse(profile.id);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("[SERVER_TAGS_GET]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureServerTagSchema();

    const body = (await req.json().catch(() => ({}))) as {
      mode?: "owner" | "profile";
      serverId?: string;
      tagCode?: string | null;
      iconKey?: string | null;
      selectedServerId?: string | null;
    };

    if (body.mode === "owner") {
      const serverId = String(body.serverId ?? "").trim();
      const tagCode = normalizeTagCode(body.tagCode);
      const iconKey = String(body.iconKey ?? "").trim().toLowerCase();

      if (!serverId) {
        return NextResponse.json({ error: "serverId is required" }, { status: 400 });
      }

      const ownerCheck = await db.execute(sql`
        select "id"
        from "Server"
        where "id" = ${serverId}
          and "profileId" = ${profile.id}
        limit 1
      `);

      const ownsServer = Boolean((ownerCheck as unknown as { rows?: Array<{ id: string }> }).rows?.[0]?.id);
      if (!ownsServer) {
        return NextResponse.json({ error: "Only server owners can edit server tags" }, { status: 403 });
      }

      if (!tagCode) {
        await db.execute(sql`
          delete from "ServerTag"
          where "serverId" = ${serverId}
        `);
      } else {
        if (!/^[A-Z]{3,4}$/.test(tagCode)) {
          return NextResponse.json({ error: "Tag code must be exactly 3 or 4 letters" }, { status: 400 });
        }

        if (!allowedServerTagIconKeys.has(iconKey)) {
          return NextResponse.json({ error: "Invalid icon selection" }, { status: 400 });
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
    }

    if (body.mode === "profile") {
      const selectedServerId = String(body.selectedServerId ?? "").trim();

      if (!selectedServerId) {
        await updateUserPreferences(profile.id, {
          selectedServerTagServerId: null,
        });
      } else {
        const membershipResult = await db.execute(sql`
          select "id"
          from "Member"
          where "profileId" = ${profile.id}
            and "serverId" = ${selectedServerId}
          limit 1
        `);

        const hasMembership = Boolean(
          (membershipResult as unknown as { rows?: Array<{ id: string }> }).rows?.[0]?.id
        );

        if (!hasMembership) {
          return NextResponse.json({ error: "You must be a member of the server" }, { status: 403 });
        }

        const serverTagResult = await db.execute(sql`
          select "serverId"
          from "ServerTag"
          where "serverId" = ${selectedServerId}
          limit 1
        `);

        const hasServerTag = Boolean(
          (serverTagResult as unknown as { rows?: Array<{ serverId: string }> }).rows?.[0]?.serverId
        );

        if (!hasServerTag) {
          return NextResponse.json({ error: "Selected server has no configured tag" }, { status: 400 });
        }

        await updateUserPreferences(profile.id, {
          selectedServerTagServerId: selectedServerId,
        });
      }
    }

    const payload = await buildResponse(profile.id);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("[SERVER_TAGS_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
