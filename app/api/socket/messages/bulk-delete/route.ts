import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { channel, db, member, message } from "@/lib/db";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import { computeChannelPermissionForRole, resolveMemberContext } from "@/lib/channel-permissions";

const MIN_DELETE_COUNT = 1;
const MAX_DELETE_COUNT = 500;

const resolveIds = (req: Request) => {
  const { searchParams } = new URL(req.url);
  return {
    serverId: searchParams.get("serverId")?.trim() ?? "",
    channelId: searchParams.get("channelId")?.trim() ?? "",
    threadId: searchParams.get("threadId")?.trim() ?? "",
  };
};

export async function POST(req: Request) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { serverId, channelId, threadId } = resolveIds(req);
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const deleteAll = Boolean(body.deleteAll);
    const amount = Number.parseInt(String(body.amount ?? ""), 10);
    const profileNameFilter = String(body.profileName ?? "").trim().toLowerCase();

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    if (!channelId) {
      return new NextResponse("Channel ID missing", { status: 400 });
    }

    if (!deleteAll && (!Number.isFinite(amount) || amount < MIN_DELETE_COUNT || amount > MAX_DELETE_COUNT)) {
      return new NextResponse(`Amount must be between ${MIN_DELETE_COUNT} and ${MAX_DELETE_COUNT}`, { status: 400 });
    }

    const currentMember = await db.query.member.findFirst({
      where: and(eq(member.serverId, serverId), eq(member.profileId, profile.id)),
    });

    if (!currentMember) {
      return new NextResponse("Member not found", { status: 404 });
    }

    const currentChannel = await db.query.channel.findFirst({
      where: and(eq(channel.id, channelId), eq(channel.serverId, serverId)),
    });

    if (!currentChannel) {
      return new NextResponse("Channel not found", { status: 404 });
    }

    const memberContext = await resolveMemberContext({
      profileId: profile.id,
      serverId,
    });

    const permissions = await computeChannelPermissionForRole({
      serverId,
      channelId,
      role: currentMember.role,
      isServerOwner: memberContext?.isServerOwner ?? false,
    });

    if (!permissions.allowView) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const isServerOwner = Boolean(memberContext?.isServerOwner);
    const isInAccordStaff = hasInAccordAdministrativeAccess(profile.role);

    if (!isServerOwner && !isInAccordStaff) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const profileNameLikePattern = `%${profileNameFilter}%`;

    const targetMessagesResult = deleteAll
      ? await db.execute(sql`
      select
        msg."id" as "id",
        msg."deleted" as "deleted"
      from "Message" msg
      inner join "Member" mem on mem."id" = msg."memberId"
      left join "Users" u on u."userId" = mem."profileId"
      left join "UserProfile" up on up."userId" = mem."profileId"
      where msg."channelId" = ${channelId}
        and ${threadId ? sql`msg."threadId" = ${threadId}` : sql`msg."threadId" is null`}
        and (
          ${profileNameFilter.length === 0}
          or lower(coalesce(up."profileName", '')) like ${profileNameLikePattern}
          or lower(coalesce(u."name", '')) like ${profileNameLikePattern}
          or lower(coalesce(u."email", '')) like ${profileNameLikePattern}
        )
      order by msg."createdAt" desc
    `)
      : await db.execute(sql`
      select
        msg."id" as "id",
        msg."deleted" as "deleted"
      from "Message" msg
      inner join "Member" mem on mem."id" = msg."memberId"
      left join "Users" u on u."userId" = mem."profileId"
      left join "UserProfile" up on up."userId" = mem."profileId"
      where msg."channelId" = ${channelId}
        and ${threadId ? sql`msg."threadId" = ${threadId}` : sql`msg."threadId" is null`}
        and (
          ${profileNameFilter.length === 0}
          or lower(coalesce(up."profileName", '')) like ${profileNameLikePattern}
          or lower(coalesce(u."name", '')) like ${profileNameLikePattern}
          or lower(coalesce(u."email", '')) like ${profileNameLikePattern}
        )
      order by msg."createdAt" desc
      limit ${amount}
    `);

    const targetMessages = ((targetMessagesResult as unknown as {
      rows?: Array<{ id: string; deleted: boolean | null }>;
    }).rows ?? []).map((row) => ({
      id: String(row.id ?? "").trim(),
      deleted: Boolean(row.deleted),
    })).filter((row) => row.id);

    const targetIds = targetMessages.map((item) => item.id).filter(Boolean);

    if (!targetIds.length) {
      return NextResponse.json({ ok: true, deletedCount: 0 });
    }

    const softDeleteIds = targetMessages
      .filter((item) => !item.deleted)
      .map((item) => item.id)
      .filter(Boolean);

    const alreadyDeletedIds = targetMessages
      .filter((item) => item.deleted)
      .map((item) => item.id)
      .filter(Boolean);

    const hardDeleteIds = [...alreadyDeletedIds];

    const now = new Date();

    if (softDeleteIds.length) {
      await db
        .update(message)
        .set({
          content: "This message has been deleted.",
          fileUrl: null,
          deleted: true,
          updatedAt: now,
        })
        .where(sql`${message.id} in (${sql.join(softDeleteIds.map((id) => sql`${id}`), sql`, `)})`);
    }

    if (hardDeleteIds.length) {
      const starterThreadRows = await db.execute(sql`
        select "id", "sourceMessageId"
        from "ChannelThread"
        where "sourceMessageId" in (${sql.join(hardDeleteIds.map((id) => sql`${id}`), sql`, `)})
      `);

      const starterThreadIds = ((starterThreadRows as unknown as {
        rows?: Array<{ id: string | null; sourceMessageId: string | null }>;
      }).rows ?? [])
        .map((row) => String(row.id ?? "").trim())
        .filter(Boolean);

      if (starterThreadIds.length) {
        const threadReplyRows = await db.execute(sql`
          select "id"
          from "Message"
          where "threadId" in (${sql.join(starterThreadIds.map((id) => sql`${id}`), sql`, `)})
        `);

        const threadReplyIds = ((threadReplyRows as unknown as { rows?: Array<{ id: string | null }> }).rows ?? [])
          .map((row) => String(row.id ?? "").trim())
          .filter(Boolean);

        if (threadReplyIds.length) {
          await db.execute(sql`
            delete from "MessageReaction"
            where "messageId" in (${sql.join(threadReplyIds.map((id) => sql`${id}`), sql`, `)})
          `);

          await db
            .delete(message)
            .where(sql`${message.id} in (${sql.join(threadReplyIds.map((id) => sql`${id}`), sql`, `)})`);
        }

        await db.execute(sql`
          delete from "ThreadReadState"
          where "threadId" in (${sql.join(starterThreadIds.map((id) => sql`${id}`), sql`, `)})
        `);

        await db.execute(sql`
          delete from "ChannelThread"
          where "id" in (${sql.join(starterThreadIds.map((id) => sql`${id}`), sql`, `)})
        `);
      }

      await db.execute(sql`
        delete from "MessageReaction"
        where "messageId" in (${sql.join(hardDeleteIds.map((id) => sql`${id}`), sql`, `)})
      `);

      await db
        .delete(message)
        .where(sql`${message.id} in (${sql.join(hardDeleteIds.map((id) => sql`${id}`), sql`, `)})`);
    }

    const deletedCount = softDeleteIds.length + hardDeleteIds.length;

    return NextResponse.json({
      ok: true,
      deletedCount,
      softDeletedCount: softDeleteIds.length,
      hardDeletedCount: hardDeleteIds.length,
    });
  } catch (error) {
    console.error("[SOCKET_MESSAGES_BULK_DELETE_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
