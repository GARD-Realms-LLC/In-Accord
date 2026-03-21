import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { isInAccordAdministrator } from "@/lib/in-accord-admin";

type ManagedServerRow = {
  id: string;
  name: string;
  imageUrl: string;
  profileId: string;
};

type ManagedMemberRow = {
  id: string;
  profileId: string;
  serverId: string;
  role: string;
};

export type ServerManagementAccess = {
  target: ManagedServerRow | null;
  membership: ManagedMemberRow | null;
  isGlobalAdministrator: boolean;
  isOwner: boolean;
  canView: boolean;
  canManage: boolean;
};

export const getServerManagementAccess = async ({
  serverId,
  profileId,
  profileRole,
}: {
  serverId: string;
  profileId: string;
  profileRole?: string | null;
}): Promise<ServerManagementAccess> => {
  const normalizedServerId = String(serverId ?? "").trim();
  const normalizedProfileId = String(profileId ?? "").trim();
  const isGlobalAdministrator = isInAccordAdministrator(profileRole);

  if (!normalizedServerId || !normalizedProfileId) {
    return {
      target: null,
      membership: null,
      isGlobalAdministrator,
      isOwner: false,
      canView: false,
      canManage: false,
    };
  }

  const targetResult = await db.execute(sql`
    select
      s."id" as "id",
      s."name" as "name",
      s."imageUrl" as "imageUrl",
      s."profileId" as "profileId"
    from "Server" s
    where trim(s."id") = trim(${normalizedServerId})
    limit 1
  `);

  const target =
    ((targetResult as {
      rows?: ManagedServerRow[];
    }).rows ?? [])[0] ?? null;

  if (!target) {
    return {
      target: null,
      membership: null,
      isGlobalAdministrator,
      isOwner: false,
      canView: false,
      canManage: false,
    };
  }

  const membershipResult = await db.execute(sql`
    select
      m."id" as "id",
      m."profileId" as "profileId",
      m."serverId" as "serverId",
      m."role" as "role"
    from "Member" m
    where trim(m."serverId") = trim(${normalizedServerId})
      and trim(m."profileId") = trim(${normalizedProfileId})
    order by m."createdAt" asc, m."id" asc
    limit 1
  `);

  const membership =
    ((membershipResult as {
      rows?: ManagedMemberRow[];
    }).rows ?? [])[0] ?? null;

  const isOwner = String(target.profileId ?? "").trim() === normalizedProfileId;
  const canManage = isGlobalAdministrator || isOwner;
  const canView = canManage || Boolean(membership);

  return {
    target,
    membership,
    isGlobalAdministrator,
    isOwner,
    canView,
    canManage,
  };
};
