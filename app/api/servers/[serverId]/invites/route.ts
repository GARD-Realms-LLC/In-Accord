import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db, member, profile, server } from "@/lib/db";
import {
  appendServerInviteHistory,
  getServerInviteHistory,
  removeServerInviteHistory,
} from "@/lib/server-invite-store";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const currentUser = await currentProfile();

    if (!currentUser) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const membership = await db.query.member.findFirst({
      where: and(eq(member.serverId, serverId), eq(member.profileId, currentUser.id)),
    });

    if (!membership) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const serverRecord = await db.query.server.findFirst({
      where: eq(server.id, serverId),
    });

    if (!serverRecord) {
      return new NextResponse("Server not found", { status: 404 });
    }

    if (serverRecord.inviteCode?.trim()) {
      await appendServerInviteHistory(serverId, {
        code: serverRecord.inviteCode,
        source: "created",
        createdByProfileId: serverRecord.profileId,
      });
    }

    const invites = await getServerInviteHistory(serverId);

    const creatorIds = Array.from(
      new Set(invites.map((item) => item.createdByProfileId).filter((id): id is string => Boolean(id)))
    );

    const creatorsResult = creatorIds.length
      ? await db.execute(sql`
          select
            u."userId" as "id",
            coalesce(nullif(trim(up."profileName"), ''), nullif(trim(u."name"), ''), nullif(trim(u."email"), '')) as "displayName",
            u."email" as "email",
            coalesce(u."avatarUrl", u."avatar", u."icon") as "imageUrl"
          from "Users" u
          left join "UserProfile" up on up."userId" = u."userId"
          where u."userId" in (${sql.join(creatorIds.map((id) => sql`${id}`), sql`, `)})
        `)
      : ({ rows: [] } as unknown as { rows: Array<{ id: string; displayName: string | null; email: string | null; imageUrl: string | null }> });

    const creatorById = new Map(
      ((creatorsResult as unknown as {
        rows?: Array<{ id: string; displayName: string | null; email: string | null; imageUrl: string | null }>;
      }).rows ?? []).map((item) => [
        item.id,
        {
          id: item.id,
          name: item.displayName ?? null,
          email: item.email ?? null,
          imageUrl: item.imageUrl ?? null,
        },
      ])
    );

    const enrichedInvites = invites.map((inviteItem) => {
      const creator = inviteItem.createdByProfileId
        ? creatorById.get(inviteItem.createdByProfileId)
        : null;

      return {
        ...inviteItem,
        createdByName: creator?.name ?? null,
        createdByEmail: creator?.email ?? null,
        createdByImageUrl: creator?.imageUrl ?? null,
        usedCount:
          typeof inviteItem.usedCount === "number"
            ? inviteItem.usedCount
            : Array.isArray(inviteItem.usedByProfileIds)
              ? inviteItem.usedByProfileIds.length
              : 0,
      };
    });

    return NextResponse.json({
      serverId,
      inviteCount: enrichedInvites.length,
      invites: enrichedInvites,
    });
  } catch (error) {
    console.log("[SERVERS_SERVER_ID_INVITES_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const currentUser = await currentProfile();
    const { code } = (await req.json()) as { code?: string };

    if (!currentUser) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const serverRecord = await db.query.server.findFirst({
      where: eq(server.id, serverId),
    });

    if (!serverRecord) {
      return new NextResponse("Server not found", { status: 404 });
    }

    if (serverRecord.profileId !== currentUser.id) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const normalizedCode = (code ?? "").trim();
    if (!normalizedCode) {
      return new NextResponse("Invite code missing", { status: 400 });
    }

    await removeServerInviteHistory(serverId, normalizedCode);

    let rotated = false;
    let nextInviteCode: string | null = null;

    if ((serverRecord.inviteCode ?? "").trim() === normalizedCode) {
      rotated = true;
      nextInviteCode = uuidv4();

      await db
        .update(server)
        .set({
          inviteCode: nextInviteCode,
        })
        .where(and(eq(server.id, serverId), eq(server.profileId, currentUser.id)));

      await appendServerInviteHistory(serverId, {
        code: nextInviteCode,
        source: "regenerated",
        createdByProfileId: currentUser.id,
      });
    }

    return NextResponse.json({
      success: true,
      rotated,
      nextInviteCode,
      deletedCode: normalizedCode,
    });
  } catch (error) {
    console.log("[SERVERS_SERVER_ID_INVITES_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
