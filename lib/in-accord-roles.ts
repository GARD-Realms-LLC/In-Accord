import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export type InAccordRole = {
  roleKey: string;
  roleLabel: string;
  isSystem: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

const SYSTEM_ROLES = [
  { roleKey: "USER", roleLabel: "User" },
  { roleKey: "ADMINISTRATOR", roleLabel: "Administrator" },
  { roleKey: "DEVELOPER", roleLabel: "Developer" },
  { roleKey: "MODERATOR", roleLabel: "Moderator" },
] as const;

const SYSTEM_ROLE_KEYS = new Set<string>(SYSTEM_ROLES.map((role) => role.roleKey));

const coerceCanonicalBaseRole = (normalized: string) => {
  if (
    normalized === "ADMIN" ||
    normalized === "ADMINISTRATOR" ||
    normalized === "IN-ACCORD ADMINISTRATOR" ||
    normalized === "IN_ACCORD_ADMINISTRATOR"
  ) {
    return "ADMINISTRATOR";
  }

  if (
    normalized === "MOD" ||
    normalized === "MODERATOR" ||
    normalized === "IN-ACCORD MODERATOR" ||
    normalized === "IN_ACCORD_MODERATOR"
  ) {
    return "MODERATOR";
  }

  if (
    normalized === "DEVELOPER" ||
    normalized === "IN-ACCORD DEVELOPER" ||
    normalized === "IN_ACCORD_DEVELOPER"
  ) {
    return "DEVELOPER";
  }

  if (normalized === "USER") {
    return "USER";
  }

  return null;
};

export const normalizeRoleKey = (value: unknown) => {
  const raw = String(value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");

  if (!raw) {
    return null;
  }

  const canonicalBaseRole = coerceCanonicalBaseRole(raw);
  if (canonicalBaseRole) {
    return canonicalBaseRole;
  }

  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(raw)) {
    return null;
  }

  return raw;
};

export const formatRoleLabel = (roleKey: string) =>
  roleKey
    .split("_")
    .filter(Boolean)
    .map((token) => token.slice(0, 1) + token.slice(1).toLowerCase())
    .join(" ") || roleKey;

export const isSystemRoleKey = (roleKey: string) => SYSTEM_ROLE_KEYS.has(roleKey);

export const ensureInAccordRoleSchema = async () => {
  await db.execute(sql`
    create table if not exists "InAccordRole" (
      "roleKey" varchar(64) primary key,
      "roleLabel" varchar(80) not null,
      "isSystem" boolean not null default false,
      "createdAt" timestamp(3) not null default now(),
      "updatedAt" timestamp(3) not null default now()
    )
  `);

  await db.execute(sql`
    alter table "InAccordRole"
    add column if not exists "roleLabel" varchar(80)
  `);

  await db.execute(sql`
    alter table "InAccordRole"
    add column if not exists "isSystem" boolean not null default false
  `);

  await db.execute(sql`
    alter table "InAccordRole"
    add column if not exists "createdAt" timestamp(3) not null default now()
  `);

  await db.execute(sql`
    alter table "InAccordRole"
    add column if not exists "updatedAt" timestamp(3) not null default now()
  `);

  for (const role of SYSTEM_ROLES) {
    await db.execute(sql`
      insert into "InAccordRole" ("roleKey", "roleLabel", "isSystem")
      values (${role.roleKey}, ${role.roleLabel}, true)
      on conflict ("roleKey") do update
      set "roleLabel" = excluded."roleLabel",
          "isSystem" = true,
          "updatedAt" = now()
    `);
  }
};

export const getInAccordRoles = async (): Promise<InAccordRole[]> => {
  await ensureInAccordRoleSchema();

  const result = await db.execute(sql`
    select
      r."roleKey" as "roleKey",
      r."roleLabel" as "roleLabel",
      r."isSystem" as "isSystem",
      r."createdAt" as "createdAt",
      r."updatedAt" as "updatedAt"
    from "InAccordRole" r
    order by r."isSystem" desc, r."roleKey" asc
  `);

  const rows = (result as unknown as {
    rows?: Array<{
      roleKey: string;
      roleLabel: string | null;
      isSystem: boolean | null;
      createdAt: Date | string | null;
      updatedAt: Date | string | null;
    }>;
  }).rows ?? [];

  return rows.map((row) => ({
    roleKey: normalizeRoleKey(row.roleKey) ?? "USER",
    roleLabel: String(row.roleLabel ?? "").trim() || formatRoleLabel(normalizeRoleKey(row.roleKey) ?? "USER"),
    isSystem: Boolean(row.isSystem),
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  }));
};
