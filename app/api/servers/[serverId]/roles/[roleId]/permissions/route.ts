import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { db, member, server } from "@/lib/db";
import { ensureServerRolesSchema } from "@/lib/server-roles";

type Params = { params: Promise<{ serverId: string; roleId: string }> };

type ServerRolePermissions = {
  allowView: boolean;
  allowSend: boolean;
  allowConnect: boolean;
  manageChannels: boolean;
  manageRoles: boolean;
  manageMembers: boolean;
  moderateMembers: boolean;
  viewAuditLog: boolean;
  manageServer: boolean;
  createInstantInvite: boolean;
  changeNickname: boolean;
  manageNicknames: boolean;
  kickMembers: boolean;
  banMembers: boolean;
  manageEmojisAndStickers: boolean;
  manageWebhooks: boolean;
  manageEvents: boolean;
  viewServerInsights: boolean;
  useApplicationCommands: boolean;
  sendMessagesInThreads: boolean;
  createPublicThreads: boolean;
  createPrivateThreads: boolean;
  embedLinks: boolean;
  attachFiles: boolean;
  addReactions: boolean;
  useExternalEmojis: boolean;
  mentionEveryone: boolean;
  manageMessages: boolean;
  readMessageHistory: boolean;
  sendTtsMessages: boolean;
  speak: boolean;
  stream: boolean;
  useVoiceActivity: boolean;
  prioritySpeaker: boolean;
  muteMembers: boolean;
  deafenMembers: boolean;
  moveMembers: boolean;
  requestToSpeak: boolean;
};

const SERVER_ROLE_PERMISSION_KEYS = [
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
] as const;

const isServerRolePermissions = (value: unknown): value is ServerRolePermissions => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return SERVER_ROLE_PERMISSION_KEYS.every((key) => typeof candidate[key] === "boolean");
};

const getIds = (params: Awaited<Params["params"]>) => ({
  serverId: String(params.serverId ?? "").trim(),
  roleId: String(params.roleId ?? "").trim(),
});

export async function GET(_req: Request, { params }: Params) {
  try {
    const resolvedParams = await params;

    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { serverId, roleId } = getIds(resolvedParams);
    if (!serverId || !roleId) {
      return new NextResponse("Server ID and Role ID are required", { status: 400 });
    }

    const existingMember = await db.query.member.findFirst({
      where: and(eq(member.serverId, serverId), eq(member.profileId, profile.id)),
      columns: { id: true },
    });

    if (!existingMember) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await ensureServerRolesSchema();

    const roleResult = await db.execute(sql`
      select "id"
      from "ServerRole"
      where "id" = ${roleId}
        and "serverId" = ${serverId}
      limit 1
    `);

    const roleExists = Boolean((roleResult as unknown as { rows?: Array<{ id: string }> }).rows?.[0]);
    if (!roleExists) {
      return new NextResponse("Role not found", { status: 404 });
    }

    const ownerServer = await db.query.server.findFirst({
      where: and(eq(server.id, serverId), eq(server.profileId, profile.id)),
      columns: { id: true },
    });

    const permissionsResult = await db.execute(sql`
      select
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
        "requestToSpeak"
      from "ServerRolePermission"
      where "roleId" = ${roleId}
        and "serverId" = ${serverId}
      limit 1
    `);

    const row = (permissionsResult as unknown as {
      rows?: Array<ServerRolePermissions>;
    }).rows?.[0];

    if (!isServerRolePermissions(row)) {
      return new NextResponse("Role permissions are not initialized", { status: 409 });
    }

    const permissions: ServerRolePermissions = row;

    return NextResponse.json({
      permissions,
      canManageRolePermissions: Boolean(ownerServer),
    });
  } catch (error) {
    console.error("[SERVER_ROLE_PERMISSIONS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const resolvedParams = await params;

    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { serverId, roleId } = getIds(resolvedParams);
    if (!serverId || !roleId) {
      return new NextResponse("Server ID and Role ID are required", { status: 400 });
    }

    const ownerServer = await db.query.server.findFirst({
      where: and(eq(server.id, serverId), eq(server.profileId, profile.id)),
      columns: { id: true },
    });

    if (!ownerServer) {
      return new NextResponse("Only the server owner can edit role permissions", { status: 403 });
    }

    await ensureServerRolesSchema();

    const roleResult = await db.execute(sql`
      select "id"
      from "ServerRole"
      where "id" = ${roleId}
        and "serverId" = ${serverId}
      limit 1
    `);

    const roleExists = Boolean((roleResult as unknown as { rows?: Array<{ id: string }> }).rows?.[0]);
    if (!roleExists) {
      return new NextResponse("Role not found", { status: 404 });
    }

    const body = (await req.json().catch(() => null)) as {
      permissions?: unknown;
    } | null;

    const permissionsPayload = body?.permissions;

    if (!isServerRolePermissions(permissionsPayload)) {
      return new NextResponse("permissions payload is required and must include explicit booleans", { status: 400 });
    }

    const permissions: ServerRolePermissions = permissionsPayload;

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
        ${roleId},
        ${serverId},
        ${permissions.allowView},
        ${permissions.allowSend},
        ${permissions.allowConnect},
        ${permissions.manageChannels},
        ${permissions.manageRoles},
        ${permissions.manageMembers},
        ${permissions.moderateMembers},
        ${permissions.viewAuditLog},
        ${permissions.manageServer},
        ${permissions.createInstantInvite},
        ${permissions.changeNickname},
        ${permissions.manageNicknames},
        ${permissions.kickMembers},
        ${permissions.banMembers},
        ${permissions.manageEmojisAndStickers},
        ${permissions.manageWebhooks},
        ${permissions.manageEvents},
        ${permissions.viewServerInsights},
        ${permissions.useApplicationCommands},
        ${permissions.sendMessagesInThreads},
        ${permissions.createPublicThreads},
        ${permissions.createPrivateThreads},
        ${permissions.embedLinks},
        ${permissions.attachFiles},
        ${permissions.addReactions},
        ${permissions.useExternalEmojis},
        ${permissions.mentionEveryone},
        ${permissions.manageMessages},
        ${permissions.readMessageHistory},
        ${permissions.sendTtsMessages},
        ${permissions.speak},
        ${permissions.stream},
        ${permissions.useVoiceActivity},
        ${permissions.prioritySpeaker},
        ${permissions.muteMembers},
        ${permissions.deafenMembers},
        ${permissions.moveMembers},
        ${permissions.requestToSpeak},
        now()
      )
      on conflict ("roleId")
      do update set
        "allowView" = excluded."allowView",
        "allowSend" = excluded."allowSend",
        "allowConnect" = excluded."allowConnect",
        "manageChannels" = excluded."manageChannels",
        "manageRoles" = excluded."manageRoles",
        "manageMembers" = excluded."manageMembers",
        "moderateMembers" = excluded."moderateMembers",
        "viewAuditLog" = excluded."viewAuditLog",
        "manageServer" = excluded."manageServer",
        "createInstantInvite" = excluded."createInstantInvite",
        "changeNickname" = excluded."changeNickname",
        "manageNicknames" = excluded."manageNicknames",
        "kickMembers" = excluded."kickMembers",
        "banMembers" = excluded."banMembers",
        "manageEmojisAndStickers" = excluded."manageEmojisAndStickers",
        "manageWebhooks" = excluded."manageWebhooks",
        "manageEvents" = excluded."manageEvents",
        "viewServerInsights" = excluded."viewServerInsights",
        "useApplicationCommands" = excluded."useApplicationCommands",
        "sendMessagesInThreads" = excluded."sendMessagesInThreads",
        "createPublicThreads" = excluded."createPublicThreads",
        "createPrivateThreads" = excluded."createPrivateThreads",
        "embedLinks" = excluded."embedLinks",
        "attachFiles" = excluded."attachFiles",
        "addReactions" = excluded."addReactions",
        "useExternalEmojis" = excluded."useExternalEmojis",
        "mentionEveryone" = excluded."mentionEveryone",
        "manageMessages" = excluded."manageMessages",
        "readMessageHistory" = excluded."readMessageHistory",
        "sendTtsMessages" = excluded."sendTtsMessages",
        "speak" = excluded."speak",
        "stream" = excluded."stream",
        "useVoiceActivity" = excluded."useVoiceActivity",
        "prioritySpeaker" = excluded."prioritySpeaker",
        "muteMembers" = excluded."muteMembers",
        "deafenMembers" = excluded."deafenMembers",
        "moveMembers" = excluded."moveMembers",
        "requestToSpeak" = excluded."requestToSpeak",
        "updatedAt" = excluded."updatedAt"
    `);

    return NextResponse.json({ ok: true, permissions });
  } catch (error) {
    console.error("[SERVER_ROLE_PERMISSIONS_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
