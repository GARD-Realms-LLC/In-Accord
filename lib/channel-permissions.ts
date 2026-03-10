import { and, eq, inArray, sql } from "drizzle-orm";

import { db, member, server } from "@/lib/db";
import { MemberRole } from "@/lib/db/types";

export type ChannelPermissionSet = {
  allowView: boolean;
  allowSend: boolean;
  allowConnect: boolean;
};

type PermissionRow = {
  channelId: string;
  targetType: "EVERYONE" | "ROLE";
  targetId: string;
  allowView: boolean | null;
  allowSend: boolean | null;
  allowConnect: boolean | null;
};

let channelPermissionSchemaReady = false;

export const ensureChannelPermissionSchema = async () => {
  if (channelPermissionSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "ChannelPermission" (
      "id" varchar(191) primary key,
      "serverId" varchar(191) not null,
      "channelId" varchar(191) not null,
      "targetType" varchar(32) not null,
      "targetId" varchar(191) not null,
      "allowView" boolean,
      "allowSend" boolean,
      "allowConnect" boolean,
      "createdAt" timestamp not null,
      "updatedAt" timestamp not null
    )
  `);

  await db.execute(sql`
    create index if not exists "ChannelPermission_serverId_idx"
    on "ChannelPermission" ("serverId")
  `);

  await db.execute(sql`
    create index if not exists "ChannelPermission_channelId_idx"
    on "ChannelPermission" ("channelId")
  `);

  await db.execute(sql`
    create unique index if not exists "ChannelPermission_unique_target_per_channel"
    on "ChannelPermission" ("channelId", "targetType", "targetId")
  `);

  channelPermissionSchemaReady = true;
};

const defaultPermissions: ChannelPermissionSet = {
  allowView: true,
  allowSend: true,
  allowConnect: true,
};

const rolePermissionRows = async ({
  serverId,
  role,
  channelId,
}: {
  serverId: string;
  role: MemberRole;
  channelId?: string;
}) => {
  await ensureChannelPermissionSchema();

  const channelFilter = channelId
    ? sql`and cp."channelId" = ${channelId}`
    : sql``;

  const result = await db.execute(sql`
    select
      cp."channelId" as "channelId",
      cp."targetType" as "targetType",
      cp."targetId" as "targetId",
      cp."allowView" as "allowView",
      cp."allowSend" as "allowSend",
      cp."allowConnect" as "allowConnect"
    from "ChannelPermission" cp
    where cp."serverId" = ${serverId}
      ${channelFilter}
      and (
        (cp."targetType" = 'EVERYONE' and cp."targetId" = 'EVERYONE')
        or
        (cp."targetType" = 'ROLE' and cp."targetId" = ${role})
      )
    order by
      case cp."targetType"
        when 'EVERYONE' then 1
        else 2
      end asc,
      cp."updatedAt" asc
  `);

  return (result as unknown as { rows: PermissionRow[] }).rows ?? [];
};

export const computeChannelPermissionForRole = async ({
  serverId,
  channelId,
  role,
  isServerOwner,
}: {
  serverId: string;
  channelId: string;
  role: MemberRole;
  isServerOwner: boolean;
}): Promise<ChannelPermissionSet> => {
  if (isServerOwner || role === MemberRole.ADMIN) {
    return defaultPermissions;
  }

  const rows = await rolePermissionRows({ serverId, role, channelId });
  const relevant = rows.filter((row) => row.channelId === channelId);

  const resolved = { ...defaultPermissions };

  for (const row of relevant) {
    if (typeof row.allowView === "boolean") {
      resolved.allowView = row.allowView;
    }
    if (typeof row.allowSend === "boolean") {
      resolved.allowSend = row.allowSend;
    }
    if (typeof row.allowConnect === "boolean") {
      resolved.allowConnect = row.allowConnect;
    }
  }

  return resolved;
};

export const visibleChannelIdsForRole = async ({
  serverId,
  role,
  isServerOwner,
  channelIds,
}: {
  serverId: string;
  role: MemberRole;
  isServerOwner: boolean;
  channelIds: string[];
}) => {
  if (isServerOwner || role === MemberRole.ADMIN) {
    return new Set(channelIds);
  }

  const rows = await rolePermissionRows({ serverId, role });
  const map = new Map<string, ChannelPermissionSet>();

  for (const channelId of channelIds) {
    map.set(channelId, { ...defaultPermissions });
  }

  for (const row of rows) {
    const current = map.get(row.channelId);
    if (!current) {
      continue;
    }

    if (typeof row.allowView === "boolean") {
      current.allowView = row.allowView;
    }
    if (typeof row.allowSend === "boolean") {
      current.allowSend = row.allowSend;
    }
    if (typeof row.allowConnect === "boolean") {
      current.allowConnect = row.allowConnect;
    }
  }

  return new Set(
    Array.from(map.entries())
      .filter(([, value]) => value.allowView)
      .map(([channelId]) => channelId)
  );
};

export const channelRolePermissionMatrix = async ({
  serverId,
  channelId,
}: {
  serverId: string;
  channelId: string;
}) => {
  await ensureChannelPermissionSchema();

  const rowsResult = await db.execute(sql`
    select
      cp."targetId" as "targetId",
      cp."allowView" as "allowView",
      cp."allowSend" as "allowSend",
      cp."allowConnect" as "allowConnect"
    from "ChannelPermission" cp
    where cp."serverId" = ${serverId}
      and cp."channelId" = ${channelId}
      and cp."targetType" = 'ROLE'
      and cp."targetId" in ('ADMIN', 'MODERATOR', 'GUEST')
  `);

  const rows = (rowsResult as unknown as {
    rows: Array<{
      targetId: string;
      allowView: boolean | null;
      allowSend: boolean | null;
      allowConnect: boolean | null;
    }>;
  }).rows;

  const matrix: Record<MemberRole, ChannelPermissionSet> = {
    [MemberRole.ADMIN]: { ...defaultPermissions },
    [MemberRole.MODERATOR]: { ...defaultPermissions },
    [MemberRole.GUEST]: { ...defaultPermissions },
  };

  for (const row of rows) {
    const role = row.targetId as MemberRole;
    if (!matrix[role]) {
      continue;
    }

    if (typeof row.allowView === "boolean") {
      matrix[role].allowView = row.allowView;
    }
    if (typeof row.allowSend === "boolean") {
      matrix[role].allowSend = row.allowSend;
    }
    if (typeof row.allowConnect === "boolean") {
      matrix[role].allowConnect = row.allowConnect;
    }
  }

  return matrix;
};

export const upsertChannelRolePermissions = async ({
  serverId,
  channelId,
  permissions,
}: {
  serverId: string;
  channelId: string;
  permissions: Record<MemberRole, ChannelPermissionSet>;
}) => {
  await ensureChannelPermissionSchema();

  const now = new Date();

  await db.transaction(async (tx) => {
    for (const role of [MemberRole.ADMIN, MemberRole.MODERATOR, MemberRole.GUEST] as const) {
      const setting = permissions[role];

      await tx.execute(sql`
        insert into "ChannelPermission" (
          "id",
          "serverId",
          "channelId",
          "targetType",
          "targetId",
          "allowView",
          "allowSend",
          "allowConnect",
          "createdAt",
          "updatedAt"
        )
        values (
          ${crypto.randomUUID()},
          ${serverId},
          ${channelId},
          'ROLE',
          ${role},
          ${setting.allowView},
          ${setting.allowSend},
          ${setting.allowConnect},
          ${now},
          ${now}
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
};

export const resolveMemberContext = async ({
  profileId,
  serverId,
}: {
  profileId: string;
  serverId: string;
}) => {
  const membership = await db.query.member.findFirst({
    where: and(eq(member.serverId, serverId), eq(member.profileId, profileId)),
    columns: { id: true, role: true },
  });

  if (!membership) {
    return null;
  }

  const owner = await db.query.server.findFirst({
    where: and(eq(server.id, serverId), eq(server.profileId, profileId)),
    columns: { id: true },
  });

  return {
    role: membership.role,
    isServerOwner: !!owner,
  };
};
