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
import { ensureChannelPermissionSchema } from "@/lib/channel-permissions";
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
  botToken?: string;
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

  const directCode = raw.match(/^([A-Za-z0-9_-]{2,128})$/)?.[1];
  if (directCode) {
    return directCode;
  }

  const fromUrl =
    raw.match(/^https?:\/\/(?:www\.)?(?:discord|Other)\.gg\/([A-Za-z0-9_-]{2,128})\/?/i)?.[1] ??
    raw.match(/^https?:\/\/(?:www\.)?(?:discord|Other)(?:app)?\.com\/invite\/([A-Za-z0-9_-]{2,128})\/?/i)?.[1];

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

const normalizeOtherChannelType = (type: number | string | undefined): number | null => {
  if (typeof type === "number" && Number.isFinite(type)) {
    return Math.floor(type);
  }

  const raw = String(type ?? "").trim();
  if (!raw) {
    return null;
  }

  if (/^\d+$/.test(raw)) {
    return Number.parseInt(raw, 10);
  }

  const normalized = raw.toUpperCase();
  const byName: Record<string, number> = {
    GUILD_TEXT: 0,
    GUILD_VOICE: 2,
    GUILD_CATEGORY: 4,
    GUILD_ANNOUNCEMENT: 5,
    GUILD_STAGE_VOICE: 13,
    GUILD_FORUM: 15,
    GUILD_MEDIA: 16,
  };

  return byName[normalized] ?? null;
};

const isOtherCategoryType = (type: number | string | undefined) => normalizeOtherChannelType(type) === 4;

const mapOtherChannelType = (type: number | string | undefined): ChannelType | null => {
  const normalizedType = normalizeOtherChannelType(type);
  if (normalizedType === 0 || normalizedType === 5 || normalizedType === 15 || normalizedType === 16) {
    return ChannelType.TEXT;
  }

  if (normalizedType === 2) {
    return ChannelType.AUDIO;
  }

  if (normalizedType === 13) {
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

const mapOverwritePermission = ({
  allowBits,
  denyBits,
  flag,
}: {
  allowBits: bigint;
  denyBits: bigint;
  flag: bigint;
}) => {
  if (hasPerm(denyBits, flag)) {
    return false;
  }

  if (hasPerm(allowBits, flag)) {
    return true;
  }

  return null;
};

const getAuthorizedOwnerServer = async (serverId: string, profileId: string) => {
  return db.query.server.findFirst({
    where: and(eq(server.id, serverId), eq(server.profileId, profileId)),
    columns: { id: true, name: true },
  });
};

const resolveOtherAccessToken = async (
  ownerProfileId: string,
  preferredBotId?: string,
  oneTimeBotToken?: string
) => {
  const transientToken = String(oneTimeBotToken ?? "").trim();
  if (transientToken && !/^replace_me/i.test(transientToken)) {
    return {
      token: transientToken,
      source: "one-time" as const,
      botName: "One-time token",
    };
  }

  const normalizedPreferredBotId = String(preferredBotId ?? "").trim();
  if (!normalizedPreferredBotId) {
    throw new Error("TEMPLATE_ME_BOT_ID_REQUIRED");
  }

  const preferences = await getUserPreferences(ownerProfileId);
  const selectedBot = preferences.OtherBots.find((bot) => bot.id === normalizedPreferredBotId);

  if (!selectedBot || !selectedBot.enabled) {
    throw new Error("TEMPLATE_ME_BOT_NOT_AVAILABLE");
  }

  const decryptedToken = await getDecryptedOtherBotToken(ownerProfileId, selectedBot.id);
  if (!decryptedToken) {
    throw new Error("TEMPLATE_ME_BOT_TOKEN_MISSING");
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
    const inviteLookups = [
      `https://discord.com/api/v10/invites/${encodeURIComponent(inviteCode)}?with_counts=true&with_expiration=true&guild_scheduled_event_id=false`,
      `https://discord.com/api/v10/invites/${encodeURIComponent(inviteCode)}?with_counts=false&with_expiration=false&guild_scheduled_event_id=false`,
      `https://discord.com/api/v10/invites/${encodeURIComponent(inviteCode)}`,
    ];

    for (const inviteLookupUrl of inviteLookups) {
      const response = await fetch(inviteLookupUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "In-Accord/ServerTemplateImport",
        },
        signal: controller.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as { guild?: { id?: string }; guild_id?: string };
      const guildId =
        normalizeOtherGuildId(String(payload.guild?.id ?? "")) ||
        normalizeOtherGuildId(String(payload.guild_id ?? ""));

      if (guildId) {
        return guildId;
      }
    }

    return null;
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

const resolveSourceGuildIdFromBot = async ({
  token,
  preferredGuildName,
}: {
  token: string;
  preferredGuildName: string;
}) => {
  const discordJs = (await import("discord.js")) as {
    Client: new (options: { intents: number[] }) => {
      once: (event: string, listener: (...args: unknown[]) => void) => void;
      login: (botToken: string) => Promise<string>;
      destroy: () => void;
      guilds?: {
        cache?: Map<string, { id: string; name?: string }>;
      };
    };
    GatewayIntentBits: { Guilds: number };
  };

  const client = new discordJs.Client({
    intents: [discordJs.GatewayIntentBits.Guilds],
  });

  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("SOURCE_GUILD_RESOLVE_TIMEOUT"));
    }, 12000);

    client.once("ready", () => {
      clearTimeout(timeoutId);
      resolve();
    });

    void client.login(token).catch((error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
  });

  try {
    const guilds = Array.from(client.guilds?.cache?.values?.() ?? []);
    if (guilds.length === 0) {
      throw new Error("BOT_HAS_NO_GUILDS");
    }

    const normalizedPreferred = preferredGuildName.trim().toLowerCase();
    const exactMatch = guilds.find((guild) => String(guild.name ?? "").trim().toLowerCase() === normalizedPreferred);
    if (exactMatch?.id) {
      return exactMatch.id;
    }

    if (guilds.length === 1 && guilds[0]?.id) {
      return guilds[0].id;
    }

    const fallback = [...guilds]
      .sort((left, right) => String(left.name ?? "").localeCompare(String(right.name ?? ""), undefined, { sensitivity: "base" }))[0];

    if (!fallback?.id) {
      throw new Error("BOT_GUILD_RESOLVE_FAILED");
    }

    return fallback.id;
  } finally {
    try {
      client.destroy();
    } catch {
      // no-op
    }
  }
};

const fetchOtherGuildWidgetStructure = async (guildId: string) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`https://discord.com/api/v10/guilds/${encodeURIComponent(guildId)}/widget.json`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "In-Accord/ServerTemplateImport",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const widgetError = await response.text().catch(() => "");
      throw new Error(widgetError || `WIDGET_UNAVAILABLE (${response.status})`);
    }

    const payload = (await response.json()) as {
      name?: string;
      channels?: Array<{ id?: string; name?: string; position?: number }>;
    };

    const channels = Array.isArray(payload.channels)
      ? payload.channels
          .map((channel) => ({
            id: typeof channel.id === "string" ? channel.id : undefined,
            type: 0,
            name: typeof channel.name === "string" ? channel.name : undefined,
            position: typeof channel.position === "number" ? channel.position : 0,
          }))
          .filter((channel) => String(channel.name ?? "").trim().length > 0)
      : [];

    if (channels.length === 0) {
      throw new Error("WIDGET_NO_CHANNELS");
    }

    return {
      guildId,
      guildName: String(payload.name ?? "Discord Server").trim() || "Discord Server",
      channels,
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

    const exportedChannelGroups = groups.map((group) => ({
      id: group.id,
      name: group.name,
      icon: group.icon,
      sortOrder: Number(group.sortOrder ?? 0),
    }));

    const usedExportGroupIds = new Set(exportedChannelGroups.map((group) => group.id));
    const autoGroupIdByType = new Map<string, string>();
    const autoGroupLabelByType: Record<string, string> = {
      TEXT: "Text Channels",
      AUDIO: "Audio Channels",
      VIDEO: "Video Channels",
    };
    let nextExportGroupSortOrder =
      exportedChannelGroups.reduce((max, group) => Math.max(max, Number(group.sortOrder ?? 0)), 0) + 1;

    const ensureExportAutoGroupForType = (channelType: string) => {
      const normalizedType = String(channelType ?? "").trim().toUpperCase();
      if (!normalizedType || !autoGroupLabelByType[normalizedType]) {
        return null;
      }

      const existing = autoGroupIdByType.get(normalizedType);
      if (existing) {
        return existing;
      }

      let candidateId = `template-auto-${normalizedType.toLowerCase()}-channels`;
      while (usedExportGroupIds.has(candidateId)) {
        candidateId = `template-auto-${normalizedType.toLowerCase()}-${uuidv4()}`;
      }

      usedExportGroupIds.add(candidateId);
      autoGroupIdByType.set(normalizedType, candidateId);
      exportedChannelGroups.push({
        id: candidateId,
        name: autoGroupLabelByType[normalizedType],
        icon: null,
        sortOrder: nextExportGroupSortOrder,
      });
      nextExportGroupSortOrder += 1;

      return candidateId;
    };

    const exportedChannels = channels.map((item) => {
      const normalizedType = String(item.type ?? "").trim().toUpperCase();
      const resolvedGroupId = item.channelGroupId || ensureExportAutoGroupForType(normalizedType);

      return {
        name: item.name,
        type: item.type,
        channelGroupId: resolvedGroupId ?? null,
        sortOrder: Number(item.sortOrder ?? 0),
        isSystem: Boolean(item.isSystem),
      };
    });

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
      channelGroups: exportedChannelGroups,
      channels: exportedChannels,
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
  let diagnosticSourceServerId = "";
  let diagnosticBotId = "";
  let diagnosticBotName = "";

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
    const rawSourceServerInput = String(
      body.sourceServerId ?? body.notInAccordServerId ?? body.OtherServerId ?? body.templateInput ?? ""
    ).trim();
    const preferredBotId = String(body.botId ?? "").trim();
    const oneTimeBotToken = String(body.botToken ?? "").trim();

    let OtherServerId = normalizeOtherGuildId(rawSourceServerInput);
    const replaceChannels = true;
    const replaceRoles = true;

    let sourceCode = "";
    let sourceName = "Imported Template";
    let sourceGuildName: string | null = null;
    const sourceType: "serverId" = "serverId";
    let templateRoles: OtherTemplateRole[] = [];
    let templateChannels: OtherTemplateChannel[] = [];
    let importBotName: string | null = null;
    const warnings: string[] = [];

    const access = await resolveOtherAccessToken(
      profile.id,
      preferredBotId || undefined,
      oneTimeBotToken || undefined
    );
    importBotName = access.botName;
    diagnosticBotId = String(access.botId ?? preferredBotId ?? "").trim();
    diagnosticBotName = String(access.botName ?? "").trim();

    if (!OtherServerId) {
      return new NextResponse("Source server ID is required for Template Me import.", { status: 400 });
    }

    diagnosticSourceServerId = OtherServerId;

    sourceCode = OtherServerId;

    const guildStructure = await fetchOtherGuildStructure(OtherServerId, access.token);
    sourceName = guildStructure.guildName;
    sourceGuildName = guildStructure.guildName;
    templateRoles = guildStructure.roles;
    templateChannels = guildStructure.channels;

    await ensureChannelGroupSchema();
    await ensureServerRolesSchema();
    await ensureSystemChannelSchema();
    await ensureChannelTopicSchema();
    await ensureChannelOtherSettingsSchema();
    await ensureChannelPermissionSchema();

    const importResult = await db.transaction(async (tx) => {
      if (replaceChannels) {
        await tx.execute(sql`
          delete from "ChannelPermission"
          where "serverId" = ${serverId}
        `);

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

      let importedRoles = 0;
      const roleIdByTemplateRoleId = new Map<string, string>();
      const existingRoleNamesResult = await tx.execute(sql`
        select lower(trim(coalesce("name", ''))) as "normalizedName"
        from "ServerRole"
        where "serverId" = ${serverId}
      `);
      const usedRoleNames = new Set(
        ((existingRoleNamesResult as unknown as { rows?: Array<{ normalizedName?: string | null }> }).rows ?? [])
          .map((row) => String(row.normalizedName ?? "").trim().toLowerCase())
          .filter((name) => name.length > 0)
      );
      const sortedTemplateRoles = [...templateRoles].sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
      for (const templateRole of sortedTemplateRoles) {
        const roleNameRaw = String(templateRole.name ?? "").trim();
        if (!roleNameRaw || roleNameRaw.toLowerCase() === "@everyone" || templateRole.managed === true) {
          continue;
        }

        const roleName = resolveUniqueName(roleNameRaw.slice(0, 100), usedRoleNames, "imported-role").slice(0, 100);
        if (roleName !== roleNameRaw.slice(0, 100)) {
          warnings.push(`Role \"${roleNameRaw.slice(0, 100)}\" already existed and was imported as \"${roleName}\".`);
        }
        const rolePositionValue = Number(templateRole.position ?? importedRoles + 1);
        const rolePosition = Number.isFinite(rolePositionValue)
          ? Math.max(1, Math.floor(rolePositionValue))
          : importedRoles + 1;
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

        const templateRoleId = String(templateRole.id ?? "").trim();
        if (templateRoleId) {
          roleIdByTemplateRoleId.set(templateRoleId, roleId);
        }

        importedRoles += 1;
      }

      const categories = templateChannels
        .filter((item) => isOtherCategoryType(item.type))
        .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));

      const categoryNameById = new Map<string, string>();
      for (const category of categories) {
        const categoryId = String(category.id ?? "").trim();
        if (!categoryId) {
          continue;
        }

        categoryNameById.set(categoryId, String(category.name ?? "").trim().slice(0, 191));
      }

      const existingGroupNamesResult = await tx.execute(sql`
        select lower(trim(coalesce("name", ''))) as "normalizedName"
        from "ChannelGroup"
        where "serverId" = ${serverId}
      `);
      const usedGroupNames = new Set(
        ((existingGroupNamesResult as unknown as { rows?: Array<{ normalizedName?: string | null }> }).rows ?? [])
          .map((row) => String(row.normalizedName ?? "").trim().toLowerCase())
          .filter((name) => name.length > 0)
      );

      const groupByTemplateCategoryId = new Map<string, string>();
      const groupIdByNormalizedName = new Map<string, string>();
      let importedGroups = 0;
      let skippedGroups = 0;
      const maxSortOrderResult = await tx.execute(sql`
        select coalesce(max("sortOrder"), 0) as "maxSortOrder"
        from "ChannelGroup"
        where "serverId" = ${serverId}
      `);
      let maxAssignedGroupSortOrder = Number(
        (
          maxSortOrderResult as unknown as {
            rows?: Array<{ maxSortOrder?: number | string | null }>;
          }
        ).rows?.[0]?.maxSortOrder ?? 0
      );
      for (const category of categories) {
        const categoryId = String(category.id ?? "").trim();
        const categoryNameRaw = String(category.name ?? "").trim().slice(0, 191);
        if (!categoryNameRaw) {
          skippedGroups += 1;
          continue;
        }
        const categoryName = resolveUniqueName(categoryNameRaw, usedGroupNames, "imported-group").slice(0, 191);
        if (categoryName !== categoryNameRaw) {
          warnings.push(`Channel group \"${categoryNameRaw}\" already existed and was imported as \"${categoryName}\".`);
        }
        const groupId = uuidv4();
        const groupSortValue = Number(category.position ?? importedGroups + 1);
        const groupSort = Number.isFinite(groupSortValue)
          ? Math.max(1, Math.floor(groupSortValue))
          : importedGroups + 1;

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

        const normalizedCategoryName = categoryName.trim().toLowerCase();
        if (normalizedCategoryName) {
          groupIdByNormalizedName.set(normalizedCategoryName, groupId);
        }

        maxAssignedGroupSortOrder = Math.max(maxAssignedGroupSortOrder, groupSort);

        importedGroups += 1;
      }

      const autoGroupIdByChannelType = new Map<ChannelType, string>();
      const defaultGroupLabelByType: Record<ChannelType, string> = {
        [ChannelType.TEXT]: "Text Channels",
        [ChannelType.AUDIO]: "Audio Channels",
        [ChannelType.VIDEO]: "Video Channels",
      };

      for (const channelType of [ChannelType.TEXT, ChannelType.AUDIO, ChannelType.VIDEO] as const) {
        const defaultNameKey = defaultGroupLabelByType[channelType].trim().toLowerCase();
        const existingDefaultGroupId = groupIdByNormalizedName.get(defaultNameKey);
        if (existingDefaultGroupId) {
          autoGroupIdByChannelType.set(channelType, existingDefaultGroupId);
        }
      }

      const ensureAutoGroupForChannelType = async (channelType: ChannelType) => {
        const existing = autoGroupIdByChannelType.get(channelType);
        if (existing) {
          return existing;
        }

        const resolvedGroupName = resolveUniqueName(defaultGroupLabelByType[channelType], usedGroupNames, "imported-group").slice(0, 191);
        const resolvedNameKey = resolvedGroupName.trim().toLowerCase();
        const groupId = uuidv4();
        maxAssignedGroupSortOrder += 1;

        await tx.execute(sql`
          insert into "ChannelGroup" (
            "id", "name", "icon", "serverId", "profileId", "sortOrder", "createdAt", "updatedAt"
          )
          values (
            ${groupId},
            ${resolvedGroupName},
            ${null},
            ${serverId},
            ${profile.id},
            ${maxAssignedGroupSortOrder},
            now(),
            now()
          )
        `);

        autoGroupIdByChannelType.set(channelType, groupId);
        if (resolvedNameKey) {
          groupIdByNormalizedName.set(resolvedNameKey, groupId);
        }
        importedGroups += 1;
        return groupId;
      };

      const importableChannels = templateChannels
        .filter((item) => Number(item.type) !== 4)
        .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));

      const existingChannelNamesResult = await tx.execute(sql`
        select lower(trim(coalesce("name", ''))) as "normalizedName"
        from "Channel"
        where "serverId" = ${serverId}
      `);
      const usedChannelNames = new Set(
        ((existingChannelNamesResult as unknown as { rows?: Array<{ normalizedName?: string | null }> }).rows ?? [])
          .map((row) => String(row.normalizedName ?? "").trim().toLowerCase())
          .filter((name) => name.length > 0)
      );

      const channelSortByGroup = new Map<string, number>();
      const uncategorizedKey = "__uncategorized__";
      let importedChannels = 0;
      let skippedChannels = 0;
      let channelsWithMissingParentGroup = 0;
      let channelsWithOverwrites = 0;
      let importedChannelOverwrites = 0;

      for (const templateChannel of importableChannels) {
        const OtherType = normalizeOtherChannelType(templateChannel.type) ?? -1;
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
        let channelGroupId = parentTemplateId ? groupByTemplateCategoryId.get(parentTemplateId) ?? null : null;
        if (parentTemplateId && !channelGroupId) {
          const parentCategoryName = categoryNameById.get(parentTemplateId);
          if (parentCategoryName) {
            channelGroupId = groupIdByNormalizedName.get(parentCategoryName.trim().toLowerCase()) ?? null;
          }
        }
        if (parentTemplateId && !channelGroupId) {
          channelsWithMissingParentGroup += 1;
        }

        if (!channelGroupId) {
          channelGroupId = await ensureAutoGroupForChannelType(mappedType);
        }

        const groupKey = channelGroupId ?? uncategorizedKey;

        const channelNameRaw = String(templateChannel.name ?? "").trim().slice(0, 191);
        if (!channelNameRaw) {
          skippedChannels += 1;
          continue;
        }
        const channelName = resolveUniqueName(channelNameRaw, usedChannelNames, "imported-channel").slice(0, 191);
        if (channelName !== channelNameRaw) {
          warnings.push(`Channel \"${channelNameRaw}\" already existed and was imported as \"${channelName}\".`);
        }

        const isGeneralChannel = channelNameRaw.trim().toLowerCase() === "general";
        let nextSort = 1;

        if (isGeneralChannel) {
          await tx.execute(sql`
            update "Channel" c
            set
              "sortOrder" = coalesce(c."sortOrder", 0) + 1,
              "updatedAt" = now()
            where c."serverId" = ${serverId}
              and c."channelGroupId" is not distinct from ${channelGroupId}
          `);

          const bumpedCurrentSort = (channelSortByGroup.get(groupKey) ?? 0) + 1;
          channelSortByGroup.set(groupKey, bumpedCurrentSort);
        } else {
          const currentSort = channelSortByGroup.get(groupKey) ?? 0;
          nextSort = currentSort + 1;
          channelSortByGroup.set(groupKey, nextSort);
        }

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

        const sourceOverwrites = Array.isArray(templateChannel.permission_overwrites)
          ? (templateChannel.permission_overwrites as Array<{
              id?: string;
              type?: number | string;
              allow?: string | number;
              deny?: string | number;
            }>)
          : [];

        for (const overwrite of sourceOverwrites) {
          const overwriteType = Number(overwrite.type ?? 0);
          if (!Number.isFinite(overwriteType) || overwriteType !== 0) {
            continue;
          }

          const sourceTargetId = String(overwrite.id ?? "").trim();
          if (!sourceTargetId) {
            continue;
          }

          const allowBits = asBigIntPermissions(overwrite.allow);
          const denyBits = asBigIntPermissions(overwrite.deny);

          let targetType: "EVERYONE" | "ROLE";
          let targetId: string;

          if (sourceTargetId === OtherServerId) {
            targetType = "EVERYONE";
            targetId = "EVERYONE";
          } else {
            const mappedRoleId = roleIdByTemplateRoleId.get(sourceTargetId);
            if (!mappedRoleId) {
              continue;
            }

            targetType = "ROLE";
            targetId = mappedRoleId;
          }

          const allowView = mapOverwritePermission({
            allowBits,
            denyBits,
            flag: Other_PERMISSION_FLAGS.VIEW_CHANNEL,
          });
          const allowSend = mapOverwritePermission({
            allowBits,
            denyBits,
            flag: Other_PERMISSION_FLAGS.SEND_MESSAGES,
          });
          const allowConnect = mapOverwritePermission({
            allowBits,
            denyBits,
            flag: Other_PERMISSION_FLAGS.CONNECT,
          });

          await tx.execute(sql`
            insert into "ChannelPermission" (
              "id", "serverId", "channelId", "targetType", "targetId", "allowView", "allowSend", "allowConnect", "createdAt", "updatedAt"
            )
            values (
              ${uuidv4()},
              ${serverId},
              ${createdChannelId},
              ${targetType},
              ${targetId},
              ${allowView},
              ${allowSend},
              ${allowConnect},
              now(),
              now()
            )
            on conflict ("channelId", "targetType", "targetId")
            do update set
              "allowView" = excluded."allowView",
              "allowSend" = excluded."allowSend",
              "allowConnect" = excluded."allowConnect",
              "updatedAt" = excluded."updatedAt"
          `);

          importedChannelOverwrites += 1;
        }

        importedChannels += 1;
      }

      if (skippedGroups > 0) {
        warnings.push(`${skippedGroups} source channel group(s) with missing names were skipped.`);
      }

      if (skippedChannels > 0) {
        warnings.push(`${skippedChannels} unsupported source channels were skipped.`);
      }

      if (channelsWithMissingParentGroup > 0) {
        warnings.push(`${channelsWithMissingParentGroup} channel(s) referenced parent groups that were unavailable and were mapped to default channel groups.`);
      }

      if (channelsWithOverwrites > 0) {
        warnings.push(`${channelsWithOverwrites} channel(s) included source permission overwrites. Synced ${importedChannelOverwrites} overwrite rule(s) into channel permissions.`);
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
    if (/TEMPLATE_ME_BOT_ID_REQUIRED/i.test(message)) {
      return new NextResponse(
        "Template Me bot selection is required. Pick your bot explicitly, then retry import.",
        { status: 400 }
      );
    }
    if (/TEMPLATE_ME_BOT_NOT_AVAILABLE/i.test(message)) {
      return new NextResponse(
        "Selected Template Me bot is not available or disabled. Re-select an enabled bot in Server Template admin menu.",
        { status: 400 }
      );
    }

    if (/TEMPLATE_ME_BOT_TOKEN_MISSING/i.test(message)) {
      return new NextResponse(
        "Selected Template Me bot is missing its token. Update that bot in Settings > Bot/App Developer, then retry import.",
        { status: 400 }
      );
    }
    if (/Missing BOT_TOKEN_ENCRYPTION_KEY|SESSION_SECRET for bot token encryption/i.test(message)) {
      return new NextResponse(
        "Bot token decryption is not configured on this runtime (missing BOT_TOKEN_ENCRYPTION_KEY or SESSION_SECRET).",
        { status: 500 }
      );
    }
    if (/Invalid encrypted bot token payload/i.test(message)) {
      return new NextResponse(
        "Stored Template Me bot token payload is invalid/corrupted. Re-save the bot token in Settings > Bot/App Developer.",
        { status: 400 }
      );
    }

    if (/NO_Other_IMPORT_BOT_CONFIGURED/i.test(message)) {
      return new NextResponse(
        "No usable Template Me bot is configured for this account. Configure Template Me Bot token first.",
        { status: 400 }
      );
    }
    if (/Other_IMPORT_BOT_TOKEN_MISSING/i.test(message)) {
      return new NextResponse(
        "Template Me bot token is missing. Save a valid token and retry import.",
        { status: 400 }
      );
    }
    if (/(DISCORD_BOT_TOKEN|Other_BOT_TOKEN)/i.test(message)) {
      return new NextResponse(
        "Template Me bot token is invalid or unavailable. Update token and retry import.",
        { status: 400 }
      );
    }
    if (/Missing Access|Missing Permissions|Unknown Guild|Unauthorized|forbidden|403|50001|50013|10004/i.test(message)) {
      const botLabel = diagnosticBotName || "Template Me bot";
      const sourceLabel = diagnosticSourceServerId || "(unknown source server)";
      const botIdHint = diagnosticBotId ? ` [botId: ${diagnosticBotId}]` : "";
      return new NextResponse(
        `${botLabel} cannot access source server ID ${sourceLabel}.${botIdHint} Ensure THIS same bot is invited to that source server (not a different bot token).`,
        { status: 400 }
      );
    }
    if (/BOT_HAS_NO_GUILDS/i.test(message)) {
      return new NextResponse("Template Me bot is not in any Discord servers yet.", { status: 400 });
    }
    if (/SOURCE_GUILD_RESOLVE_TIMEOUT/i.test(message)) {
      return new NextResponse("Timed out while resolving bot source server. Try again.", { status: 504 });
    }
    if (/BOT_GUILD_RESOLVE_FAILED/i.test(message)) {
      return new NextResponse("Unable to resolve a source server from Template Me bot.", { status: 400 });
    }
    if (/Source server ID is required/i.test(message)) {
      return new NextResponse("Source server ID is required for Template Me import.", { status: 400 });
    }
    if (/invalid token|token was provided|TOKEN_INVALID|401\s*:\s*Unauthorized/i.test(message)) {
      return new NextResponse("Template Me bot token is invalid. Update token and retry import.", { status: 400 });
    }
    if (/Cannot find package 'discord\.js'|Cannot find module 'discord\.js'/i.test(message)) {
      return new NextResponse("Template Me import dependency is missing on server runtime (discord.js).", { status: 500 });
    }
    if (/SOURCE_CHANNEL_GROUP_NAME_MISSING|SOURCE_CHANNEL_NAME_MISSING/i.test(message)) {
      return new NextResponse("Source server contains invalid channel data (missing names).", { status: 400 });
    }
    if (/column .* does not exist|relation .* does not exist/i.test(message)) {
      return new NextResponse("Template import schema is out of date. Run latest database migrations and retry.", { status: 500 });
    }
    if (/abort|timed out/i.test(message)) {
      return new NextResponse("Template request timed out. Please try again.", { status: 504 });
    }

    if (/duplicate key|unique/i.test(message)) {
      return new NextResponse("Strict sync aborted: source data contains conflicting duplicate names that cannot be mapped uniquely.", { status: 409 });
    }

    return NextResponse.json(
      {
        error: "Template import failed",
        details: message,
        sourceServerId: diagnosticSourceServerId || null,
        botId: diagnosticBotId || null,
        botName: diagnosticBotName || null,
      },
      { status: 500 }
    );
  }
}
