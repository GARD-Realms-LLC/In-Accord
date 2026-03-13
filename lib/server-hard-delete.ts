import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

const SQL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ACCOUNT_TABLE_BLOCKLIST = new Set(["Users", "UserProfile", "LocalCredential"]);

const quoteIdentifier = (identifier: string) => {
  if (!SQL_IDENTIFIER.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }

  return `"${identifier}"`;
};

const listTablesWithColumn = async (columnName: string) => {
  const result = await db.execute(sql`
    select c.table_name as "tableName"
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name = ${columnName}
    order by c.table_name asc
  `);

  return ((result as unknown as { rows?: Array<{ tableName: string | null }> }).rows ?? [])
    .map((row) => String(row.tableName ?? "").trim())
    .filter((name) => SQL_IDENTIFIER.test(name));
};

const deleteByIds = async ({
  tableName,
  columnName,
  ids,
}: {
  tableName: string;
  columnName: string;
  ids: string[];
}) => {
  if (ids.length === 0) {
    return;
  }

  await db.execute(sql`
    delete from ${sql.raw(quoteIdentifier(tableName))}
    where ${sql.raw(quoteIdentifier(columnName))} in (${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `
    )})
  `);
};

const selectIdsByServer = async ({
  tableName,
  idColumn,
  serverId,
}: {
  tableName: string;
  idColumn: string;
  serverId: string;
}) => {
  const result = await db.execute(sql`
    select ${sql.raw(quoteIdentifier(idColumn))} as "id"
    from ${sql.raw(quoteIdentifier(tableName))}
    where "serverId" = ${serverId}
  `);

  return ((result as unknown as { rows?: Array<{ id: string | null }> }).rows ?? [])
    .map((row) => String(row.id ?? "").trim())
    .filter(Boolean);
};

export const hardDeleteServerScopedData = async (serverId: string) => {
  const normalizedServerId = String(serverId ?? "").trim();
  if (!normalizedServerId) {
    return;
  }

  const [serverIdTables, channelIdTables, memberIdTables, threadIdTables, conversationIdTables] =
    await Promise.all([
      listTablesWithColumn("serverId"),
      listTablesWithColumn("channelId"),
      listTablesWithColumn("memberId"),
      listTablesWithColumn("threadId"),
      listTablesWithColumn("conversationId"),
    ]);

  const serverIdTableSet = new Set(serverIdTables);

  const channelIds = serverIdTableSet.has("Channel")
    ? await selectIdsByServer({
        tableName: "Channel",
        idColumn: "id",
        serverId: normalizedServerId,
      })
    : [];

  const memberIds = serverIdTableSet.has("Member")
    ? await selectIdsByServer({
        tableName: "Member",
        idColumn: "id",
        serverId: normalizedServerId,
      })
    : [];

  const threadIds = serverIdTableSet.has("ChannelThread")
    ? await selectIdsByServer({
        tableName: "ChannelThread",
        idColumn: "id",
        serverId: normalizedServerId,
      })
    : [];

  let conversationIds: string[] = [];
  if (serverIdTableSet.has("Conversation") && memberIds.length > 0) {
    const conversationsResult = await db.execute(sql`
      select "id"
      from "Conversation"
      where "memberOneId" in (${sql.join(memberIds.map((id) => sql`${id}`), sql`, `)})
         or "memberTwoId" in (${sql.join(memberIds.map((id) => sql`${id}`), sql`, `)})
    `);

    conversationIds = ((conversationsResult as unknown as { rows?: Array<{ id: string | null }> }).rows ?? [])
      .map((row) => String(row.id ?? "").trim())
      .filter(Boolean);
  }

  for (const tableName of threadIdTables) {
    if (tableName === "ChannelThread") {
      continue;
    }

    await deleteByIds({
      tableName,
      columnName: "threadId",
      ids: threadIds,
    });
  }

  for (const tableName of conversationIdTables) {
    if (tableName === "Conversation") {
      continue;
    }

    await deleteByIds({
      tableName,
      columnName: "conversationId",
      ids: conversationIds,
    });
  }

  for (const tableName of channelIdTables) {
    if (tableName === "Channel") {
      continue;
    }

    await deleteByIds({
      tableName,
      columnName: "channelId",
      ids: channelIds,
    });
  }

  for (const tableName of memberIdTables) {
    if (tableName === "Member") {
      continue;
    }

    await deleteByIds({
      tableName,
      columnName: "memberId",
      ids: memberIds,
    });
  }

  if (conversationIds.length > 0 && serverIdTableSet.has("Conversation")) {
    await db.execute(sql`
      delete from "Conversation"
      where "id" in (${sql.join(conversationIds.map((id) => sql`${id}`), sql`, `)})
    `);
  }

  for (const tableName of serverIdTables) {
    if (tableName === "Server") {
      continue;
    }

    if (ACCOUNT_TABLE_BLOCKLIST.has(tableName)) {
      continue;
    }

    await db.execute(sql`
      delete from ${sql.raw(quoteIdentifier(tableName))}
      where "serverId" = ${normalizedServerId}
    `);
  }
};
