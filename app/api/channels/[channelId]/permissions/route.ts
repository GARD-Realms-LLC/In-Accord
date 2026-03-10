import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { channel, db, member } from "@/lib/db";
import { MemberRole } from "@/lib/db/types";
import {
  ensureChannelPermissionSchema,
  resolveMemberContext,
} from "@/lib/channel-permissions";

type Params = {
  params: Promise<{
    channelId: string;
  }>;
};

export async function GET(req: Request, { params }: Params) {
  try {
    const { channelId: rawChannelId } = await params;

    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const serverId = String(searchParams.get("serverId") ?? "").trim();
    const channelId = String(rawChannelId ?? "").trim();

    if (!serverId || !channelId) {
      return new NextResponse("Server ID and channel ID are required", { status: 400 });
    }

    const currentMember = await db.query.member.findFirst({
      where: and(eq(member.serverId, serverId), eq(member.profileId, profile.id)),
      columns: { id: true },
    });

    if (!currentMember) {
      return new NextResponse("Member not found", { status: 404 });
    }

    const existingChannel = await db.query.channel.findFirst({
      where: and(eq(channel.id, channelId), eq(channel.serverId, serverId)),
      columns: { id: true },
    });

    if (!existingChannel) {
      return new NextResponse("Channel not found", { status: 404 });
    }

    await ensureChannelPermissionSchema();

    const roleRowsResult = await db.execute(sql`
      select "id", "name"
      from "ServerRole"
      where "serverId" = ${serverId}
        and coalesce("isManaged", false) = false
      order by "position" asc, "name" asc
    `);

    const roleRows = (roleRowsResult as unknown as {
      rows?: Array<{ id: string; name: string }>;
    }).rows ?? [];

    const overwriteRowsResult = await db.execute(sql`
      select "targetType", "targetId", "allowView", "allowSend", "allowConnect"
      from "ChannelPermission"
      where "serverId" = ${serverId}
        and "channelId" = ${channelId}
        and "targetType" in ('EVERYONE','ROLE')
    `);

    const overwriteRows = (overwriteRowsResult as unknown as {
      rows?: Array<{
        targetType: "EVERYONE" | "ROLE";
        targetId: string;
        allowView: boolean | null;
        allowSend: boolean | null;
        allowConnect: boolean | null;
      }>;
    }).rows ?? [];

    const overwriteMap = new Map<string, { allowView: boolean | null; allowSend: boolean | null; allowConnect: boolean | null }>();
    for (const row of overwriteRows) {
      overwriteMap.set(`${row.targetType}:${row.targetId}`, {
        allowView: row.allowView,
        allowSend: row.allowSend,
        allowConnect: row.allowConnect,
      });
    }

    const everyoneKey = "EVERYONE:EVERYONE";
    const everyone = overwriteMap.get(everyoneKey) ?? {
      allowView: null,
      allowSend: null,
      allowConnect: null,
    };

    const overwrites = [
      {
        targetType: "EVERYONE" as const,
        targetId: "EVERYONE",
        label: "@everyone",
        permissions: everyone,
      },
      ...roleRows.map((role) => {
        const key = `ROLE:${role.id}`;
        const fallbackLegacy = overwriteMap.get(`ROLE:${role.name.toUpperCase()}`);
        const value = overwriteMap.get(key) ?? fallbackLegacy ?? {
          allowView: null,
          allowSend: null,
          allowConnect: null,
        };

        return {
          targetType: "ROLE" as const,
          targetId: role.id,
          label: role.name,
          permissions: value,
        };
      }),
    ];

    return NextResponse.json({ overwrites });
  } catch (error) {
    console.error("[CHANNEL_PERMISSIONS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { channelId: rawChannelId } = await params;

    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as
      | {
          serverId?: string;
          overwrites?: Array<{
            targetType?: "EVERYONE" | "ROLE";
            targetId?: string;
            permissions?: Partial<{
              allowView: boolean | null;
              allowSend: boolean | null;
              allowConnect: boolean | null;
            }>;
          }>;
        }
      | null;

    const serverId = String(body?.serverId ?? "").trim();
    const channelId = String(rawChannelId ?? "").trim();

    if (!serverId || !channelId) {
      return new NextResponse("Server ID and channel ID are required", { status: 400 });
    }

    const existingChannel = await db.query.channel.findFirst({
      where: and(eq(channel.id, channelId), eq(channel.serverId, serverId)),
      columns: { id: true },
    });

    if (!existingChannel) {
      return new NextResponse("Channel not found", { status: 404 });
    }

    const context = await resolveMemberContext({ profileId: profile.id, serverId });
    if (!context) {
      return new NextResponse("Member not found", { status: 404 });
    }

    if (!context.isServerOwner && context.role === MemberRole.GUEST) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await ensureChannelPermissionSchema();

    const overwriteCandidates = body?.overwrites;
    const incoming = Array.isArray(overwriteCandidates) ? overwriteCandidates : [];

    const normalized = incoming
      .map((item) => {
        const targetType = item.targetType === "EVERYONE" ? "EVERYONE" : "ROLE";
        const rawTargetId = String(item.targetId ?? "").trim();
        const targetId = targetType === "EVERYONE" ? "EVERYONE" : rawTargetId;

        if (!targetId) {
          return null;
        }

        const valueOf = (value: unknown) => {
          if (value === null) {
            return null;
          }

          return typeof value === "boolean" ? value : null;
        };

        return {
          targetType,
          targetId,
          allowView: valueOf(item.permissions?.allowView),
          allowSend: valueOf(item.permissions?.allowSend),
          allowConnect: valueOf(item.permissions?.allowConnect),
        };
      })
      .filter((item): item is {
        targetType: "EVERYONE" | "ROLE";
        targetId: string;
        allowView: boolean | null;
        allowSend: boolean | null;
        allowConnect: boolean | null;
      } => Boolean(item));

    await db.transaction(async (tx) => {
      for (const item of normalized) {
        await tx.execute(sql`
          insert into "ChannelPermission" (
            "id", "serverId", "channelId", "targetType", "targetId", "allowView", "allowSend", "allowConnect", "createdAt", "updatedAt"
          )
          values (
            ${crypto.randomUUID()},
            ${serverId},
            ${channelId},
            ${item.targetType},
            ${item.targetId},
            ${item.allowView},
            ${item.allowSend},
            ${item.allowConnect},
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
      }
    });

    return NextResponse.json({ ok: true, overwrites: normalized });
  } catch (error) {
    console.error("[CHANNEL_PERMISSIONS_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
