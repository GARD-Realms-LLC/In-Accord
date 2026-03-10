import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export const ensureServerRolesSchema = async () => {
  await db.execute(sql`
    create table if not exists "ServerRole" (
      "id" varchar(191) primary key,
      "serverId" varchar(191) not null,
      "name" varchar(100) not null,
      "color" varchar(32) not null default '#99aab5',
      "iconUrl" text,
      "isMentionable" boolean not null default true,
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
    alter table "ServerRole"
    add column if not exists "isMentionable" boolean not null default true
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

  await db.execute(sql`
    create table if not exists "ServerRolePermission" (
      "roleId" varchar(191) not null,
      "serverId" varchar(191) not null,
      "allowView" boolean not null default true,
      "allowSend" boolean not null default true,
      "allowConnect" boolean not null default true,
      "manageChannels" boolean not null default false,
      "manageRoles" boolean not null default false,
      "manageMembers" boolean not null default false,
      "moderateMembers" boolean not null default false,
      "viewAuditLog" boolean not null default false,
      "manageServer" boolean not null default false,
      "createInstantInvite" boolean not null default false,
      "changeNickname" boolean not null default false,
      "manageNicknames" boolean not null default false,
      "kickMembers" boolean not null default false,
      "banMembers" boolean not null default false,
      "manageEmojisAndStickers" boolean not null default false,
      "manageWebhooks" boolean not null default false,
      "manageEvents" boolean not null default false,
      "viewServerInsights" boolean not null default false,
      "useApplicationCommands" boolean not null default false,
      "sendMessagesInThreads" boolean not null default false,
      "createPublicThreads" boolean not null default false,
      "createPrivateThreads" boolean not null default false,
      "embedLinks" boolean not null default false,
      "attachFiles" boolean not null default false,
      "addReactions" boolean not null default false,
      "useExternalEmojis" boolean not null default false,
      "mentionEveryone" boolean not null default false,
      "manageMessages" boolean not null default false,
      "readMessageHistory" boolean not null default false,
      "sendTtsMessages" boolean not null default false,
      "speak" boolean not null default false,
      "stream" boolean not null default false,
      "useVoiceActivity" boolean not null default false,
      "prioritySpeaker" boolean not null default false,
      "muteMembers" boolean not null default false,
      "deafenMembers" boolean not null default false,
      "moveMembers" boolean not null default false,
      "requestToSpeak" boolean not null default false,
      "updatedAt" timestamp not null,
      primary key ("roleId")
    )
  `);

  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "viewAuditLog" boolean not null default false`);
  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "manageServer" boolean not null default false`);
  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "createInstantInvite" boolean not null default false`);
  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "changeNickname" boolean not null default false`);
  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "manageNicknames" boolean not null default false`);
  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "kickMembers" boolean not null default false`);
  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "banMembers" boolean not null default false`);
  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "manageEmojisAndStickers" boolean not null default false`);
  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "manageWebhooks" boolean not null default false`);
  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "manageEvents" boolean not null default false`);
  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "viewServerInsights" boolean not null default false`);
  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "useApplicationCommands" boolean not null default false`);
  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "sendMessagesInThreads" boolean not null default false`);
  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "createPublicThreads" boolean not null default false`);
  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "createPrivateThreads" boolean not null default false`);
  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "embedLinks" boolean not null default false`);
  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "attachFiles" boolean not null default false`);
  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "addReactions" boolean not null default false`);
  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "useExternalEmojis" boolean not null default false`);
  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "mentionEveryone" boolean not null default false`);
  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "manageMessages" boolean not null default false`);
  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "readMessageHistory" boolean not null default false`);
  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "sendTtsMessages" boolean not null default false`);
  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "speak" boolean not null default false`);
  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "stream" boolean not null default false`);
  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "useVoiceActivity" boolean not null default false`);
  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "prioritySpeaker" boolean not null default false`);
  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "muteMembers" boolean not null default false`);
  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "deafenMembers" boolean not null default false`);
  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "moveMembers" boolean not null default false`);
  await db.execute(sql`alter table "ServerRolePermission" add column if not exists "requestToSpeak" boolean not null default false`);

  await db.execute(sql`
    create index if not exists "ServerRolePermission_serverId_idx"
    on "ServerRolePermission" ("serverId")
  `);

  await db.execute(sql`
    insert into "ServerRolePermission" (
      "roleId",
      "serverId",
      "allowView",
      "allowSend",
      "allowConnect",
      "manageChannels",
      "manageRoles",
      "manageMembers",
      "moderateMembers",
      "viewAuditLog",
      "manageServer",
      "createInstantInvite",
      "changeNickname",
      "manageNicknames",
      "kickMembers",
      "banMembers",
      "manageEmojisAndStickers",
      "manageWebhooks",
      "manageEvents",
      "viewServerInsights",
      "useApplicationCommands",
      "sendMessagesInThreads",
      "createPublicThreads",
      "createPrivateThreads",
      "embedLinks",
      "attachFiles",
      "addReactions",
      "useExternalEmojis",
      "mentionEveryone",
      "manageMessages",
      "readMessageHistory",
      "sendTtsMessages",
      "speak",
      "stream",
      "useVoiceActivity",
      "prioritySpeaker",
      "muteMembers",
      "deafenMembers",
      "moveMembers",
      "requestToSpeak",
      "updatedAt"
    )
    select
      r."id",
      r."serverId",
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      now()
    from "ServerRole" r
    left join "ServerRolePermission" p
      on p."roleId" = r."id"
     and p."serverId" = r."serverId"
    where p."roleId" is null
  `);

  await db.execute(sql`
    delete from "ServerRoleAssignment" a
    using "ServerRole" r
    where a."roleId" = r."id"
      and a."serverId" = r."serverId"
      and r."isManaged" = true
      and lower(trim(coalesce(r."name", ''))) in ('admin', 'moderator', 'guest')
  `);

  await db.execute(sql`
    delete from "ServerRole" r
    where r."isManaged" = true
      and lower(trim(coalesce(r."name", ''))) in ('admin', 'moderator', 'guest')
  `);

  await db.execute(sql`
    delete from "ServerRolePermission" p
    where not exists (
      select 1
      from "ServerRole" r
      where r."id" = p."roleId"
        and r."serverId" = p."serverId"
    )
  `);
};
