import "server-only";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import path from "path";
import { Readable } from "stream";

import { ensureChannelGroupSchema } from "@/lib/channel-groups";
import { db } from "@/lib/db";
import { getOurBoardEntryByServerId } from "@/lib/our-board-store";
import { getServerBannerConfig } from "@/lib/server-banner-store";
import { getServerInviteHistory } from "@/lib/server-invite-store";
import { getServerOnboardingConfig } from "@/lib/server-onboarding-store";
import { getServerProfileSettings } from "@/lib/server-profile-settings-store";
import { ensureServerRolesSchema } from "@/lib/server-roles";
import { listServerScheduledEvents } from "@/lib/server-scheduled-events-store";

export type ServerBackupDestination = "FILE" | "S3" | "FTP";

export type ServerBackupConfig = {
  serverId: string;
  destination: ServerBackupDestination;
  fileNamePrefix: string;
  s3Endpoint: string | null;
  s3Region: string | null;
  s3Bucket: string | null;
  s3AccessKeyId: string | null;
  s3SecretAccessKey: string | null;
  s3Prefix: string | null;
  ftpHost: string | null;
  ftpPort: number;
  ftpSecure: boolean;
  ftpUsername: string | null;
  ftpPassword: string | null;
  ftpBasePath: string | null;
  lastBackupAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ServerBackupRecord = {
  id: string;
  serverId: string;
  createdByProfileId: string;
  destination: ServerBackupDestination;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  status: "READY";
  remotePath: string | null;
  remoteUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ServerBackupRecordWithContent = ServerBackupRecord & {
  snapshotJson: string;
};

export type ServerBackupConfigPatch = Partial<
  Pick<
    ServerBackupConfig,
    | "destination"
    | "fileNamePrefix"
    | "s3Endpoint"
    | "s3Region"
    | "s3Bucket"
    | "s3AccessKeyId"
    | "s3SecretAccessKey"
    | "s3Prefix"
    | "ftpHost"
    | "ftpPort"
    | "ftpSecure"
    | "ftpUsername"
    | "ftpPassword"
    | "ftpBasePath"
  >
>;

type CreateServerBackupInput = {
  serverId: string;
  createdByProfileId: string;
  destinationOverride?: ServerBackupDestination;
};

type ServerBackupPayload = {
  version: 1;
  source: "in-accord-server-backup";
  exportedAt: string;
  server: {
    id: string;
    name: string;
    imageUrl: string;
    inviteCode: string;
    ownerProfileId: string;
    createdAt: string;
    updatedAt: string;
  };
  settings: {
    banner: Awaited<ReturnType<typeof getServerBannerConfig>>;
    profile: Awaited<ReturnType<typeof getServerProfileSettings>>;
    onboarding: Awaited<ReturnType<typeof getServerOnboardingConfig>>;
    ourBoard: Awaited<ReturnType<typeof getOurBoardEntryByServerId>>;
    inviteHistory: Awaited<ReturnType<typeof getServerInviteHistory>>;
    scheduledEvents: Awaited<ReturnType<typeof listServerScheduledEvents>>;
  };
  members: Array<{
    id: string;
    role: string;
    profileId: string;
    profileName: string | null;
    email: string | null;
    imageUrl: string | null;
    joinedServerAt: string | null;
    lastLogonAt: string | null;
  }>;
  structure: {
    channelGroups: Array<{
      id: string;
      name: string;
      icon: string | null;
      sortOrder: number;
      createdAt: string;
      updatedAt: string;
    }>;
    channels: Array<{
      id: string;
      name: string;
      icon: string | null;
      type: string;
      channelGroupId: string | null;
      sortOrder: number;
      isSystem: boolean;
      createdAt: string;
      updatedAt: string;
    }>;
    roles: Array<{
      id: string;
      name: string;
      color: string;
      iconUrl: string | null;
      isMentionable: boolean;
      showInOnlineMembers: boolean;
      position: number;
      isManaged: boolean;
      createdAt: string;
      updatedAt: string;
    }>;
    rolePermissions: Array<Record<string, unknown>>;
    roleAssignments: Array<{
      roleId: string;
      memberId: string;
      serverId: string;
      createdAt: string;
    }>;
  };
};

let serverBackupSchemaReady = false;

const DEFAULT_CONFIG: Omit<ServerBackupConfig, "serverId" | "lastBackupAt" | "createdAt" | "updatedAt"> = {
  destination: "FILE",
  fileNamePrefix: "server-backup",
  s3Endpoint: null,
  s3Region: null,
  s3Bucket: null,
  s3AccessKeyId: null,
  s3SecretAccessKey: null,
  s3Prefix: null,
  ftpHost: null,
  ftpPort: 21,
  ftpSecure: false,
  ftpUsername: null,
  ftpPassword: null,
  ftpBasePath: null,
};

const normalizeDestination = (value: unknown): ServerBackupDestination => {
  const normalized = String(value ?? "FILE").trim().toUpperCase();
  if (normalized === "S3" || normalized === "FTP") {
    return normalized;
  }
  return "FILE";
};

const normalizeNullableString = (value: unknown, maxLength = 2048) => {
  const normalized = String(value ?? "").trim().slice(0, maxLength);
  return normalized.length > 0 ? normalized : null;
};

const normalizeFilePrefix = (value: unknown) => {
  const normalized = String(value ?? DEFAULT_CONFIG.fileNamePrefix)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return normalized || DEFAULT_CONFIG.fileNamePrefix;
};

const normalizePort = (value: unknown) => {
  const parsed = Number.parseInt(String(value ?? DEFAULT_CONFIG.ftpPort), 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    return DEFAULT_CONFIG.ftpPort;
  }
  return parsed;
};

const normalizeBoolean = (value: unknown, fallback = false) => {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
};

const toIso = (value: unknown): string => {
  const parsed = value instanceof Date ? value : new Date(String(value ?? ""));
  if (Number.isNaN(parsed.getTime())) {
    return new Date(0).toISOString();
  }
  return parsed.toISOString();
};

const toIsoOrNull = (value: unknown): string | null => {
  if (value == null || String(value).trim().length === 0) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(String(value ?? ""));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
};

const buildFileStamp = (value: Date) => {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  const hour = String(value.getUTCHours()).padStart(2, "0");
  const minute = String(value.getUTCMinutes()).padStart(2, "0");
  const second = String(value.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hour}${minute}${second}`;
};

const sanitizeFileSegment = (value: string) =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const buildBackupFileName = (prefix: string, serverName: string, createdAt: Date) => {
  const safePrefix = sanitizeFileSegment(prefix) || DEFAULT_CONFIG.fileNamePrefix;
  const safeServerName = sanitizeFileSegment(serverName) || "server";
  return `${safePrefix}-${safeServerName}-${buildFileStamp(createdAt)}.json`;
};

const normalizeConfigRow = (serverId: string, row?: Record<string, unknown> | null): ServerBackupConfig => ({
  serverId,
  destination: normalizeDestination(row?.destination),
  fileNamePrefix: normalizeFilePrefix(row?.fileNamePrefix),
  s3Endpoint: normalizeNullableString(row?.s3Endpoint),
  s3Region: normalizeNullableString(row?.s3Region, 64),
  s3Bucket: normalizeNullableString(row?.s3Bucket, 191),
  s3AccessKeyId: normalizeNullableString(row?.s3AccessKeyId),
  s3SecretAccessKey: normalizeNullableString(row?.s3SecretAccessKey),
  s3Prefix: normalizeNullableString(row?.s3Prefix),
  ftpHost: normalizeNullableString(row?.ftpHost, 255),
  ftpPort: normalizePort(row?.ftpPort),
  ftpSecure: normalizeBoolean(row?.ftpSecure, false),
  ftpUsername: normalizeNullableString(row?.ftpUsername, 191),
  ftpPassword: normalizeNullableString(row?.ftpPassword),
  ftpBasePath: normalizeNullableString(row?.ftpBasePath),
  lastBackupAt: toIsoOrNull(row?.lastBackupAt),
  createdAt: toIso(row?.createdAt ?? new Date()),
  updatedAt: toIso(row?.updatedAt ?? new Date()),
});

const normalizeBackupRecord = (row: Record<string, unknown>): ServerBackupRecord => ({
  id: String(row.id ?? ""),
  serverId: String(row.serverId ?? ""),
  createdByProfileId: String(row.createdByProfileId ?? ""),
  destination: normalizeDestination(row.destination),
  fileName: String(row.fileName ?? "server-backup.json"),
  contentType: String(row.contentType ?? "application/json"),
  sizeBytes: Number(row.sizeBytes ?? 0),
  status: "READY",
  remotePath: normalizeNullableString(row.remotePath),
  remoteUrl: normalizeNullableString(row.remoteUrl),
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
});

export const ensureServerBackupSchema = async () => {
  if (serverBackupSchemaReady) {
    return;
  }

  await db.execute(sql`select pg_advisory_lock(hashtext('ensure_server_backup_schema_v1'))`);

  try {
    if (serverBackupSchemaReady) {
      return;
    }

    await db.execute(sql`
      create table if not exists "ServerBackupConfig" (
        "serverId" varchar(191) primary key,
        "destination" varchar(16) not null default 'FILE',
        "fileNamePrefix" varchar(120) not null default 'server-backup',
        "s3Endpoint" text,
        "s3Region" varchar(64),
        "s3Bucket" varchar(191),
        "s3AccessKeyId" text,
        "s3SecretAccessKey" text,
        "s3Prefix" text,
        "ftpHost" varchar(255),
        "ftpPort" integer not null default 21,
        "ftpSecure" boolean not null default false,
        "ftpUsername" varchar(191),
        "ftpPassword" text,
        "ftpBasePath" text,
        "lastBackupAt" timestamp(3),
        "createdAt" timestamp(3) not null default now(),
        "updatedAt" timestamp(3) not null default now()
      )
    `);

    await db.execute(sql`
      create table if not exists "ServerBackupSnapshot" (
        "id" varchar(191) primary key,
        "serverId" varchar(191) not null,
        "createdByProfileId" varchar(191) not null,
        "destination" varchar(16) not null,
        "fileName" varchar(255) not null,
        "contentType" varchar(120) not null default 'application/json',
        "sizeBytes" integer not null default 0,
        "status" varchar(24) not null default 'READY',
        "snapshotJson" text not null,
        "remotePath" text,
        "remoteUrl" text,
        "createdAt" timestamp(3) not null default now(),
        "updatedAt" timestamp(3) not null default now()
      )
    `);

    await db.execute(sql`
      create index if not exists "ServerBackupSnapshot_serverId_createdAt_idx"
      on "ServerBackupSnapshot" ("serverId", "createdAt")
    `);

    serverBackupSchemaReady = true;
  } finally {
    await db.execute(sql`select pg_advisory_unlock(hashtext('ensure_server_backup_schema_v1'))`);
  }
};

export const getServerBackupConfig = async (serverId: string): Promise<ServerBackupConfig> => {
  await ensureServerBackupSchema();

  const normalizedServerId = String(serverId ?? "").trim();
  const result = await db.execute(sql`
    select *
    from "ServerBackupConfig"
    where "serverId" = ${normalizedServerId}
    limit 1
  `);

  const row = ((result as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? [])[0] ?? null;
  return normalizeConfigRow(normalizedServerId, row);
};

export const upsertServerBackupConfig = async (
  serverId: string,
  patch: ServerBackupConfigPatch & { lastBackupAt?: string | null }
): Promise<ServerBackupConfig> => {
  await ensureServerBackupSchema();

  const normalizedServerId = String(serverId ?? "").trim();
  const current = await getServerBackupConfig(normalizedServerId);

  const next = {
    ...current,
    destination: normalizeDestination(patch.destination ?? current.destination),
    fileNamePrefix: normalizeFilePrefix(patch.fileNamePrefix ?? current.fileNamePrefix),
    s3Endpoint: normalizeNullableString(patch.s3Endpoint ?? current.s3Endpoint),
    s3Region: normalizeNullableString(patch.s3Region ?? current.s3Region, 64),
    s3Bucket: normalizeNullableString(patch.s3Bucket ?? current.s3Bucket, 191),
    s3AccessKeyId: normalizeNullableString(patch.s3AccessKeyId ?? current.s3AccessKeyId),
    s3SecretAccessKey: normalizeNullableString(patch.s3SecretAccessKey ?? current.s3SecretAccessKey),
    s3Prefix: normalizeNullableString(patch.s3Prefix ?? current.s3Prefix),
    ftpHost: normalizeNullableString(patch.ftpHost ?? current.ftpHost, 255),
    ftpPort: normalizePort(patch.ftpPort ?? current.ftpPort),
    ftpSecure: normalizeBoolean(patch.ftpSecure ?? current.ftpSecure, false),
    ftpUsername: normalizeNullableString(patch.ftpUsername ?? current.ftpUsername, 191),
    ftpPassword: normalizeNullableString(patch.ftpPassword ?? current.ftpPassword),
    ftpBasePath: normalizeNullableString(patch.ftpBasePath ?? current.ftpBasePath),
    lastBackupAt: patch.lastBackupAt === undefined ? current.lastBackupAt : toIsoOrNull(patch.lastBackupAt),
  };

  await db.execute(sql`
    insert into "ServerBackupConfig" (
      "serverId",
      "destination",
      "fileNamePrefix",
      "s3Endpoint",
      "s3Region",
      "s3Bucket",
      "s3AccessKeyId",
      "s3SecretAccessKey",
      "s3Prefix",
      "ftpHost",
      "ftpPort",
      "ftpSecure",
      "ftpUsername",
      "ftpPassword",
      "ftpBasePath",
      "lastBackupAt",
      "createdAt",
      "updatedAt"
    )
    values (
      ${normalizedServerId},
      ${next.destination},
      ${next.fileNamePrefix},
      ${next.s3Endpoint},
      ${next.s3Region},
      ${next.s3Bucket},
      ${next.s3AccessKeyId},
      ${next.s3SecretAccessKey},
      ${next.s3Prefix},
      ${next.ftpHost},
      ${next.ftpPort},
      ${next.ftpSecure},
      ${next.ftpUsername},
      ${next.ftpPassword},
      ${next.ftpBasePath},
      ${next.lastBackupAt},
      now(),
      now()
    )
    on conflict ("serverId") do update set
      "destination" = excluded."destination",
      "fileNamePrefix" = excluded."fileNamePrefix",
      "s3Endpoint" = excluded."s3Endpoint",
      "s3Region" = excluded."s3Region",
      "s3Bucket" = excluded."s3Bucket",
      "s3AccessKeyId" = excluded."s3AccessKeyId",
      "s3SecretAccessKey" = excluded."s3SecretAccessKey",
      "s3Prefix" = excluded."s3Prefix",
      "ftpHost" = excluded."ftpHost",
      "ftpPort" = excluded."ftpPort",
      "ftpSecure" = excluded."ftpSecure",
      "ftpUsername" = excluded."ftpUsername",
      "ftpPassword" = excluded."ftpPassword",
      "ftpBasePath" = excluded."ftpBasePath",
      "lastBackupAt" = excluded."lastBackupAt",
      "updatedAt" = now()
  `);

  return getServerBackupConfig(normalizedServerId);
};

export const listServerBackups = async (serverId: string): Promise<ServerBackupRecord[]> => {
  await ensureServerBackupSchema();

  const normalizedServerId = String(serverId ?? "").trim();
  const result = await db.execute(sql`
    select
      "id",
      "serverId",
      "createdByProfileId",
      "destination",
      "fileName",
      "contentType",
      "sizeBytes",
      "status",
      "remotePath",
      "remoteUrl",
      "createdAt",
      "updatedAt"
    from "ServerBackupSnapshot"
    where "serverId" = ${normalizedServerId}
    order by "createdAt" desc
    limit 20
  `);

  const rows = (result as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? [];
  return rows.map(normalizeBackupRecord);
};

export const getServerBackupRecord = async (
  serverId: string,
  backupId: string
): Promise<ServerBackupRecordWithContent | null> => {
  await ensureServerBackupSchema();

  const normalizedServerId = String(serverId ?? "").trim();
  const normalizedBackupId = String(backupId ?? "").trim();
  const result = await db.execute(sql`
    select *
    from "ServerBackupSnapshot"
    where "serverId" = ${normalizedServerId}
      and "id" = ${normalizedBackupId}
    limit 1
  `);

  const row = ((result as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? [])[0] ?? null;
  if (!row) {
    return null;
  }

  return {
    ...normalizeBackupRecord(row),
    snapshotJson: String(row.snapshotJson ?? "{}"),
  };
};

const buildServerBackupPayload = async (serverId: string): Promise<{ payload: ServerBackupPayload; serverName: string }> => {
  await ensureChannelGroupSchema();
  await ensureServerRolesSchema();

  const serverRecord = await db.query.server.findFirst({
    where: (table, { eq }) => eq(table.id, serverId),
  });

  if (!serverRecord) {
    throw new Error("Server not found.");
  }

  const [banner, profileSettings, onboarding, ourBoard, inviteHistory, scheduledEvents] = await Promise.all([
    getServerBannerConfig(serverId),
    getServerProfileSettings(serverId),
    getServerOnboardingConfig(serverId),
    getOurBoardEntryByServerId(serverId),
    getServerInviteHistory(serverId),
    listServerScheduledEvents(serverId),
  ]);

  const [membersResult, channelGroupsResult, channelsResult, rolesResult, rolePermissionsResult, roleAssignmentsResult] = await Promise.all([
    db.execute(sql`
      select
        m."id" as "id",
        m."role" as "role",
        m."profileId" as "profileId",
        m."createdAt" as "joinedServerAt",
        u."name" as "profileName",
        u."email" as "email",
        coalesce(u."avatarUrl", u."avatar", u."icon") as "imageUrl",
        u."lastLogin" as "lastLogonAt"
      from "Member" m
      left join "Users" u on u."userId" = m."profileId"
      where m."serverId" = ${serverId}
      order by m."createdAt" asc, m."id" asc
    `),
    db.execute(sql`
      select
        g."id" as "id",
        g."name" as "name",
        g."icon" as "icon",
        g."sortOrder" as "sortOrder",
        g."createdAt" as "createdAt",
        g."updatedAt" as "updatedAt"
      from "ChannelGroup" g
      where g."serverId" = ${serverId}
      order by g."sortOrder" asc, g."createdAt" asc
    `),
    db.execute(sql`
      select
        c."id" as "id",
        c."name" as "name",
        c."icon" as "icon",
        c."type" as "type",
        c."channelGroupId" as "channelGroupId",
        c."sortOrder" as "sortOrder",
        c."isSystem" as "isSystem",
        c."createdAt" as "createdAt",
        c."updatedAt" as "updatedAt"
      from "Channel" c
      where c."serverId" = ${serverId}
      order by c."sortOrder" asc, c."createdAt" asc
    `),
    db.execute(sql`
      select
        r."id" as "id",
        r."name" as "name",
        r."color" as "color",
        r."iconUrl" as "iconUrl",
        r."isMentionable" as "isMentionable",
        r."showInOnlineMembers" as "showInOnlineMembers",
        r."position" as "position",
        r."isManaged" as "isManaged",
        r."createdAt" as "createdAt",
        r."updatedAt" as "updatedAt"
      from "ServerRole" r
      where r."serverId" = ${serverId}
      order by r."position" asc, r."createdAt" asc
    `),
    db.execute(sql`
      select p.*
      from "ServerRolePermission" p
      where p."serverId" = ${serverId}
      order by p."roleId" asc
    `),
    db.execute(sql`
      select
        a."roleId" as "roleId",
        a."memberId" as "memberId",
        a."serverId" as "serverId",
        a."createdAt" as "createdAt"
      from "ServerRoleAssignment" a
      where a."serverId" = ${serverId}
      order by a."createdAt" asc
    `),
  ]);

  const payload: ServerBackupPayload = {
    version: 1,
    source: "in-accord-server-backup",
    exportedAt: new Date().toISOString(),
    server: {
      id: serverRecord.id,
      name: serverRecord.name,
      imageUrl: serverRecord.imageUrl,
      inviteCode: serverRecord.inviteCode,
      ownerProfileId: serverRecord.profileId,
      createdAt: toIso(serverRecord.createdAt),
      updatedAt: toIso(serverRecord.updatedAt),
    },
    settings: {
      banner,
      profile: profileSettings,
      onboarding,
      ourBoard,
      inviteHistory,
      scheduledEvents,
    },
    members: ((membersResult as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? []).map((row) => ({
      id: String(row.id ?? ""),
      role: String(row.role ?? "GUEST"),
      profileId: String(row.profileId ?? ""),
      profileName: normalizeNullableString(row.profileName, 191),
      email: normalizeNullableString(row.email, 191),
      imageUrl: normalizeNullableString(row.imageUrl),
      joinedServerAt: toIsoOrNull(row.joinedServerAt),
      lastLogonAt: toIsoOrNull(row.lastLogonAt),
    })),
    structure: {
      channelGroups: ((channelGroupsResult as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? []).map((row) => ({
        id: String(row.id ?? ""),
        name: String(row.name ?? ""),
        icon: normalizeNullableString(row.icon, 32),
        sortOrder: Number(row.sortOrder ?? 0),
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
      })),
      channels: ((channelsResult as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? []).map((row) => ({
        id: String(row.id ?? ""),
        name: String(row.name ?? ""),
        icon: normalizeNullableString(row.icon, 32),
        type: String(row.type ?? "TEXT"),
        channelGroupId: normalizeNullableString(row.channelGroupId, 191),
        sortOrder: Number(row.sortOrder ?? 0),
        isSystem: normalizeBoolean(row.isSystem, false),
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
      })),
      roles: ((rolesResult as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? []).map((row) => ({
        id: String(row.id ?? ""),
        name: String(row.name ?? ""),
        color: String(row.color ?? "#99aab5"),
        iconUrl: normalizeNullableString(row.iconUrl),
        isMentionable: normalizeBoolean(row.isMentionable, true),
        showInOnlineMembers: normalizeBoolean(row.showInOnlineMembers, false),
        position: Number(row.position ?? 0),
        isManaged: normalizeBoolean(row.isManaged, false),
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
      })),
      rolePermissions: ((rolePermissionsResult as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? []).map((row) => ({
        ...row,
        updatedAt: toIso(row.updatedAt),
      })),
      roleAssignments: ((roleAssignmentsResult as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? []).map((row) => ({
        roleId: String(row.roleId ?? ""),
        memberId: String(row.memberId ?? ""),
        serverId: String(row.serverId ?? serverId),
        createdAt: toIso(row.createdAt),
      })),
    },
  };

  return {
    payload,
    serverName: serverRecord.name,
  };
};

const ensureS3DestinationReady = (config: ServerBackupConfig) => {
  if (!config.s3Endpoint || !config.s3Bucket || !config.s3AccessKeyId || !config.s3SecretAccessKey) {
    throw new Error("Third-party cloud backup requires endpoint, bucket, access key, and secret key.");
  }
};

const uploadBackupToS3 = async ({
  config,
  fileName,
  body,
}: {
  config: ServerBackupConfig;
  fileName: string;
  body: Buffer;
}) => {
  ensureS3DestinationReady(config);

  const client = new S3Client({
    region: config.s3Region || "auto",
    endpoint: config.s3Endpoint!,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.s3AccessKeyId!,
      secretAccessKey: config.s3SecretAccessKey!,
    },
  });

  const key = config.s3Prefix
    ? path.posix.join(config.s3Prefix.replace(/\\/g, "/"), fileName)
    : fileName;

  await client.send(
    new PutObjectCommand({
      Bucket: config.s3Bucket!,
      Key: key,
      Body: body,
      ContentType: "application/json",
    })
  );

  return {
    remotePath: `${config.s3Bucket}/${key}`,
    remoteUrl: null as string | null,
  };
};

const ensureFtpDestinationReady = (config: ServerBackupConfig) => {
  if (!config.ftpHost || !config.ftpUsername || !config.ftpPassword) {
    throw new Error("FTP backup requires host, username, and password.");
  }
};

const uploadBackupToFtp = async ({
  config,
  fileName,
  body,
}: {
  config: ServerBackupConfig;
  fileName: string;
  body: Buffer;
}) => {
  ensureFtpDestinationReady(config);

  const { Client } = await import("basic-ftp");
  const client = new Client();
  client.ftp.verbose = false;

  const basePath = (config.ftpBasePath || "/").replace(/\\/g, "/").trim() || "/";
  const normalizedBasePath = basePath.startsWith("/") ? basePath : `/${basePath}`;

  try {
    await client.access({
      host: config.ftpHost!,
      port: config.ftpPort,
      user: config.ftpUsername!,
      password: config.ftpPassword!,
      secure: config.ftpSecure,
    });

    await client.ensureDir(normalizedBasePath);
    await client.uploadFrom(Readable.from(body), fileName);
  } finally {
    client.close();
  }

  return {
    remotePath: path.posix.join(normalizedBasePath, fileName),
    remoteUrl: null as string | null,
  };
};

export const createServerBackup = async ({
  serverId,
  createdByProfileId,
  destinationOverride,
}: CreateServerBackupInput): Promise<ServerBackupRecordWithContent> => {
  await ensureServerBackupSchema();

  const config = await getServerBackupConfig(serverId);
  const destination = normalizeDestination(destinationOverride ?? config.destination);
  const createdAt = new Date();
  const { payload, serverName } = await buildServerBackupPayload(serverId);
  const snapshotJson = `${JSON.stringify(payload, null, 2)}\n`;
  const body = Buffer.from(snapshotJson, "utf8");
  const fileName = buildBackupFileName(config.fileNamePrefix, serverName, createdAt);

  let remotePath: string | null = null;
  let remoteUrl: string | null = null;

  if (destination === "S3") {
    const upload = await uploadBackupToS3({ config, fileName, body });
    remotePath = upload.remotePath;
    remoteUrl = upload.remoteUrl;
  } else if (destination === "FTP") {
    const upload = await uploadBackupToFtp({ config, fileName, body });
    remotePath = upload.remotePath;
    remoteUrl = upload.remoteUrl;
  }

  const backupId = randomUUID();

  await db.execute(sql`
    insert into "ServerBackupSnapshot" (
      "id",
      "serverId",
      "createdByProfileId",
      "destination",
      "fileName",
      "contentType",
      "sizeBytes",
      "status",
      "snapshotJson",
      "remotePath",
      "remoteUrl",
      "createdAt",
      "updatedAt"
    )
    values (
      ${backupId},
      ${serverId},
      ${createdByProfileId},
      ${destination},
      ${fileName},
      ${"application/json"},
      ${body.byteLength},
      ${"READY"},
      ${snapshotJson},
      ${remotePath},
      ${remoteUrl},
      ${createdAt.toISOString()},
      ${createdAt.toISOString()}
    )
  `);

  await upsertServerBackupConfig(serverId, { lastBackupAt: createdAt.toISOString() });

  const backup = await getServerBackupRecord(serverId, backupId);
  if (!backup) {
    throw new Error("Backup completed but could not be loaded.");
  }

  return backup;
};
