import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export type PrivateMessageCallType = "AUDIO" | "VIDEO";
export type PrivateMessageCallStatus = "REQUESTED" | "ACTIVE" | "DENIED" | "ENDED" | "CANCELLED";

export type PrivateMessageCall = {
  id: string;
  conversationId: string;
  serverId: string;
  callerMemberId: string;
  calleeMemberId: string;
  callType: PrivateMessageCallType;
  status: PrivateMessageCallStatus;
  callerAccepted: boolean;
  calleeAccepted: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export const PRIVATE_MESSAGE_CALL_REQUEST_TIMEOUT_SECONDS = 45;

let privateMessageCallSchemaReady = false;

export const ensurePrivateMessageCallSchema = async () => {
  if (privateMessageCallSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "PrivateMessageCall" (
      "id" varchar(191) primary key,
      "conversationId" varchar(191) not null,
      "serverId" varchar(191) not null,
      "callerMemberId" varchar(191) not null,
      "calleeMemberId" varchar(191) not null,
      "callType" varchar(16) not null,
      "status" varchar(16) not null default 'REQUESTED',
      "callerAccepted" boolean not null default false,
      "calleeAccepted" boolean not null default false,
      "createdAt" timestamp not null default now(),
      "updatedAt" timestamp not null default now()
    )
  `);

  await db.execute(sql`
    create index if not exists "PrivateMessageCall_conversationId_updatedAt_idx"
    on "PrivateMessageCall" ("conversationId", "updatedAt" desc)
  `);

  privateMessageCallSchemaReady = true;
};

export const findLatestPrivateMessageCall = async (conversationId: string) => {
  const result = await db.execute(sql`
    select
      "id",
      "conversationId",
      "serverId",
      "callerMemberId",
      "calleeMemberId",
      upper(trim(coalesce("callType", 'AUDIO'))) as "callType",
      upper(trim(coalesce("status", 'REQUESTED'))) as "status",
      "callerAccepted",
      "calleeAccepted",
      "createdAt",
      "updatedAt"
    from "PrivateMessageCall"
    where "conversationId" = ${conversationId}
      and upper(trim(coalesce("status", ''))) in ('REQUESTED', 'ACTIVE')
    order by "updatedAt" desc
    limit 1
  `);

  return ((result as unknown as { rows?: PrivateMessageCall[] }).rows ?? [])[0] ?? null;
};

export const findLatestPrivateMessageCallEvent = async (conversationId: string) => {
  const result = await db.execute(sql`
    select
      "id",
      "conversationId",
      "serverId",
      "callerMemberId",
      "calleeMemberId",
      upper(trim(coalesce("callType", 'AUDIO'))) as "callType",
      upper(trim(coalesce("status", 'REQUESTED'))) as "status",
      "callerAccepted",
      "calleeAccepted",
      "createdAt",
      "updatedAt"
    from "PrivateMessageCall"
    where "conversationId" = ${conversationId}
    order by "updatedAt" desc
    limit 1
  `);

  return ((result as unknown as { rows?: PrivateMessageCall[] }).rows ?? [])[0] ?? null;
};

export const createPrivateMessageCallRequest = async ({
  conversationId,
  serverId,
  callerMemberId,
  calleeMemberId,
  callType,
}: {
  conversationId: string;
  serverId: string;
  callerMemberId: string;
  calleeMemberId: string;
  callType: PrivateMessageCallType;
}) => {
  await db.execute(sql`
    update "PrivateMessageCall"
    set "status" = 'CANCELLED',
        "updatedAt" = now()
    where "conversationId" = ${conversationId}
      and upper(trim(coalesce("status", ''))) in ('REQUESTED', 'ACTIVE')
  `);

  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  await db.execute(sql`
    insert into "PrivateMessageCall" (
      "id",
      "conversationId",
      "serverId",
      "callerMemberId",
      "calleeMemberId",
      "callType",
      "status",
      "callerAccepted",
      "calleeAccepted",
      "createdAt",
      "updatedAt"
    )
    values (
      ${id},
      ${conversationId},
      ${serverId},
      ${callerMemberId},
      ${calleeMemberId},
      ${callType},
      'REQUESTED',
      false,
      false,
      now(),
      now()
    )
  `);

  return id;
};

export const acceptPrivateMessageCall = async ({
  callId,
  memberId,
}: {
  callId: string;
  memberId: string;
}) => {
  await db.execute(sql`
    update "PrivateMessageCall"
    set
      "callerAccepted" = case when "callerMemberId" = ${memberId} then true else "callerAccepted" end,
      "calleeAccepted" = case when "calleeMemberId" = ${memberId} then true else "calleeAccepted" end,
      "status" = case
        when
          (case when "callerMemberId" = ${memberId} then true else "callerAccepted" end)
          and
          (case when "calleeMemberId" = ${memberId} then true else "calleeAccepted" end)
        then 'ACTIVE'
        else 'REQUESTED'
      end,
      "updatedAt" = now()
    where "id" = ${callId}
      and upper(trim(coalesce("status", ''))) = 'REQUESTED'
      and (${memberId} in ("callerMemberId", "calleeMemberId"))
  `);
};

export const denyPrivateMessageCall = async ({
  callId,
  memberId,
}: {
  callId: string;
  memberId: string;
}) => {
  await db.execute(sql`
    update "PrivateMessageCall"
    set "status" = 'DENIED',
        "updatedAt" = now()
    where "id" = ${callId}
      and upper(trim(coalesce("status", ''))) = 'REQUESTED'
      and (${memberId} in ("callerMemberId", "calleeMemberId"))
  `);
};

export const endPrivateMessageCall = async ({
  callId,
  memberId,
}: {
  callId: string;
  memberId: string;
}) => {
  await db.execute(sql`
    update "PrivateMessageCall"
    set "status" = 'ENDED',
        "updatedAt" = now()
    where "id" = ${callId}
      and upper(trim(coalesce("status", ''))) in ('REQUESTED', 'ACTIVE')
      and (${memberId} in ("callerMemberId", "calleeMemberId"))
  `);
};

export const expireStalePrivateMessageCallRequests = async (
  timeoutSeconds = PRIVATE_MESSAGE_CALL_REQUEST_TIMEOUT_SECONDS
) => {
  const safeTimeoutSeconds = Number.isFinite(timeoutSeconds)
    ? Math.max(5, Math.floor(timeoutSeconds))
    : PRIVATE_MESSAGE_CALL_REQUEST_TIMEOUT_SECONDS;

  await db.execute(sql`
    update "PrivateMessageCall"
    set "status" = 'CANCELLED',
        "updatedAt" = now()
    where upper(trim(coalesce("status", ''))) = 'REQUESTED'
      and "createdAt" <= now() - (${safeTimeoutSeconds} * interval '1 second')
  `);
};
