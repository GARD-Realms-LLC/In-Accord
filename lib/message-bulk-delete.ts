import { and, eq, sql } from "drizzle-orm";

import { channel, db, member, message } from "@/lib/db";
import {
  canManageChannelMessages,
  computeChannelPermissionForMember,
  resolveMemberContext,
} from "@/lib/channel-permissions";
import { REALTIME_CHANNEL_MESSAGES_BULK_SYNC_EVENT } from "@/lib/realtime-events";
import { publishRealtimeEvent } from "@/lib/realtime-events-server";

export const MIN_BULK_DELETE_COUNT = 1;
export const MAX_BULK_DELETE_COUNT = 500;

type BulkDeleteTargetRow = {
  id: string;
  deleted: boolean | null;
};

export type BulkDeleteChannelMessagesResult =
  | { ok: false; status: number; message: string }
  | {
      ok: true;
      deletedCount: number;
      softDeletedCount: number;
      hardDeletedCount: number;
      softDeletedIds: string[];
      hardDeletedIds: string[];
    };

export const bulkDeleteChannelMessages = async ({
  serverId,
  channelId,
  threadId,
  actorProfileId,
  actorProfileRole,
  amount,
  deleteAll,
  profileName,
}: {
  serverId: string;
  channelId: string;
  threadId?: string | null;
  actorProfileId: string;
  actorProfileRole?: string | null;
  amount?: number | null;
  deleteAll?: boolean;
  profileName?: string | null;
}): Promise<BulkDeleteChannelMessagesResult> => {
  const normalizedServerId = String(serverId ?? "").trim();
  const normalizedChannelId = String(channelId ?? "").trim();
  const normalizedThreadId = String(threadId ?? "").trim() || null;
  const normalizedActorProfileId = String(actorProfileId ?? "").trim();
  const profileNameFilter = String(profileName ?? "").trim().toLowerCase();
  const deleteEverything = Boolean(deleteAll);
  const normalizedAmount = Number(amount);

  if (!normalizedServerId) {
    return { ok: false, status: 400, message: "Server ID missing" };
  }

  if (!normalizedChannelId) {
    return { ok: false, status: 400, message: "Channel ID missing" };
  }

  if (!normalizedActorProfileId) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }

  if (
    !deleteEverything &&
    (!Number.isFinite(normalizedAmount) ||
      normalizedAmount < MIN_BULK_DELETE_COUNT ||
      normalizedAmount > MAX_BULK_DELETE_COUNT)
  ) {
    return {
      ok: false,
      status: 400,
      message: `Amount must be between ${MIN_BULK_DELETE_COUNT} and ${MAX_BULK_DELETE_COUNT}`,
    };
  }

  const currentMember = await db.query.member.findFirst({
    where: and(eq(member.serverId, normalizedServerId), eq(member.profileId, normalizedActorProfileId)),
  });

  if (!currentMember) {
    return { ok: false, status: 404, message: "Member not found" };
  }

  const currentChannel = await db.query.channel.findFirst({
    where: and(eq(channel.id, normalizedChannelId), eq(channel.serverId, normalizedServerId)),
  });

  if (!currentChannel) {
    return { ok: false, status: 404, message: "Channel not found" };
  }

  const memberContext = await resolveMemberContext({
    profileId: normalizedActorProfileId,
    serverId: normalizedServerId,
  });

  if (!memberContext) {
    return { ok: false, status: 404, message: "Member not found" };
  }

  const permissions = await computeChannelPermissionForMember({
    serverId: normalizedServerId,
    channelId: normalizedChannelId,
    memberContext,
  });

  if (!permissions.allowView) {
    return { ok: false, status: 403, message: "Forbidden" };
  }

  if (!canManageChannelMessages({ memberContext, profileRole: actorProfileRole })) {
    return { ok: false, status: 403, message: "Forbidden" };
  }

  const profileNameLikePattern = `%${profileNameFilter}%`;

  const targetMessagesResult = deleteEverything
    ? await db.execute(sql`
        select
          msg."id" as "id",
          msg."deleted" as "deleted"
        from "Message" msg
        inner join "Member" mem on mem."id" = msg."memberId"
        left join "Users" u on u."userId" = mem."profileId"
        left join "UserProfile" up on up."userId" = mem."profileId"
        where msg."channelId" = ${normalizedChannelId}
          and ${normalizedThreadId ? sql`msg."threadId" = ${normalizedThreadId}` : sql`msg."threadId" is null`}
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
        where msg."channelId" = ${normalizedChannelId}
          and ${normalizedThreadId ? sql`msg."threadId" = ${normalizedThreadId}` : sql`msg."threadId" is null`}
          and (
            ${profileNameFilter.length === 0}
            or lower(coalesce(up."profileName", '')) like ${profileNameLikePattern}
            or lower(coalesce(u."name", '')) like ${profileNameLikePattern}
            or lower(coalesce(u."email", '')) like ${profileNameLikePattern}
          )
        order by msg."createdAt" desc
        limit ${normalizedAmount}
      `);

  const targetMessages = (((targetMessagesResult as unknown as { rows?: BulkDeleteTargetRow[] }).rows) ?? [])
    .map((row) => ({
      id: String(row.id ?? "").trim(),
      deleted: Boolean(row.deleted),
    }))
    .filter((row) => row.id);

  if (!targetMessages.length) {
    return {
      ok: true,
      deletedCount: 0,
      softDeletedCount: 0,
      hardDeletedCount: 0,
      softDeletedIds: [],
      hardDeletedIds: [],
    };
  }

  const softDeleteIds = targetMessages
    .filter((item) => !item.deleted)
    .map((item) => item.id)
    .filter(Boolean);

  const hardDeleteIds = targetMessages
    .filter((item) => item.deleted)
    .map((item) => item.id)
    .filter(Boolean);

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

    const starterThreadIds = (((starterThreadRows as unknown as {
      rows?: Array<{ id: string | null; sourceMessageId: string | null }>;
    }).rows) ?? [])
      .map((row) => String(row.id ?? "").trim())
      .filter(Boolean);

    if (starterThreadIds.length) {
      const threadReplyRows = await db.execute(sql`
        select "id"
        from "Message"
        where "threadId" in (${sql.join(starterThreadIds.map((id) => sql`${id}`), sql`, `)})
      `);

      const threadReplyIds = (((threadReplyRows as unknown as {
        rows?: Array<{ id: string | null }>;
      }).rows) ?? [])
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

  await publishRealtimeEvent(
    REALTIME_CHANNEL_MESSAGES_BULK_SYNC_EVENT,
    {
      serverId: normalizedServerId,
      channelId: normalizedChannelId,
      threadId: normalizedThreadId,
    },
    {
      entity: "message",
      action: "bulk-deleted",
      deletedCount,
      softDeletedIds: softDeleteIds,
      hardDeletedIds: hardDeleteIds,
    }
  );

  return {
    ok: true,
    deletedCount,
    softDeletedCount: softDeleteIds.length,
    hardDeletedCount: hardDeleteIds.length,
    softDeletedIds: softDeleteIds,
    hardDeletedIds: hardDeleteIds,
  };
};