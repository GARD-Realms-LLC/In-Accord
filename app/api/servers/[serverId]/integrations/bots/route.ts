import { NextResponse } from "next/server";
import { and, eq, ne, sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db, member, server } from "@/lib/db";
import { isBotUser } from "@/lib/is-bot-user";
import {
  clearServerIntegrationBotFlags,
  getServerIntegrationBotControl,
  setServerIntegrationBotBanned,
  setServerIntegrationBotBooted,
} from "@/lib/server-integration-bot-store";

type BotMemberRow = {
  id: string;
  role: string;
  profileId: string;
  serverId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  userId: string | null;
  name: string | null;
  email: string | null;
  imageUrl: string | null;
};

async function getBotMembers(serverId: string) {
  const controls = await getServerIntegrationBotControl(serverId);

  const membersResult = await db.execute(sql`
    select
      m."id",
      m."role",
      m."profileId",
      m."serverId",
      m."createdAt",
      m."updatedAt",
      u."userId" as "userId",
      u."name" as "name",
      u."email" as "email",
      coalesce(u."avatarUrl", u."avatar", u."icon") as "imageUrl"
    from "Member" m
    left join "Users" u on u."userId" = m."profileId"
    where m."serverId" = ${serverId}
    order by coalesce(u."name", u."email", m."profileId") asc
  `);

  const allMembers = (membersResult as unknown as { rows: BotMemberRow[] }).rows;

  return allMembers
    .filter((row) =>
      isBotUser({
        role: row.role,
        name: row.name,
        email: row.email,
      })
    )
    .map((row) => ({
      id: row.id,
      role: row.role,
      profileId: row.profileId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      profile: {
        id: row.userId ?? row.profileId,
        userId: row.userId ?? row.profileId,
        name: row.name ?? row.email ?? "Bot",
        email: row.email ?? "",
        imageUrl: row.imageUrl ?? "/in-accord-steampunk-logo.png",
      },
      isBooted: controls.bootedProfileIds.includes(row.profileId),
      isBanned: controls.bannedProfileIds.includes(row.profileId),
    }));
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const requesterMembership = await db.query.member.findFirst({
      where: and(eq(member.serverId, serverId), eq(member.profileId, profile.id)),
    });

    if (!requesterMembership) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const bots = await getBotMembers(serverId);

    return NextResponse.json({
      serverId,
      botCount: bots.length,
      bots,
    });
  } catch (error) {
    console.log("[SERVERS_SERVER_ID_INTEGRATIONS_BOTS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const profile = await currentProfile();
    const { action, memberId, profileId } = (await req.json()) as {
      action?: "BOOT" | "UNBOOT" | "BAN" | "UNBAN" | "KICK";
      memberId?: string;
      profileId?: string;
    };

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const ownerServer = await db.query.server.findFirst({
      where: and(eq(server.id, serverId), eq(server.profileId, profile.id)),
    });

    if (!ownerServer) {
      return new NextResponse("Only the server owner can manage integrations.", { status: 403 });
    }

    const normalizedAction = action ?? "BOOT";
    const normalizedMemberId = (memberId ?? "").trim();
    const normalizedProfileId = (profileId ?? "").trim();

    if (!normalizedProfileId) {
      return new NextResponse("Profile ID missing", { status: 400 });
    }

    if ((normalizedAction === "KICK" || normalizedAction === "BAN") && !normalizedMemberId) {
      return new NextResponse("Member ID missing", { status: 400 });
    }

    if (normalizedAction === "BOOT") {
      await setServerIntegrationBotBooted(serverId, normalizedProfileId, true);
    } else if (normalizedAction === "UNBOOT") {
      await setServerIntegrationBotBooted(serverId, normalizedProfileId, false);
    } else if (normalizedAction === "BAN") {
      await setServerIntegrationBotBanned(serverId, normalizedProfileId, true);
      await clearServerIntegrationBotFlags(serverId, normalizedProfileId);
      await setServerIntegrationBotBanned(serverId, normalizedProfileId, true);
      await db.delete(member).where(
        and(
          eq(member.id, normalizedMemberId),
          eq(member.serverId, serverId),
          ne(member.profileId, profile.id)
        )
      );
    } else if (normalizedAction === "UNBAN") {
      await setServerIntegrationBotBanned(serverId, normalizedProfileId, false);
    } else if (normalizedAction === "KICK") {
      await clearServerIntegrationBotFlags(serverId, normalizedProfileId);
      await db.delete(member).where(
        and(
          eq(member.id, normalizedMemberId),
          eq(member.serverId, serverId),
          ne(member.profileId, profile.id)
        )
      );
    }

    const bots = await getBotMembers(serverId);

    return NextResponse.json({
      serverId,
      botCount: bots.length,
      bots,
    });
  } catch (error) {
    console.log("[SERVERS_SERVER_ID_INTEGRATIONS_BOTS_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
