import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { currentProfile } from "@/lib/current-profile";
import { ChannelType, db, server } from "@/lib/db";
import { ensureChannelGroupSchema } from "@/lib/channel-groups";
import { ensureServerRolesSchema } from "@/lib/server-roles";
import { ensureChannelTopicSchema } from "@/lib/channel-topic";
import { ensureSystemChannelSchema } from "@/lib/system-channels";
import { ensureChannelOtherSettingsSchema } from "@/lib/channel-discord-settings";
import { getDecryptedOtherBotToken, getUserPreferences } from "@/lib/user-preferences";

type Params = { params: Promise<{ serverId: string }> };

type OtherTemplateRole = {
  id?: string;
  name?: string;
  color?: number;
  permissions?: string | number;
  mentionable?: boolean;
  managed?: boolean;
  position?: number;
};

type OtherTemplateChannel = {
  id?: string;
  type?: number | string;
  name?: string;
  parent_id?: string | null;
  position?: number;
  permission_overwrites?: unknown[];
  topic?: string | null;
  nsfw?: boolean;
  rate_limit_per_user?: number;
  bitrate?: number;
  user_limit?: number;
  rtc_region?: string | null;
  video_quality_mode?: number;
  default_auto_archive_duration?: number;
  default_thread_rate_limit_per_user?: number;
  permissions_synced?: boolean;
};

type OtherTemplatePayload = {
  code?: string;
  name?: string;
  description?: string | null;
  serialized_source_guild?: {
    name?: string;
    description?: string | null;
    roles?: OtherTemplateRole[];
    channels?: OtherTemplateChannel[];
  };
};

type ImportRequestBody = {
  templateInput?: string;
  sourceServerId?: string;
  OtherServerId?: string;
  notInAccordServerId?: string;
  botId?: string;
  replaceChannels?: boolean;
  replaceRoles?: boolean;
};

const Other_PERMISSION_FLAGS = {
  CREATE_INSTANT_INVITE: BigInt(1) << BigInt(0),
  KICK_MEMBERS: BigInt(1) << BigInt(1),
  BAN_MEMBERS: BigInt(1) << BigInt(2),
  MANAGE_CHANNELS: BigInt(1) << BigInt(4),
  MANAGE_GUILD: BigInt(1) << BigInt(5),
  ADD_REACTIONS: BigInt(1) << BigInt(6),
  VIEW_AUDIT_LOG: BigInt(1) << BigInt(7),
  PRIORITY_SPEAKER: BigInt(1) << BigInt(8),
  STREAM: BigInt(1) << BigInt(9),
  VIEW_CHANNEL: BigInt(1) << BigInt(10),
  SEND_MESSAGES: BigInt(1) << BigInt(11),
  SEND_TTS_MESSAGES: BigInt(1) << BigInt(12),
  MANAGE_MESSAGES: BigInt(1) << BigInt(13),
  EMBED_LINKS: BigInt(1) << BigInt(14),
  ATTACH_FILES: BigInt(1) << BigInt(15),
  READ_MESSAGE_HISTORY: BigInt(1) << BigInt(16),
  MENTION_EVERYONE: BigInt(1) << BigInt(17),
  USE_EXTERNAL_EMOJIS: BigInt(1) << BigInt(18),
  CONNECT: BigInt(1) << BigInt(20),
  SPEAK: BigInt(1) << BigInt(21),
  MUTE_MEMBERS: BigInt(1) << BigInt(22),
  DEAFEN_MEMBERS: BigInt(1) << BigInt(23),
  MOVE_MEMBERS: BigInt(1) << BigInt(24),
  USE_VAD: BigInt(1) << BigInt(25),
  CHANGE_NICKNAME: BigInt(1) << BigInt(26),
  MANAGE_NICKNAMES: BigInt(1) << BigInt(27),
  MANAGE_ROLES: BigInt(1) << BigInt(28),
  MANAGE_WEBHOOKS: BigInt(1) << BigInt(29),
  MANAGE_EMOJIS_AND_STICKERS: BigInt(1) << BigInt(30),
  USE_APPLICATION_COMMANDS: BigInt(1) << BigInt(31),
  REQUEST_TO_SPEAK: BigInt(1) << BigInt(32),
  MANAGE_EVENTS: BigInt(1) << BigInt(33),
  CREATE_PUBLIC_THREADS: BigInt(1) << BigInt(35),
  CREATE_PRIVATE_THREADS: BigInt(1) << BigInt(36),
  SEND_MESSAGES_IN_THREADS: BigInt(1) << BigInt(38),
  MODERATE_MEMBERS: BigInt(1) << BigInt(40),
} as const;

const normalizeTemplateCode = (input: string) => {
  const raw = String(input ?? "").trim();
  if (!raw) {
    return "";
  }

  const fromOtherNew = raw.match(/^https?:\/\/(?:discord|Other)\.new\/([A-Za-z0-9_-]+)\/?/i)?.[1];
  if (fromOtherNew) {
    return fromOtherNew;
  }

  const fromOtherCom =
    raw.match(/^https?:\/\/(?:discord|Other)(?:app)?\.com\/template\/([A-Za-z0-9_-]+)\/?/i)?.[1] ??
    raw.match(/^https?:\/\/(?:discord|Other)(?:app)?\.com\/templates\/([A-Za-z0-9_-]+)\/?/i)?.[1];

  if (fromOtherCom) {
    return fromOtherCom;
  }

  return raw.replace(/[^A-Za-z0-9_-]/g, "");
};

const normalizeOtherGuildId = (input: string) => {
  const normalized = String(input ?? "").trim();
  if (!normalized) {
    return "";
  }

  const digits = normalized.replace(/\D/g, "");
  return /^\d{15,22}$/.test(digits) ? digits : "";
};

const normalizeOtherInviteCode = (input: string) => {
  const raw = String(input ?? "").trim();
  if (!raw) {
    return "";
  }

  const directCode = raw.match(/^([A-Za-z0-9-]{2,64})$/)?.[1];
  if (directCode) {
    return directCode;
  }

  const fromUrl =
    raw.match(/^https?:\/\/(?:www\.)?(?:discord|Other)\.gg\/([A-Za-z0-9-]{2,64})\/?/i)?.[1] ??
    raw.match(/^https?:\/\/(?:www\.)?(?:discord|Other)(?:app)?\.com\/invite\/([A-Za-z0-9-]{2,64})\/?/i)?.[1];

  return fromUrl ?? "";
};

const asBigIntPermissions = (value: string | number | undefined): bigint => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.max(0, Math.floor(value)));
  }

  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return BigInt(0);
  }

  try {
    return BigInt(normalized);
  } catch {
    return BigInt(0);
  }
};

const hasPerm = (permissions: bigint, flag: bigint) => (permissions & flag) === flag;

const colorToHex = (value: number | undefined) => {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(0xffffff, Math.floor(value))) : 0x99aab5;
  return `#${n.toString(16).padStart(6, "0")}`;
};

const resolveUniqueName = (name: string, usedLowerNames: Set<string>, fallbackPrefix: string) => {
  const base = String(name ?? "").trim() || fallbackPrefix;
  let candidate = base;
  let index = 2;

  while (usedLowerNames.has(candidate.trim().toLowerCase())) {
    candidate = `${base}-${index}`;
    index += 1;
  }

  usedLowerNames.add(candidate.trim().toLowerCase());
  return candidate;
};

const mapOtherChannelType = (type: number): ChannelType | null => {
  if (type === 0 || type === 5 || type === 15) {
    return ChannelType.TEXT;
  }

  if (type === 2) {
    return ChannelType.AUDIO;
  }

  if (type === 13) {
    return ChannelType.VIDEO;
  }

  return null;
};

const normalizeOtherChannelSettings = (channel: OtherTemplateChannel) => {
  const topic = typeof channel.topic === "string" ? channel.topic.trim().slice(0, 500) : "";

  return {
    topic,
    nsfw: channel.nsfw === true,
    rateLimitPerUser:
      typeof channel.rate_limit_per_user === "number" && Number.isFinite(channel.rate_limit_per_user)
        ? Math.max(0, Math.min(21600, Math.floor(channel.rate_limit_per_user)))
        : 0,
    bitrate:
      typeof channel.bitrate === "number" && Number.isFinite(channel.bitrate)
        ? Math.max(8000, Math.min(384000, Math.floor(channel.bitrate)))
        : null,
    userLimit:
      typeof channel.user_limit === "number" && Number.isFinite(channel.user_limit)
        ? Math.max(0, Math.min(99, Math.floor(channel.user_limit)))
        : null,
    rtcRegion:
      typeof channel.rtc_region === "string" && channel.rtc_region.trim().length > 0
        ? channel.rtc_region.trim().slice(0, 64)
        : null,
    videoQualityMode:
      typeof channel.video_quality_mode === "number" && Number.isFinite(channel.video_quality_mode)
        ? Math.max(1, Math.min(2, Math.floor(channel.video_quality_mode)))
        : null,
    defaultAutoArchiveDuration:
      typeof channel.default_auto_archive_duration === "number" && Number.isFinite(channel.default_auto_archive_duration)
        ? Math.max(60, Math.min(10080, Math.floor(channel.default_auto_archive_duration)))
        : null,
    defaultThreadRateLimitPerUser:
      typeof channel.default_thread_rate_limit_per_user === "number" && Number.isFinite(channel.default_thread_rate_limit_per_user)
        ? Math.max(0, Math.min(21600, Math.floor(channel.default_thread_rate_limit_per_user)))
        : null,
    permissionsSynced: channel.permissions_synced === true,
    hasPermissionOverwrites: Array.isArray(channel.permission_overwrites) && channel.permission_overwrites.length > 0,
    permissionOverwriteCount: Array.isArray(channel.permission_overwrites) ? channel.permission_overwrites.length : 0,
  };
};

const mapRolePermissions = (permissions: bigint) => {
  const allowView = hasPerm(permissions, Other_PERMISSION_FLAGS.VIEW_CHANNEL);
  const allowSend = hasPerm(permissions, Other_PERMISSION_FLAGS.SEND_MESSAGES);
  const allowConnect = hasPerm(permissions, Other_PERMISSION_FLAGS.CONNECT);
  const kickMembers = hasPerm(permissions, Other_PERMISSION_FLAGS.KICK_MEMBERS);
  const banMembers = hasPerm(permissions, Other_PERMISSION_FLAGS.BAN_MEMBERS);
  const manageNicknames = hasPerm(permissions, Other_PERMISSION_FLAGS.MANAGE_NICKNAMES);
  const moderateMembers = hasPerm(permissions, Other_PERMISSION_FLAGS.MODERATE_MEMBERS);

  return {
    allowView,
    allowSend,
    allowConnect,
    manageChannels: hasPerm(permissions, Other_PERMISSION_FLAGS.MANAGE_CHANNELS),
    manageRoles: hasPerm(permissions, Other_PERMISSION_FLAGS.MANAGE_ROLES),
    manageMembers: kickMembers || banMembers || manageNicknames || moderateMembers,
    moderateMembers,
    viewAuditLog: hasPerm(permissions, Other_PERMISSION_FLAGS.VIEW_AUDIT_LOG),
    manageServer: hasPerm(permissions, Other_PERMISSION_FLAGS.MANAGE_GUILD),
    createInstantInvite: hasPerm(permissions, Other_PERMISSION_FLAGS.CREATE_INSTANT_INVITE),
    changeNickname: hasPerm(permissions, Other_PERMISSION_FLAGS.CHANGE_NICKNAME),
    manageNicknames,
    kickMembers,
    banMembers,
    manageEmojisAndStickers: hasPerm(permissions, Other_PERMISSION_FLAGS.MANAGE_EMOJIS_AND_STICKERS),
    manageWebhooks: hasPerm(permissions, Other_PERMISSION_FLAGS.MANAGE_WEBHOOKS),
    manageEvents: hasPerm(permissions, Other_PERMISSION_FLAGS.MANAGE_EVENTS),
    viewServerInsights: false,
    useApplicationCommands: hasPerm(permissions, Other_PERMISSION_FLAGS.USE_APPLICATION_COMMANDS),
    sendMessagesInThreads: hasPerm(permissions, Other_PERMISSION_FLAGS.SEND_MESSAGES_IN_THREADS),
    createPublicThreads: hasPerm(permissions, Other_PERMISSION_FLAGS.CREATE_PUBLIC_THREADS),
    createPrivateThreads: hasPerm(permissions, Other_PERMISSION_FLAGS.CREATE_PRIVATE_THREADS),
    embedLinks: hasPerm(permissions, Other_PERMISSION_FLAGS.EMBED_LINKS),
    attachFiles: hasPerm(permissions, Other_PERMISSION_FLAGS.ATTACH_FILES),
    addReactions: hasPerm(permissions, Other_PERMISSION_FLAGS.ADD_REACTIONS),
    useExternalEmojis: hasPerm(permissions, Other_PERMISSION_FLAGS.USE_EXTERNAL_EMOJIS),
    mentionEveryone: hasPerm(permissions, Other_PERMISSION_FLAGS.MENTION_EVERYONE),
    manageMessages: hasPerm(permissions, Other_PERMISSION_FLAGS.MANAGE_MESSAGES),
    readMessageHistory: hasPerm(permissions, Other_PERMISSION_FLAGS.READ_MESSAGE_HISTORY),
    sendTtsMessages: hasPerm(permissions, Other_PERMISSION_FLAGS.SEND_TTS_MESSAGES),
    speak: hasPerm(permissions, Other_PERMISSION_FLAGS.SPEAK),
    stream: hasPerm(permissions, Other_PERMISSION_FLAGS.STREAM),
    useVoiceActivity: hasPerm(permissions, Other_PERMISSION_FLAGS.USE_VAD),
    prioritySpeaker: hasPerm(permissions, Other_PERMISSION_FLAGS.PRIORITY_SPEAKER),
    muteMembers: hasPerm(permissions, Other_PERMISSION_FLAGS.MUTE_MEMBERS),
    deafenMembers: hasPerm(permissions, Other_PERMISSION_FLAGS.DEAFEN_MEMBERS),
    moveMembers: hasPerm(permissions, Other_PERMISSION_FLAGS.MOVE_MEMBERS),
    requestToSpeak: hasPerm(permissions, Other_PERMISSION_FLAGS.REQUEST_TO_SPEAK),
  };
};

const getAuthorizedOwnerServer = async (serverId: string, profileId: string) => {
  return db.query.server.findFirst({
    where: and(eq(server.id, serverId), eq(server.profileId, profileId)),
    columns: { id: true, name: true },
  });
};

const getOtherBotTokenFromEnv = () => {
  const token = String(process.env.DISCORD_BOT_TOKEN ?? process.env.Other_BOT_TOKEN ?? "").trim();
  if (!token || /^replace_me/i.test(token)) {
    return null;
  }

  return token;
};

const resolveOtherAccessToken = async (ownerProfileId: string, preferredBotId?: string) => {
  const envToken = getOtherBotTokenFromEnv();
  if (envToken) {
    return {
      token: envToken,
      source: "env" as const,
      botName: "DISCORD_BOT_TOKEN",
    };
  }

  const preferences = await getUserPreferences(ownerProfileId);
  const enabledBots = preferences.OtherBots.filter((bot) => bot.enabled);

  const selectedBot = preferredBotId
    ? enabledBots.find((bot) => bot.id === preferredBotId)
    : enabledBots[0];

  if (!selectedBot) {
    throw new Error("NO_Other_IMPORT_BOT_CONFIGURED");
  }

  const decryptedToken = await getDecryptedOtherBotToken(ownerProfileId, selectedBot.id);
  if (!decryptedToken) {
    throw new Error("Other_IMPORT_BOT_TOKEN_MISSING");
  }

  return {
    token: decryptedToken,
    source: "saved-bot" as const,
    botId: selectedBot.id,
    botName: selectedBot.name,
  };
};

const resolveGuildIdFromInvite = async (inviteCode: string) => {
  if (!inviteCode) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(
      `https://discord.com/api/v10/invites/${encodeURIComponent(inviteCode)}?with_counts=false&with_expiration=false&guild_scheduled_event_id=false`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "In-Accord/ServerTemplateImport",
        },
        signal: controller.signal,
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { guild?: { id?: string } };
    return normalizeOtherGuildId(String(payload.guild?.id ?? "")) || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

const fetchOtherGuildStructure = async (guildId: string, token: string) => {

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bot ${token}`,
      "User-Agent": "In-Accord/ServerTemplateImport",
    };

    const [guildResponse, rolesResponse, channelsResponse] = await Promise.all([
      fetch(`https://discord.com/api/v10/guilds/${encodeURIComponent(guildId)}`, {
        method: "GET",
        headers,
        signal: controller.signal,
        cache: "no-store",
      }),
      fetch(`https://discord.com/api/v10/guilds/${encodeURIComponent(guildId)}/roles`, {
        method: "GET",
        headers,
        signal: controller.signal,
        cache: "no-store",
      }),
      fetch(`https://discord.com/api/v10/guilds/${encodeURIComponent(guildId)}/channels`, {
        method: "GET",
        headers,
        signal: controller.signal,
        cache: "no-store",
      }),
    ]);

    if (!guildResponse.ok) {
      const guildError = await guildResponse.text().catch(() => "");
      throw new Error(guildError || `Discord guild fetch failed (${guildResponse.status})`);
    }

    if (!rolesResponse.ok) {
      const roleError = await rolesResponse.text().catch(() => "");
      throw new Error(roleError || `Discord roles fetch failed (${rolesResponse.status})`);
    }

    if (!channelsResponse.ok) {
      const channelError = await channelsResponse.text().catch(() => "");
      throw new Error(channelError || `Discord channels fetch failed (${channelsResponse.status})`);
    }

    const guildData = (await guildResponse.json()) as { id?: string; name?: string };
    const roleData = (await rolesResponse.json()) as OtherTemplateRole[];
    const channelData = (await channelsResponse.json()) as OtherTemplateChannel[];

    return {
      guildId: String(guildData.id ?? guildId),
      guildName: String(guildData.name ?? "Discord Server").trim() || "Discord Server",
      roles: Array.isArray(roleData) ? roleData : [],
      channels: Array.isArray(channelData) ? channelData : [],
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

export async function GET(_req: Request, { params }: Params) {
  try {
    const { serverId: routeServerIdRaw } = await params;
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const serverId = String(routeServerIdRaw ?? "").trim();
    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const ownerServer = await getAuthorizedOwnerServer(serverId, profile.id);
    if (!ownerServer) {
      return new NextResponse("Only the server owner can manage templates", { status: 403 });
    }

    await ensureChannelGroupSchema();
    await ensureServerRolesSchema();

    const groupsResult = await db.execute(sql`
      select
        g."id",
        g."name",
        g."icon",
        g."sortOrder"
      from "ChannelGroup" g
      where g."serverId" = ${serverId}
      order by g."sortOrder" asc, g."createdAt" asc
    `);

    const channelsResult = await db.execute(sql`
      select
        c."id",
        c."name",
        c."type",
        c."channelGroupId",
        c."sortOrder",
        c."isSystem"
      from "Channel" c
      where c."serverId" = ${serverId}
      order by c."sortOrder" asc, c."createdAt" asc
    `);

    const rolesResult = await db.execute(sql`
      select
        r."id",
        r."name",
        r."color",
        r."isMentionable",
        r."position",
        r."isManaged"
      from "ServerRole" r
      where r."serverId" = ${serverId}
      order by r."position" asc, r."createdAt" asc
    `);

    const groups = (groupsResult as unknown as {
      rows: Array<{ id: string; name: string; icon: string | null; sortOrder: number | string | null }>;
    }).rows;

    const channels = (channelsResult as unknown as {
      rows: Array<{
        id: string;
        name: string;
        type: string;
        channelGroupId: string | null;
        sortOrder: number | string | null;
        isSystem: boolean | null;
      }>;
    }).rows;

    const roles = (rolesResult as unknown as {
      rows: Array<{
        id: string;
        name: string;
        color: string;
        isMentionable: boolean;
        position: number | string | null;
        isManaged: boolean;
      }>;
    }).rows;

    const exportTemplate = {
      version: 1,
      source: "in-accord",
      exportedAt: new Date().toISOString(),
      server: {
        id: serverId,
        name: ownerServer.name,
      },
      roles: roles
        .filter((role) => !role.isManaged)
        .map((role) => ({
          name: role.name,
          color: role.color,
          isMentionable: Boolean(role.isMentionable),
          position: Number(role.position ?? 0),
        })),
      channelGroups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        icon: group.icon,
        sortOrder: Number(group.sortOrder ?? 0),
      })),
      channels: channels.map((channel) => ({
        name: channel.name,
        type: channel.type,
        channelGroupId: channel.channelGroupId,
        sortOrder: Number(channel.sortOrder ?? 0),
        isSystem: Boolean(channel.isSystem),
      })),
    };

    return NextResponse.json({
      summary: {
        totalRoles: exportTemplate.roles.length,
        totalChannelGroups: exportTemplate.channelGroups.length,
        totalChannels: exportTemplate.channels.length,
      },
      exportTemplate,
    });
  } catch (error) {
    console.error("[SERVER_TEMPLATE_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { serverId: routeServerIdRaw } = await params;
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const serverId = String(routeServerIdRaw ?? "").trim();
    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const ownerServer = await getAuthorizedOwnerServer(serverId, profile.id);
    if (!ownerServer) {
      return new NextResponse("Only the server owner can import templates", { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as ImportRequestBody;
    const rawTemplateInput = String(body.templateInput ?? "").trim();
    const rawSourceServerInput = String(
      body.sourceServerId ?? body.notInAccordServerId ?? body.OtherServerId ?? ""
    ).trim();
    const preferredBotId = String(body.botId ?? "").trim();

    const autoDetectedServerId = normalizeOtherGuildId(rawTemplateInput);
    const templateCode = normalizeTemplateCode(rawTemplateInput);
    let OtherServerId = normalizeOtherGuildId(rawSourceServerInput) || autoDetectedServerId;
    const inviteCode = normalizeOtherInviteCode(rawTemplateInput);
    const replaceChannels = body.replaceChannels === true;
    const replaceRoles = body.replaceRoles === true;

    if (!templateCode && !OtherServerId && !inviteCode) {
      return new NextResponse("Paste a template URL, invite URL/code, or source server ID", { status: 400 });
    }

    let sourceCode = templateCode;
    let sourceName = "Imported Template";
    let sourceGuildName: string | null = null;
    let sourceType: "template" | "serverId" = "template";
    let templateRoles: OtherTemplateRole[] = [];
    let templateChannels: OtherTemplateChannel[] = [];
    let importBotName: string | null = null;

    if (!OtherServerId && inviteCode) {
      const resolvedGuildId = await resolveGuildIdFromInvite(inviteCode);
      if (resolvedGuildId) {
        OtherServerId = resolvedGuildId;
      }
    }

    if (OtherServerId) {
      sourceType = "serverId";
      sourceCode = OtherServerId;

      const access = await resolveOtherAccessToken(profile.id, preferredBotId || undefined);
      importBotName = access.botName;

      const guildStructure = await fetchOtherGuildStructure(OtherServerId, access.token);
      sourceName = guildStructure.guildName;
      sourceGuildName = guildStructure.guildName;
      templateRoles = guildStructure.roles;
      templateChannels = guildStructure.channels;
    } else {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      let templateData: OtherTemplatePayload;
      try {
        const response = await fetch(`https://discord.com/api/v10/guilds/templates/${encodeURIComponent(templateCode)}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "In-Accord/ServerTemplateImport",
          },
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          const responseText = await response.text().catch(() => "");
          const message = responseText.slice(0, 180) || `Template fetch failed (${response.status})`;
          return new NextResponse(message, { status: response.status === 404 ? 404 : 400 });
        }

        templateData = (await response.json()) as OtherTemplatePayload;
      } finally {
        clearTimeout(timeoutId);
      }

      const guild = templateData.serialized_source_guild;
      if (!guild) {
        return new NextResponse("Template payload is missing source guild data", { status: 400 });
      }

      sourceCode = templateData.code ?? templateCode;
      sourceName = templateData.name ?? guild.name ?? "Imported Template";
      sourceGuildName = guild.name ?? null;
      templateRoles = Array.isArray(guild.roles) ? guild.roles : [];
      templateChannels = Array.isArray(guild.channels) ? guild.channels : [];
    }

    await ensureChannelGroupSchema();
    await ensureServerRolesSchema();
    await ensureSystemChannelSchema();
    await ensureChannelTopicSchema();
    await ensureChannelOtherSettingsSchema();

    const warnings: string[] = [];

    const importResult = await db.transaction(async (tx) => {
      if (replaceChannels) {
        await tx.execute(sql`
          delete from "Message"
          where "channelId" in (
            select c."id"
            from "Channel" c
            where c."serverId" = ${serverId}
              and coalesce(c."isSystem", false) = false
          )
        `);

        await tx.execute(sql`
          delete from "ChannelTopic"
          where "channelId" in (
            select c."id"
            from "Channel" c
            where c."serverId" = ${serverId}
              and coalesce(c."isSystem", false) = false
          )
        `);

        await tx.execute(sql`
          delete from "Channel"
          where "serverId" = ${serverId}
            and coalesce("isSystem", false) = false
        `);

        await tx.execute(sql`
          delete from "ChannelOtherSettings"
          where "serverId" = ${serverId}
        `);

        await tx.execute(sql`
          delete from "ChannelGroup"
          where "serverId" = ${serverId}
        `);
      }

      if (replaceRoles) {
        await tx.execute(sql`
          delete from "ServerRoleAssignment"
          where "serverId" = ${serverId}
            and "roleId" in (
              select r."id"
              from "ServerRole" r
              where r."serverId" = ${serverId}
                and coalesce(r."isManaged", false) = false
            )
        `);

        await tx.execute(sql`
          delete from "ServerRolePermission"
          where "serverId" = ${serverId}
            and "roleId" in (
              select r."id"
              from "ServerRole" r
              where r."serverId" = ${serverId}
                and coalesce(r."isManaged", false) = false
            )
        `);

        await tx.execute(sql`
          delete from "ServerRole"
          where "serverId" = ${serverId}
            and coalesce("isManaged", false) = false
        `);
      }

      const existingRoleNamesResult = await tx.execute(sql`
        select "name" from "ServerRole" where "serverId" = ${serverId}
      `);
      const usedRoleNames = new Set(
        ((existingRoleNamesResult as unknown as { rows: Array<{ name: string | null }> }).rows ?? [])
          .map((row) => String(row.name ?? "").trim().toLowerCase())
          .filter(Boolean)
      );

      const existingGroupNamesResult = await tx.execute(sql`
        select "name" from "ChannelGroup" where "serverId" = ${serverId}
      `);
      const usedGroupNames = new Set(
        ((existingGroupNamesResult as unknown as { rows: Array<{ name: string | null }> }).rows ?? [])
          .map((row) => String(row.name ?? "").trim().toLowerCase())
          .filter(Boolean)
      );

      const existingChannelNamesResult = await tx.execute(sql`
        select "name" from "Channel" where "serverId" = ${serverId}
      `);
      const usedChannelNames = new Set(
        ((existingChannelNamesResult as unknown as { rows: Array<{ name: string | null }> }).rows ?? [])
          .map((row) => String(row.name ?? "").trim().toLowerCase())
          .filter(Boolean)
      );

      const nextRolePositionResult = await tx.execute(sql`
        select coalesce(max("position"), 0)::int as "maxPosition"
        from "ServerRole"
        where "serverId" = ${serverId}
      `);
      let rolePosition =
        Number((nextRolePositionResult as unknown as { rows: Array<{ maxPosition: number | string | null }> }).rows?.[0]?.maxPosition ?? 0);

      let importedRoles = 0;
      const sortedTemplateRoles = [...templateRoles].sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
      for (const templateRole of sortedTemplateRoles) {
        const roleNameRaw = String(templateRole.name ?? "").trim();
        if (!roleNameRaw || roleNameRaw.toLowerCase() === "@everyone" || templateRole.managed === true) {
          continue;
        }

        const roleName = resolveUniqueName(roleNameRaw.slice(0, 100), usedRoleNames, "role");
        rolePosition += 1;
        const roleId = uuidv4();
        const permissionsValue = asBigIntPermissions(templateRole.permissions);
        const mapped = mapRolePermissions(permissionsValue);

        await tx.execute(sql`
          insert into "ServerRole" (
            "id", "serverId", "name", "color", "iconUrl", "isMentionable", "position", "isManaged", "createdAt", "updatedAt"
          )
          values (
            ${roleId},
            ${serverId},
            ${roleName},
            ${colorToHex(typeof templateRole.color === "number" ? templateRole.color : undefined)},
            ${null},
            ${Boolean(templateRole.mentionable ?? true)},
            ${rolePosition},
            false,
            now(),
            now()
          )
        `);

        await tx.execute(sql`
          insert into "ServerRolePermission" (
            "roleId", "serverId", "allowView", "allowSend", "allowConnect", "manageChannels", "manageRoles", "manageMembers", "moderateMembers", "viewAuditLog", "manageServer", "createInstantInvite", "changeNickname", "manageNicknames", "kickMembers", "banMembers", "manageEmojisAndStickers", "manageWebhooks", "manageEvents", "viewServerInsights", "useApplicationCommands", "sendMessagesInThreads", "createPublicThreads", "createPrivateThreads", "embedLinks", "attachFiles", "addReactions", "useExternalEmojis", "mentionEveryone", "manageMessages", "readMessageHistory", "sendTtsMessages", "speak", "stream", "useVoiceActivity", "prioritySpeaker", "muteMembers", "deafenMembers", "moveMembers", "requestToSpeak", "updatedAt"
          )
          values (
            ${roleId},
            ${serverId},
            ${mapped.allowView},
            ${mapped.allowSend},
            ${mapped.allowConnect},
            ${mapped.manageChannels},
            ${mapped.manageRoles},
            ${mapped.manageMembers},
            ${mapped.moderateMembers},
            ${mapped.viewAuditLog},
            ${mapped.manageServer},
            ${mapped.createInstantInvite},
            ${mapped.changeNickname},
            ${mapped.manageNicknames},
            ${mapped.kickMembers},
            ${mapped.banMembers},
            ${mapped.manageEmojisAndStickers},
            ${mapped.manageWebhooks},
            ${mapped.manageEvents},
            ${mapped.viewServerInsights},
            ${mapped.useApplicationCommands},
            ${mapped.sendMessagesInThreads},
            ${mapped.createPublicThreads},
            ${mapped.createPrivateThreads},
            ${mapped.embedLinks},
            ${mapped.attachFiles},
            ${mapped.addReactions},
            ${mapped.useExternalEmojis},
            ${mapped.mentionEveryone},
            ${mapped.manageMessages},
            ${mapped.readMessageHistory},
            ${mapped.sendTtsMessages},
            ${mapped.speak},
            ${mapped.stream},
            ${mapped.useVoiceActivity},
            ${mapped.prioritySpeaker},
            ${mapped.muteMembers},
            ${mapped.deafenMembers},
            ${mapped.moveMembers},
            ${mapped.requestToSpeak},
            now()
          )
        `);

        importedRoles += 1;
      }

      const categories = templateChannels
        .filter((item) => Number(item.type) === 4)
        .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));

      const groupsMaxResult = await tx.execute(sql`
        select coalesce(max("sortOrder"), 0)::int as "maxSortOrder"
        from "ChannelGroup"
        where "serverId" = ${serverId}
      `);
      let groupSort =
        Number((groupsMaxResult as unknown as { rows: Array<{ maxSortOrder: number | string | null }> }).rows?.[0]?.maxSortOrder ?? 0);

      const groupByTemplateCategoryId = new Map<string, string>();
      let importedGroups = 0;
      for (const category of categories) {
        const categoryId = String(category.id ?? "").trim();
        const categoryName = resolveUniqueName(String(category.name ?? "").slice(0, 191), usedGroupNames, "Category");
        const groupId = uuidv4();

        groupSort += 1;
        await tx.execute(sql`
          insert into "ChannelGroup" (
            "id", "name", "icon", "serverId", "profileId", "sortOrder", "createdAt", "updatedAt"
          )
          values (
            ${groupId},
            ${categoryName},
            ${null},
            ${serverId},
            ${profile.id},
            ${groupSort},
            now(),
            now()
          )
        `);

        if (categoryId) {
          groupByTemplateCategoryId.set(categoryId, groupId);
        }

        importedGroups += 1;
      }

      const importableChannels = templateChannels
        .filter((item) => Number(item.type) !== 4)
        .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));

      const channelSortByGroup = new Map<string, number>();
      const uncategorizedKey = "__uncategorized__";
      let importedChannels = 0;
      let skippedChannels = 0;
      let channelsWithOverwrites = 0;

      for (const templateChannel of importableChannels) {
        const OtherType = Number(templateChannel.type);
        const mappedType = mapOtherChannelType(OtherType);

        if (!mappedType) {
          skippedChannels += 1;
          continue;
        }

        const normalizedSettings = normalizeOtherChannelSettings(templateChannel);
        if (normalizedSettings.hasPermissionOverwrites) {
          channelsWithOverwrites += 1;
        }

        const parentTemplateId = String(templateChannel.parent_id ?? "").trim();
        const channelGroupId = parentTemplateId ? groupByTemplateCategoryId.get(parentTemplateId) ?? null : null;
        const groupKey = channelGroupId ?? uncategorizedKey;

        const currentSort = channelSortByGroup.get(groupKey) ?? 0;
        const nextSort = currentSort + 1;
        channelSortByGroup.set(groupKey, nextSort);

        const channelName = resolveUniqueName(String(templateChannel.name ?? "").slice(0, 191), usedChannelNames, "channel");

        const createdChannelId = uuidv4();

        await tx.execute(sql`
          insert into "Channel" (
            "id", "name", "icon", "type", "profileId", "serverId", "channelGroupId", "sortOrder", "createdAt", "updatedAt"
          )
          values (
            ${createdChannelId},
            ${channelName},
            ${null},
            ${mappedType},
            ${profile.id},
            ${serverId},
            ${channelGroupId},
            ${nextSort},
            now(),
            now()
          )
        `);

        await tx.execute(sql`
          insert into "ChannelOtherSettings" (
            "channelId", "serverId", "OtherType", "rawSettingsJson", "createdAt", "updatedAt"
          )
          values (
            ${createdChannelId},
            ${serverId},
            ${OtherType},
            ${JSON.stringify(normalizedSettings)},
            now(),
            now()
          )
          on conflict ("channelId") do update
          set
            "OtherType" = excluded."OtherType",
            "rawSettingsJson" = excluded."rawSettingsJson",
            "updatedAt" = excluded."updatedAt"
        `);

        if (normalizedSettings.topic.length > 0) {
          await tx.execute(sql`
            insert into "ChannelTopic" ("channelId", "serverId", "topic", "createdAt", "updatedAt")
            values (${createdChannelId}, ${serverId}, ${normalizedSettings.topic}, now(), now())
            on conflict ("channelId") do update
            set
              "topic" = excluded."topic",
              "updatedAt" = excluded."updatedAt"
          `);
        }

        importedChannels += 1;
      }

      if (skippedChannels > 0) {
        warnings.push(`${skippedChannels} unsupported source channels were skipped.`);
      }

      if (channelsWithOverwrites > 0) {
        warnings.push(`${channelsWithOverwrites} channel(s) had source permission overwrites. Imported safely with stored compatibility settings; role-level permissions are applied in In-Accord.`);
      }

      return {
        importedRoles,
        importedGroups,
        importedChannels,
      };
    });

    return NextResponse.json({
      ok: true,
      importSource: sourceType,
      importBotName,
      code: sourceCode,
      templateName: sourceName,
      sourceGuildName,
      replaceChannels,
      replaceRoles,
      result: importResult,
      warnings,
    });
  } catch (error) {
    console.error("[SERVER_TEMPLATE_POST]", error);

    const message = error instanceof Error ? error.message : String(error);
    if (/NO_Other_IMPORT_BOT_CONFIGURED/i.test(message)) {
      return new NextResponse(
        "Super-easy setup: add one import bot in Settings > Bot/App Developer (save token once), then import again.",
        { status: 400 }
      );
    }
    if (/Other_IMPORT_BOT_TOKEN_MISSING/i.test(message)) {
      return new NextResponse(
        "Your saved import bot is missing a token. Re-open Bot/App Developer, re-enter the bot token, save, then import again.",
        { status: 400 }
      );
    }
    if (/(DISCORD_BOT_TOKEN|Other_BOT_TOKEN)/i.test(message)) {
      return new NextResponse(
        "Discord server ID import uses the bot token from .env: DISCORD_BOT_TOKEN (legacy: Other_BOT_TOKEN). Set it to a real Discord bot token (not replace_me), restart the app, then invite that bot to the source server.",
        { status: 500 }
      );
    }
    if (/Missing Access|Unknown Guild|Unauthorized|forbidden|403/i.test(message)) {
      return new NextResponse(
        "The bot configured in DISCORD_BOT_TOKEN (or legacy Other_BOT_TOKEN) cannot access that source server. Invite that exact bot to the source server and grant: View Channels, Manage Roles, and Read Message History.",
        { status: 403 }
      );
    }
    if (/abort|timed out/i.test(message)) {
      return new NextResponse("Template request timed out. Please try again.", { status: 504 });
    }

    if (/duplicate key|unique/i.test(message)) {
      return new NextResponse("Template import hit duplicate names. Please retry with replace options enabled.", { status: 409 });
    }

    return new NextResponse("Internal Error", { status: 500 });
  }
}
