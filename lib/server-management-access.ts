import { and, eq } from "drizzle-orm";

import { db, member, server } from "@/lib/db";
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

  const target = await db.query.server.findFirst({
    where: eq(server.id, normalizedServerId),
    columns: {
      id: true,
      name: true,
      imageUrl: true,
      profileId: true,
    },
  });

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

  const membership =
    (await db.query.member.findFirst({
    where: and(eq(member.serverId, normalizedServerId), eq(member.profileId, normalizedProfileId)),
    columns: {
      id: true,
      profileId: true,
      serverId: true,
      role: true,
    },
    })) ?? null;

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