import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { channel, db, MemberRole, member, server } from "@/lib/db";
import { ensureChannelGroupSchema } from "@/lib/channel-groups";

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

const mapChannelMutationError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  if (/ChannelGroup_unique_name_per_server/i.test(message)) {
    return {
      status: 409,
      text: "Channel groups contain duplicate names. Channel names can match group names, but duplicate group names must be fixed first.",
    };
  }

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
    return { status: 403, text: "Database permission denied while creating channel" };
  }

  return { status: 500, text: "Unable to create channel right now. Please try again." };
};

export async function GET(req: Request) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const serverId = String(searchParams.get("serverId") ?? "").trim();

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const ownerServer = await db.query.server.findFirst({
      where: and(eq(server.id, serverId), eq(server.profileId, profile.id)),
      columns: { id: true },
    });

    const membership = await db.query.member.findFirst({
      where: and(eq(member.serverId, serverId), eq(member.profileId, profile.id)),
      columns: { id: true },
    });

    if (!ownerServer && !membership) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const channels = await db.query.channel.findMany({
      where: eq(channel.serverId, serverId),
      columns: {
        id: true,
        name: true,
        type: true,
      },
    });

    const ordered = [...channels].sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      channels: ordered,
    });
  } catch (error) {
    console.log("[CHANNEL_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const profile = await currentProfile();
    const body = (await req.json()) as {
      name?: unknown;
      type?: unknown;
      channelGroupId?: unknown;
      icon?: unknown;
    };
    const { name, type, channelGroupId, icon } = body;
    const { searchParams } = new URL(req.url);

    const serverId = searchParams.get("serverId");

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const normalizedName = typeof name === "string" ? name.trim() : "";
    if (!normalizedName) {
      return new NextResponse("Channel name is required", { status: 400 });
    }

    const normalizedType = typeof type === "string" ? type.trim().toUpperCase() : "";
    const allowedChannelTypes = await resolveAllowedChannelTypes();
    if (!allowedChannelTypes.has(normalizedType)) {
      return new NextResponse("Invalid channel type", { status: 400 });
    }

    if (normalizedName.toLowerCase() === "general") {
      return new NextResponse("Name cannot be 'general'", { status: 400 })
    }

    await ensureChannelGroupSchema();

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

    const now = new Date();
    const id = uuidv4();

    const duplicateNameResult = await db.execute(sql`
      select "id"
      from "Channel"
      where "serverId" = ${serverId}
        and lower(trim(coalesce("name", ''))) = lower(trim(${normalizedName}))
      limit 1
    `);

    const duplicateNameExists = (duplicateNameResult as unknown as { rows?: Array<{ id: string }> }).rows?.[0];
    if (duplicateNameExists) {
      return new NextResponse("Channel name already exists in this server", { status: 409 });
    }

    // Intentionally allowed: channel name may match a channel-group name.
    await db.execute(sql`
      select "id"
      from "ChannelGroup"
      where "serverId" = ${serverId}
        and lower(trim(coalesce("name", ''))) = lower(trim(${normalizedName}))
      limit 1
    `);

    const normalizedGroupId =
      typeof channelGroupId === "string" && channelGroupId.trim().length > 0
        ? channelGroupId.trim()
        : null;
    const normalizedIcon =
      typeof icon === "string" && icon.trim().length > 0
        ? icon.trim().slice(0, 16)
        : null;

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

    const maxSortOrderResult = await db.execute(sql`
      select coalesce(max(c."sortOrder"), 0) as "maxSortOrder"
      from "Channel" c
      where c."serverId" = ${serverId}
        and c."channelGroupId" is not distinct from ${normalizedGroupId}
    `);

    const nextSortOrder =
      Number(
        (
          maxSortOrderResult as unknown as {
            rows: Array<{ maxSortOrder: number | string | null }>;
          }
        ).rows?.[0]?.maxSortOrder ?? 0
      ) + 1;

    await db.execute(sql`
      insert into "Channel" (
        "id",
        "name",
        "type",
        "profileId",
        "serverId",
        "channelGroupId",
        "icon",
        "sortOrder",
        "createdAt",
        "updatedAt"
      )
      values (
        ${id},
        ${normalizedName},
        ${normalizedType},
        ${profile.id},
        ${serverId},
        ${normalizedGroupId},
        ${normalizedIcon},
        ${nextSortOrder},
        ${now},
        ${now}
      )
    `);

    const updatedServer = await db.query.server.findFirst({
      where: eq(server.id, serverId),
      with: {
        channels: true,
      },
    });

    return NextResponse.json({
      server: updatedServer,
      channel: {
        id,
        name: normalizedName,
        icon: normalizedIcon,
        type: normalizedType,
        serverId,
        channelGroupId: normalizedGroupId,
      },
    })

  } catch (error) {
    console.log("[CHANNEL_POST]", error);
    const mapped = mapChannelMutationError(error);
    return new NextResponse(mapped.text, { status: mapped.status });
  }
}