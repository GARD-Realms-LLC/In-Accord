import { NextResponse } from "next/server";
import { MemberRole } from "@/lib/db";
import { and, eq, inArray, sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { channel, db, member, server } from "@/lib/db";
import { ensureChannelGroupSchema } from "@/lib/channel-groups";
import { ensureChannelOtherSettingsSchema } from "@/lib/channel-other-settings";
import { ensureChannelTopicSchema } from "@/lib/channel-topic";
import { ensureSystemChannelSchema } from "@/lib/system-channels";

const VALID_CHANNEL_TYPES = new Set(["TEXT", "AUDIO", "VIDEO"]);

const resolveAllowedChannelTypes = async () => {
  const result = await db.execute(sql`
    select e.enumlabel as "label"
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'ChannelType'
    order by e.enumsortorder asc
  `);

  const labels = ((result as unknown as { rows?: Array<{ label: string | null }> }).rows ?? [])
    .map((row) => String(row.label ?? "").trim().toUpperCase())
    .filter(Boolean);

  return labels.length ? new Set(labels) : VALID_CHANNEL_TYPES;
};

const mapChannelMutationError = (error: unknown, fallbackText: string) => {
  const message = error instanceof Error ? error.message : String(error);

  if (/duplicate key|Channel_unique_name_per_server/i.test(message)) {
    return { status: 409, text: "Channel name already exists in this server" };
  }

  if (/invalid input value for enum|ChannelType/i.test(message)) {
    return { status: 400, text: "This channel type is not enabled in the database yet" };
  }

  if (/null value in column|not-null constraint/i.test(message)) {
    return { status: 400, text: "Missing required channel fields" };
  }

  if (/column .* does not exist|relation .* does not exist/i.test(message)) {
    return { status: 500, text: "Channel database schema is out of date. Please restart the app and try again." };
  }

  if (/permission denied/i.test(message)) {
    return { status: 403, text: "Database permission denied while updating channel" };
  }

  return { status: 500, text: fallbackText };
};

type ChannelSettingsPayload = {
  nsfw?: unknown;
  rateLimitPerUser?: unknown;
  bitrate?: unknown;
  userLimit?: unknown;
  rtcRegion?: unknown;
  videoQualityMode?: unknown;
  defaultAutoArchiveDuration?: unknown;
  defaultThreadRateLimitPerUser?: unknown;
};

const toBoundedInteger = (value: unknown, min: number, max: number, fallback: number) => {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;

  if (!Number.isFinite(n)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.floor(n)));
};

const toNullableBoundedInteger = (value: unknown, min: number, max: number) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string" && value.trim().length === 0) {
    return null;
  }

  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;

  if (!Number.isFinite(n)) {
    return null;
  }

  return Math.max(min, Math.min(max, Math.floor(n)));
};

const toNullableText = (value: unknown, maxLength: number) => {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, maxLength);
};

const normalizeChannelSettingsPayload = (settings: ChannelSettingsPayload | null | undefined) => {
  return {
    nsfw: settings?.nsfw === true,
    rateLimitPerUser: toBoundedInteger(settings?.rateLimitPerUser, 0, 21600, 0),
    bitrate: toNullableBoundedInteger(settings?.bitrate, 8000, 384000),
    userLimit: toNullableBoundedInteger(settings?.userLimit, 0, 99),
    rtcRegion: toNullableText(settings?.rtcRegion, 64),
    videoQualityMode: toNullableBoundedInteger(settings?.videoQualityMode, 1, 2),
    defaultAutoArchiveDuration: toNullableBoundedInteger(settings?.defaultAutoArchiveDuration, 60, 10080),
    defaultThreadRateLimitPerUser: toNullableBoundedInteger(settings?.defaultThreadRateLimitPerUser, 0, 21600),
  };
};

const parseStoredChannelSettings = (rawSettingsJson: string | null | undefined) => {
  if (!rawSettingsJson || typeof rawSettingsJson !== "string") {
    return normalizeChannelSettingsPayload(null);
  }

  try {
    const parsed = JSON.parse(rawSettingsJson) as ChannelSettingsPayload;
    return normalizeChannelSettingsPayload(parsed);
  } catch {
    return normalizeChannelSettingsPayload(null);
  }
};

const parseStoredSettingsObject = (rawSettingsJson: string | null | undefined) => {
  if (!rawSettingsJson || typeof rawSettingsJson !== "string") {
    return {} as Record<string, unknown>;
  }

  try {
    const parsed = JSON.parse(rawSettingsJson) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {} as Record<string, unknown>;
  }
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const { channelId } = await params;

    const profile = await currentProfile();
    const { searchParams } = new URL(req.url);
    const serverId = searchParams.get("serverId");

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    if (!channelId) {
      return new NextResponse("Channel ID missing", { status: 400 });
    }

    await ensureChannelTopicSchema();
    await ensureChannelOtherSettingsSchema();

    const membership = await db.query.member.findFirst({
      where: and(eq(member.serverId, serverId), eq(member.profileId, profile.id)),
      columns: { id: true },
    });

    const isServerOwner = await db.query.server.findFirst({
      where: and(eq(server.id, serverId), eq(server.profileId, profile.id)),
      columns: { id: true },
    });

    if (!membership && !isServerOwner) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const channelResult = await db.execute(sql`
      select
        c."id",
        c."name",
        c."type",
        c."icon",
        c."channelGroupId",
        ct."topic"
      from "Channel" c
      left join "ChannelTopic" ct on ct."channelId" = c."id"
      where c."id" = ${channelId}
        and c."serverId" = ${serverId}
      limit 1
    `);

    const existingChannel = (channelResult as unknown as {
      rows?: Array<{
        id: string;
        name: string;
        type: string;
        icon: string | null;
        channelGroupId: string | null;
        topic: string | null;
      }>;
    }).rows?.[0];

    if (!existingChannel) {
      return new NextResponse("Channel not found", { status: 404 });
    }

    const settingsResult = await db.execute(sql`
      select "rawSettingsJson"
      from "ChannelOtherSettings"
      where "channelId" = ${channelId}
        and "serverId" = ${serverId}
      limit 1
    `);

    const settingsRow = (settingsResult as unknown as {
      rows?: Array<{ rawSettingsJson: string | null }>;
    }).rows?.[0];

    return NextResponse.json({
      channel: {
        id: existingChannel.id,
        name: existingChannel.name,
        type: existingChannel.type,
        icon: existingChannel.icon,
        topic: existingChannel.topic ?? "",
        channelGroupId: existingChannel.channelGroupId,
        settings: parseStoredChannelSettings(settingsRow?.rawSettingsJson),
      },
    });
  } catch (error) {
    console.log("[CHANNEL_ID_GET]", error);
    const mapped = mapChannelMutationError(error, "Unable to load channel right now. Please try again.");
    return new NextResponse(mapped.text, { status: mapped.status });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const { channelId } = await params;

    const profile = await currentProfile();
    const { searchParams } = new URL(req.url);

    const serverId = searchParams.get("serverId");

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    if (!channelId) {
      return new NextResponse("Channel ID missing", { status: 400 });
    }

    const isServerOwner = await db.query.server.findFirst({
      where: and(eq(server.id, serverId), eq(server.profileId, profile.id)),
      columns: { id: true },
    });

    const authorizedMember = await db.query.member.findFirst({
      where: and(
        eq(member.serverId, serverId),
        eq(member.profileId, profile.id),
        inArray(member.role, [MemberRole.ADMIN, MemberRole.MODERATOR])
      ),
    });

    if (!isServerOwner && !authorizedMember) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await ensureSystemChannelSchema();

    const systemChannelResult = await db.execute(sql`
      select "id"
      from "Channel"
      where "id" = ${channelId}
        and "serverId" = ${serverId}
        and "isSystem" = true
      limit 1
    `);

    const systemChannelId = (systemChannelResult as unknown as {
      rows: Array<{ id: string }>;
    }).rows?.[0]?.id;

    if (systemChannelId) {
      return new NextResponse("System channels cannot be deleted", { status: 400 });
    }

    await db.transaction(async (tx) => {
      await ensureChannelTopicSchema();
      await ensureChannelOtherSettingsSchema();

      await tx.execute(sql`
        delete from "Message"
        where "channelId" = ${channelId}
      `);

      await tx.execute(sql`
        delete from "ChannelTopic"
        where "channelId" = ${channelId}
      `);

      await tx.execute(sql`
        delete from "ChannelOtherSettings"
        where "channelId" = ${channelId}
      `);

      await tx.delete(channel).where(
        and(
          eq(channel.id, channelId),
          eq(channel.serverId, serverId)
        )
      );
    });

    const currentServer = await db.query.server.findFirst({
      where: eq(server.id, serverId),
    });

    return NextResponse.json(currentServer);
  } catch (error) {
    console.log("[CHANNEL_ID_DELETE]", error);

    const message = error instanceof Error ? error.message : String(error);
    if (/foreign key|violates/i.test(message)) {
      return new NextResponse("Unable to delete channel because dependent records still exist", { status: 409 });
    }

    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const { channelId } = await params;

    const profile = await currentProfile();
    const body = (await req.json()) as {
      name?: unknown;
      type?: unknown;
      channelGroupId?: unknown;
      topic?: unknown;
      icon?: unknown;
      settings?: ChannelSettingsPayload;
    };
    const { name, type, channelGroupId, topic, icon, settings } = body;
    const { searchParams } = new URL(req.url);

    const serverId = searchParams.get("serverId");

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    if (!channelId) {
      return new NextResponse("Channel ID missing", { status: 400 });
    }

    await ensureChannelGroupSchema();
    await ensureChannelTopicSchema();
    await ensureChannelOtherSettingsSchema();

    const isServerOwner = await db.query.server.findFirst({
      where: and(eq(server.id, serverId), eq(server.profileId, profile.id)),
      columns: { id: true },
    });

    const authorizedMember = await db.query.member.findFirst({
      where: and(
        eq(member.serverId, serverId),
        eq(member.profileId, profile.id),
        inArray(member.role, [MemberRole.ADMIN, MemberRole.MODERATOR])
      ),
    });

    if (!isServerOwner && !authorizedMember) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const existingChannelResult = await db.execute(sql`
      select "id", "name"
      from "Channel"
      where "id" = ${channelId}
        and "serverId" = ${serverId}
      limit 1
    `);

    const existingChannel = (existingChannelResult as unknown as {
      rows: Array<{ id: string; name: string }>;
    }).rows?.[0];

    if (!existingChannel) {
      return new NextResponse("Channel not found", { status: 404 });
    }

    const normalizedGroupId =
      typeof channelGroupId === "string" && channelGroupId.trim().length > 0
        ? channelGroupId.trim()
        : null;

    const incomingName = String(name ?? "").trim();
    const nextName = incomingName;
    const nextType = typeof type === "string" ? type.trim().toUpperCase() : "";
    const nextTopic = typeof topic === "string" ? topic.trim() : "";
    const nextIcon =
      typeof icon === "string" && icon.trim().length > 0
        ? icon.trim().slice(0, 16)
        : null;

    if (!nextName) {
      return new NextResponse("Name is required", { status: 400 });
    }

    const allowedChannelTypes = await resolveAllowedChannelTypes();
    if (!allowedChannelTypes.has(nextType)) {
      return new NextResponse("Invalid channel type", { status: 400 });
    }

    if (normalizedGroupId) {
      const groupResult = await db.execute(sql`
        select "id"
        from "ChannelGroup"
        where "id" = ${normalizedGroupId}
          and "serverId" = ${serverId}
        limit 1
      `);

      const groupExists = (groupResult as unknown as { rows: Array<{ id: string }> }).rows?.[0];
      if (!groupExists) {
        return new NextResponse("Channel group not found", { status: 404 });
      }
    }

    const duplicateNameResult = await db.execute(sql`
      select "id"
      from "Channel"
      where "serverId" = ${serverId}
        and "id" <> ${channelId}
        and lower(trim(coalesce("name", ''))) = lower(trim(${nextName}))
      limit 1
    `);

    const duplicateNameExists = (duplicateNameResult as unknown as { rows?: Array<{ id: string }> }).rows?.[0];
    if (duplicateNameExists) {
      return new NextResponse("Channel name already exists in this server", { status: 409 });
    }

    if (nextTopic.length > 500) {
      return new NextResponse("Channel topic must be 500 characters or fewer", { status: 400 });
    }

    const existingSettingsResult = await db.execute(sql`
      select "rawSettingsJson"
      from "ChannelOtherSettings"
      where "channelId" = ${channelId}
        and "serverId" = ${serverId}
      limit 1
    `);

    const existingSettingsRow = (existingSettingsResult as unknown as {
      rows?: Array<{ rawSettingsJson: string | null }>;
    }).rows?.[0];

    const normalizedSettings =
      settings && typeof settings === "object"
        ? normalizeChannelSettingsPayload(settings)
        : parseStoredChannelSettings(existingSettingsRow?.rawSettingsJson);

    const existingSettingsObject = parseStoredSettingsObject(existingSettingsRow?.rawSettingsJson);
    const mergedSettings = {
      ...existingSettingsObject,
      ...normalizedSettings,
    };

    await db.execute(sql`
      update "Channel"
      set
        "name" = ${nextName},
        "type" = ${nextType},
        "channelGroupId" = ${normalizedGroupId},
        "icon" = ${nextIcon},
        "updatedAt" = ${new Date()}
      where "id" = ${channelId}
        and "serverId" = ${serverId}
    `);

    await db.execute(sql`
      insert into "ChannelTopic" ("channelId", "serverId", "topic", "createdAt", "updatedAt")
      values (${channelId}, ${serverId}, ${nextTopic || null}, now(), now())
      on conflict ("channelId") do update
      set
        "topic" = excluded."topic",
        "serverId" = excluded."serverId",
        "updatedAt" = now()
    `);

    await db.execute(sql`
      insert into "ChannelOtherSettings" (
        "channelId", "serverId", "OtherType", "rawSettingsJson", "createdAt", "updatedAt"
      )
      values (
        ${channelId},
        ${serverId},
        ${null},
        ${JSON.stringify(mergedSettings)},
        now(),
        now()
      )
      on conflict ("channelId") do update
      set
        "serverId" = excluded."serverId",
        "rawSettingsJson" = excluded."rawSettingsJson",
        "updatedAt" = excluded."updatedAt"
    `);

    const currentServer = await db.query.server.findFirst({
      where: eq(server.id, serverId),
    });

    return NextResponse.json(currentServer);
  } catch (error) {
    console.log("[CHANNEL_ID_PATCH]", error);
    const mapped = mapChannelMutationError(error, "Unable to update channel right now. Please try again.");
    return new NextResponse(mapped.text, { status: mapped.status });
  }
}
