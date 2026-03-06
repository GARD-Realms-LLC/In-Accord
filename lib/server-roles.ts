import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

let serverRolesSchemaReady = false;

export const ensureServerRolesSchema = async () => {
  if (serverRolesSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "ServerRole" (
      "id" varchar(191) primary key,
      "serverId" varchar(191) not null,
      "name" varchar(100) not null,
      "color" varchar(32) not null default '#99aab5',
      "iconUrl" text,
      "position" integer not null default 0,
      "isManaged" boolean not null default false,
      "createdAt" timestamp not null,
      "updatedAt" timestamp not null
    )
  `);

  await db.execute(sql`
    alter table "ServerRole"
    add column if not exists "iconUrl" text
  `);

  await db.execute(sql`
    create index if not exists "ServerRole_serverId_idx"
    on "ServerRole" ("serverId")
  `);

  await db.execute(sql`
    create index if not exists "ServerRole_serverId_position_idx"
    on "ServerRole" ("serverId", "position")
  `);

  await db.execute(sql`
    create unique index if not exists "ServerRole_serverId_name_uq"
    on "ServerRole" ("serverId", lower(trim(coalesce("name", ''))))
  `);

  await db.execute(sql`
    create table if not exists "ServerRoleAssignment" (
      "roleId" varchar(191) not null,
      "memberId" varchar(191) not null,
      "serverId" varchar(191) not null,
      "createdAt" timestamp not null,
      primary key ("roleId", "memberId")
    )
  `);

  await db.execute(sql`
    create index if not exists "ServerRoleAssignment_serverId_idx"
    on "ServerRoleAssignment" ("serverId")
  `);

  await db.execute(sql`
    create index if not exists "ServerRoleAssignment_memberId_idx"
    on "ServerRoleAssignment" ("memberId")
  `);

  serverRolesSchemaReady = true;
};

export const seedDefaultServerRoles = async (serverId: string) => {
  await db.execute(sql`
    insert into "ServerRole" (
      "id",
      "serverId",
      "name",
      "color",
      "iconUrl",
      "position",
      "isManaged",
      "createdAt",
      "updatedAt"
    )
    values
      (${`${serverId}:admin`}, ${serverId}, 'Admin', '#f23f43', null, 1, true, now(), now()),
      (${`${serverId}:moderator`}, ${serverId}, 'Moderator', '#5865f2', null, 2, true, now(), now()),
      (${`${serverId}:guest`}, ${serverId}, 'Guest', '#99aab5', null, 3, true, now(), now())
    on conflict ("id") do nothing
  `);
};
