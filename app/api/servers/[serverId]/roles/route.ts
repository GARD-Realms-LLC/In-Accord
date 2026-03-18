import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { getServerManagementAccess } from "@/lib/server-management-access";
import { ensureServerRolesSchema } from "@/lib/server-roles";

type Params = { params: Promise<{ serverId: string }> };

const colorRegex = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export async function GET(_req: Request, { params }: Params) {
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

    const access = await getServerManagementAccess({ serverId, profileId: profile.id, profileRole: profile.role });
    if (!access.target) {
      return new NextResponse("Server not found", { status: 404 });
    }

    if (!access.canView) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await ensureServerRolesSchema();

    const canManageRoles = access.canManage;

    const rolesResult = await db.execute(sql`
      select
        r."id",
        r."name",
        r."color",
        r."iconUrl",
        r."isMentionable",
        r."showInOnlineMembers",
        r."position",
        r."isManaged",
        count(a."memberId")::int as "memberCount"
      from "ServerRole" r
      left join "ServerRoleAssignment" a
        on a."roleId" = r."id"
      where r."serverId" = ${serverId}
      group by r."id", r."name", r."color", r."iconUrl", r."isMentionable", r."showInOnlineMembers", r."position", r."isManaged"
      order by r."position" asc, r."name" asc
    `);

    const totalMembersResult = await db.execute(sql`
      select count(*)::int as "totalMembers"
      from "Member"
      where "serverId" = ${serverId}
    `);

    const roles = ((rolesResult as unknown as {
      rows?: Array<{
        id: string;
        name: string;
        color: string;
        iconUrl: string | null;
        isMentionable: boolean;
        showInOnlineMembers: boolean;
        position: number;
        isManaged: boolean;
        memberCount: number;
      }>;
    }).rows ?? []).map((row) => ({
      ...row,
      memberCount: Number(row.memberCount ?? 0),
    }));

    const totalMembers = Number(
      (totalMembersResult as unknown as { rows?: Array<{ totalMembers: number }> }).rows?.[0]?.totalMembers ?? 0
    );

    return NextResponse.json(
      { roles, totalMembers, canManageRoles },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error) {
    console.error("[SERVER_ROLES_GET]", error);
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

    const access = await getServerManagementAccess({ serverId, profileId: profile.id, profileRole: profile.role });
    if (!access.target) {
      return new NextResponse("Server not found", { status: 404 });
    }

    if (!access.canManage) {
      return new NextResponse("Only the server owner or an In-Accord administrator can create roles", { status: 403 });
    }

    await ensureServerRolesSchema();

    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      color?: string;
      iconUrl?: string | null;
      isMentionable?: boolean;
      showInOnlineMembers?: boolean;
    };

    const name = String(body.name ?? "").trim();
    const color = String(body.color ?? "#99aab5").trim();
    const iconUrl = body.iconUrl === null ? null : String(body.iconUrl ?? "").trim() || null;
    const isMentionable = typeof body.isMentionable === "boolean" ? body.isMentionable : true;
    const showInOnlineMembers =
      typeof body.showInOnlineMembers === "boolean" ? body.showInOnlineMembers : false;

    if (!name) {
      return new NextResponse("Role name is required", { status: 400 });
    }
    if (name.length > 100) {
      return new NextResponse("Role name must be 100 characters or fewer", { status: 400 });
    }
    if (!colorRegex.test(color)) {
      return new NextResponse("Role color must be a valid hex value", { status: 400 });
    }

    const nextPositionResult = await db.execute(sql`
      select coalesce(max("position"), 0)::int + 1 as "nextPosition"
      from "ServerRole"
      where "serverId" = ${serverId}
    `);

    const nextPosition = Number(
      (nextPositionResult as unknown as { rows?: Array<{ nextPosition: number }> }).rows?.[0]?.nextPosition ?? 1
    );

    const roleId = crypto.randomUUID();

    const insertResult = await db.execute(sql`
      insert into "ServerRole" (
        "id",
        "serverId",
        "name",
        "color",
        "iconUrl",
        "isMentionable",
        "showInOnlineMembers",
        "position",
        "isManaged",
        "createdAt",
        "updatedAt"
      )
      values (
        ${roleId},
        ${serverId},
        ${name},
        ${color},
        ${iconUrl},
        ${isMentionable},
        ${showInOnlineMembers},
        ${nextPosition},
        false,
        now(),
        now()
      )
      returning "id", "name", "color", "iconUrl", "isMentionable", "showInOnlineMembers", "position", "isManaged"
    `);

    let role = (insertResult as unknown as {
      rows?: Array<{
        id: string;
        name: string;
        color: string;
        iconUrl: string | null;
        isMentionable: boolean;
        showInOnlineMembers: boolean;
        position: number;
        isManaged: boolean;
      }>;
    }).rows?.[0];

    if (!role) {
      const roleResult = await db.execute(sql`
        select "id", "name", "color", "iconUrl", "isMentionable", "showInOnlineMembers", "position", "isManaged"
        from "ServerRole"
        where "id" = ${roleId}
          and "serverId" = ${serverId}
        limit 1
      `);

      role = (roleResult as unknown as {
        rows?: Array<{
          id: string;
          name: string;
          color: string;
          iconUrl: string | null;
          isMentionable: boolean;
          showInOnlineMembers: boolean;
          position: number;
          isManaged: boolean;
        }>;
      }).rows?.[0];
    }

    if (!role) {
      return new NextResponse("Role was created but could not be loaded", { status: 500 });
    }

    await db.execute(sql`
      insert into "ServerRolePermission" (
        "roleId",
        "serverId",
        "allowView",
        "allowSend",
        "allowConnect",
        "manageChannels",
        "manageRoles",
        "manageMembers",
        "moderateMembers",
        "viewAuditLog",
        "manageServer",
        "createInstantInvite",
        "changeNickname",
        "manageNicknames",
        "kickMembers",
        "banMembers",
        "manageEmojisAndStickers",
        "manageWebhooks",
        "manageEvents",
        "viewServerInsights",
        "useApplicationCommands",
        "sendMessagesInThreads",
        "createPublicThreads",
        "createPrivateThreads",
        "embedLinks",
        "attachFiles",
        "addReactions",
        "useExternalEmojis",
        "mentionEveryone",
        "manageMessages",
        "readMessageHistory",
        "sendTtsMessages",
        "speak",
        "stream",
        "useVoiceActivity",
        "prioritySpeaker",
        "muteMembers",
        "deafenMembers",
        "moveMembers",
        "requestToSpeak",
        "updatedAt"
      )
      values (
        ${role.id},
        ${serverId},
        true,
        true,
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        now()
      )
      on conflict ("roleId")
      do nothing
    `);

    return NextResponse.json({ role }, { status: 201 });
  } catch (error) {
    console.error("[SERVER_ROLES_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
