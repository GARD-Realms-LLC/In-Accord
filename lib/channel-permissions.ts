import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { MemberRole } from "@/lib/db/types";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import { ensureServerRolesSchema } from "@/lib/server-roles";

export type ChannelPermissionSet = {
  allowView: boolean;
  allowSend: boolean;
  allowConnect: boolean;
};

type PermissionRow = {
  channelId: string;
  targetType: "EVERYONE" | "ROLE" | "MEMBER";
  targetId: string;
  allowView: boolean | null;
  allowSend: boolean | null;
  allowConnect: boolean | null;
};

export type ResolvedMemberContext = {
  memberId: string;
  profileId: string;
  role: MemberRole;
  assignedRoleIds: string[];
  isServerOwner: boolean;
};

export const canManageChannelMessages = ({
  memberContext,
  profileRole,
}: {
  memberContext: ResolvedMemberContext | null | undefined;
  profileRole?: string | null;
}) => {
  if (!memberContext) {
    return false;
  }

  return (
    memberContext.isServerOwner ||
    memberContext.role === MemberRole.ADMIN ||
    hasInAccordAdministrativeAccess(profileRole)
  );
};

const defaultPermissions: ChannelPermissionSet = {
  allowView: true,
  allowSend: true,
  allowConnect: true,
};

const normalizeMemberRole = (value: unknown): MemberRole => {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (
    normalized === MemberRole.ADMIN ||
    normalized === "ADMINISTRATOR" ||
    normalized === "ADMINS" ||
    normalized === "ADMINISTRATORS"
  ) {
    return MemberRole.ADMIN;
  }
  if (
    normalized === MemberRole.MODERATOR ||
    normalized === "MOD" ||
    normalized === "MODS" ||
    normalized === "MODERATORS"
  ) {
    return MemberRole.MODERATOR;
  }
  return MemberRole.GUEST;
};

const normalizeServerRoleNameKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const implicitRoleNameKeysByMemberRole: Record<MemberRole, Set<string>> = {
  [MemberRole.ADMIN]: new Set(["admin", "admins", "administrator", "administrators"]),
  [MemberRole.MODERATOR]: new Set(["moderator", "moderators", "mod", "mods"]),
  [MemberRole.GUEST]: new Set(["member", "members", "guest", "guests"]),
};

const resolveImplicitServerRoleIds = async ({
  serverId,
  role,
}: {
  serverId: string;
  role: MemberRole;
}) => {
  const expectedKeys = implicitRoleNameKeysByMemberRole[role];
  if (!expectedKeys || expectedKeys.size === 0) {
    return [];
  }

  const result = await db.execute(sql`
    select
      r."id" as "id",
      r."name" as "name"
    from "ServerRole" r
    where r."serverId" = ${serverId}
  `);

  return ((result as unknown as {
    rows?: Array<{ id: string | null; name: string | null }>;
  }).rows ?? [])
    .filter((row) => expectedKeys.has(normalizeServerRoleNameKey(row.name)))
    .map((row) => String(row.id ?? "").trim())
    .filter(Boolean);
};

export const ensureChannelPermissionSchema = async () => {
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
      "createdAt" timestamp not null default CURRENT_TIMESTAMP,
      "updatedAt" timestamp not null default CURRENT_TIMESTAMP
    )
  `);

  await db.execute(sql`
    alter table "ChannelPermission"
    add column if not exists "id" varchar(191)
  `);

  await db.execute(sql`
    alter table "ChannelPermission"
    add column if not exists "serverId" varchar(191)
  `);

  await db.execute(sql`
    alter table "ChannelPermission"
    add column if not exists "channelId" varchar(191)
  `);

  await db.execute(sql`
    alter table "ChannelPermission"
    add column if not exists "targetType" varchar(32)
  `);

  await db.execute(sql`
    alter table "ChannelPermission"
    add column if not exists "targetId" varchar(191)
  `);

  await db.execute(sql`
    alter table "ChannelPermission"
    add column if not exists "allowView" boolean
  `);

  await db.execute(sql`
    alter table "ChannelPermission"
    add column if not exists "allowSend" boolean
  `);

  await db.execute(sql`
    alter table "ChannelPermission"
    add column if not exists "allowConnect" boolean
  `);

  await db.execute(sql`
    alter table "ChannelPermission"
    add column if not exists "createdAt" timestamp not null default CURRENT_TIMESTAMP
  `);

  await db.execute(sql`
    alter table "ChannelPermission"
    add column if not exists "updatedAt" timestamp not null default CURRENT_TIMESTAMP
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
    create unique index if not exists "ChannelPermission_channel_target_key"
    on "ChannelPermission" ("channelId", "targetType", "targetId")
  `);
};

const applyPermissionValue = (
  resolved: ChannelPermissionSet,
  key: keyof ChannelPermissionSet,
  value: boolean | null | undefined
) => {
  if (typeof value === "boolean") {
    resolved[key] = value;
  }
};

const aggregateRolePermission = (
  rows: PermissionRow[],
  key: keyof ChannelPermissionSet
) => {
  let hasAllow = false;
  let hasDeny = false;

  for (const row of rows) {
    const value = row[key];
    if (value === true) {
      hasAllow = true;
    }
    if (value === false) {
      hasDeny = true;
    }
  }

  return { hasAllow, hasDeny };
};

const loadChannelPermissionRows = async ({
  serverId,
  channelId,
}: {
  serverId: string;
  channelId?: string;
}) => {
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
    order by
      case cp."targetType"
        when 'EVERYONE' then 1
        when 'ROLE' then 2
        else 3
      end asc,
      cp."updatedAt" asc
  `);

  return (result as unknown as { rows: PermissionRow[] }).rows ?? [];
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

export const computeChannelPermissionForMember = async ({
  serverId,
  channelId,
  memberContext,
}: {
  serverId: string;
  channelId: string;
  memberContext: ResolvedMemberContext;
}): Promise<ChannelPermissionSet> => {
  if (memberContext.isServerOwner || memberContext.role === MemberRole.ADMIN) {
    return { ...defaultPermissions };
  }

  const rows = await loadChannelPermissionRows({ serverId, channelId });
  const relevant = rows.filter((row) => row.channelId === channelId);
  const resolved = { ...defaultPermissions };

  const everyoneRow = relevant.find(
    (row) => row.targetType === "EVERYONE" && row.targetId === "EVERYONE"
  );
  if (everyoneRow) {
    applyPermissionValue(resolved, "allowView", everyoneRow.allowView);
    applyPermissionValue(resolved, "allowSend", everyoneRow.allowSend);
    applyPermissionValue(resolved, "allowConnect", everyoneRow.allowConnect);
  }

  const applicableRoleIds = new Set<string>([memberContext.role, ...memberContext.assignedRoleIds]);
  const applicableRoleRows = relevant.filter(
    (row) => row.targetType === "ROLE" && applicableRoleIds.has(String(row.targetId ?? "").trim())
  );

  for (const key of ["allowView", "allowSend", "allowConnect"] as const) {
    const aggregate = aggregateRolePermission(applicableRoleRows, key);
    if (aggregate.hasDeny) {
      resolved[key] = false;
    }
    if (aggregate.hasAllow) {
      resolved[key] = true;
    }
  }

  const memberRow = relevant.find(
    (row) => row.targetType === "MEMBER" && row.targetId === memberContext.memberId
  );
  if (memberRow) {
    applyPermissionValue(resolved, "allowView", memberRow.allowView);
    applyPermissionValue(resolved, "allowSend", memberRow.allowSend);
    applyPermissionValue(resolved, "allowConnect", memberRow.allowConnect);
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

export const visibleChannelIdsForMember = async ({
  serverId,
  memberContext,
  channelIds,
}: {
  serverId: string;
  memberContext: ResolvedMemberContext;
  channelIds: string[];
}) => {
  if (memberContext.isServerOwner || memberContext.role === MemberRole.ADMIN) {
    return new Set(channelIds);
  }

  const rows = await loadChannelPermissionRows({ serverId });
  const applicableRoleIds = new Set<string>([memberContext.role, ...memberContext.assignedRoleIds]);
  const map = new Map<string, ChannelPermissionSet>();

  for (const channelId of channelIds) {
    map.set(channelId, { ...defaultPermissions });
  }

  for (const channelId of channelIds) {
    const current = map.get(channelId);
    if (!current) {
      continue;
    }

    const relevant = rows.filter((row) => row.channelId === channelId);
    const everyoneRow = relevant.find(
      (row) => row.targetType === "EVERYONE" && row.targetId === "EVERYONE"
    );
    if (everyoneRow) {
      applyPermissionValue(current, "allowView", everyoneRow.allowView);
      applyPermissionValue(current, "allowSend", everyoneRow.allowSend);
      applyPermissionValue(current, "allowConnect", everyoneRow.allowConnect);
    }

    const applicableRoleRows = relevant.filter(
      (row) => row.targetType === "ROLE" && applicableRoleIds.has(String(row.targetId ?? "").trim())
    );
    for (const key of ["allowView", "allowSend", "allowConnect"] as const) {
      const aggregate = aggregateRolePermission(applicableRoleRows, key);
      if (aggregate.hasDeny) {
        current[key] = false;
      }
      if (aggregate.hasAllow) {
        current[key] = true;
      }
    }

    const memberRow = relevant.find(
      (row) => row.targetType === "MEMBER" && row.targetId === memberContext.memberId
    );
    if (memberRow) {
      applyPermissionValue(current, "allowView", memberRow.allowView);
      applyPermissionValue(current, "allowSend", memberRow.allowSend);
      applyPermissionValue(current, "allowConnect", memberRow.allowConnect);
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
  const now = new Date();

  await db.transaction(async (tx: any) => {
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
  const normalizedProfileId = String(profileId ?? "").trim();
  const normalizedServerId = String(serverId ?? "").trim();

  if (!normalizedProfileId || !normalizedServerId) {
    return null;
  }

  await ensureServerRolesSchema();

  const membershipResult = await db.execute(sql`
    select
      m."id" as "id",
      m."role" as "role",
      m."profileId" as "profileId"
    from "Member" m
    where m."serverId" = ${normalizedServerId}
      and m."profileId" = ${normalizedProfileId}
    order by m."createdAt" asc, m."id" asc
    limit 1
  `);

  const membershipRow = (membershipResult as unknown as {
    rows?: Array<{
      id: string | null;
      role: string | null;
      profileId: string | null;
    }>;
  }).rows?.[0];

  const normalizedMemberId = String(membershipRow?.id ?? "").trim();
  const normalizedMembershipProfileId = String(membershipRow?.profileId ?? normalizedProfileId).trim();

  if (!normalizedMemberId || !normalizedMembershipProfileId) {
    return null;
  }

  const ownerResult = await db.execute(sql`
    select s."id" as "id"
    from "Server" s
    where s."id" = ${normalizedServerId}
      and s."profileId" = ${normalizedProfileId}
    limit 1
  `);

  const isServerOwner = Boolean(
    (ownerResult as unknown as {
      rows?: Array<{ id: string | null }>;
    }).rows?.[0]?.id,
  );

  const normalizedRole = normalizeMemberRole(membershipRow?.role);

  const assignmentRows = await db.execute(sql`
    select a."roleId" as "roleId"
    from "ServerRoleAssignment" a
    where a."serverId" = ${normalizedServerId}
      and exists (
        select 1
        from "Member" m
        where m."id" = a."memberId"
          and m."serverId" = ${normalizedServerId}
          and m."profileId" = ${normalizedMembershipProfileId}
      )
  `);

  const assignedRoleIds = ((assignmentRows as unknown as {
    rows?: Array<{ roleId: string | null }>;
  }).rows ?? [])
    .map((row) => String(row.roleId ?? "").trim())
    .filter(Boolean);

  const implicitRoleIds = await resolveImplicitServerRoleIds({
    serverId: normalizedServerId,
    role: normalizedRole,
  });

  return {
    memberId: normalizedMemberId,
    profileId: normalizedMembershipProfileId,
    role: normalizedRole,
    assignedRoleIds: Array.from(new Set([...assignedRoleIds, ...implicitRoleIds])),
    isServerOwner,
  };
};
