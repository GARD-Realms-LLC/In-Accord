import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

import * as schema from "@/lib/db/schema";

declare global {
  // eslint-disable-next-line no-var
  var mysqlPool: mysql.Pool | undefined;
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const pool =
  globalThis.mysqlPool ||
  mysql.createPool({
    uri: process.env.DATABASE_URL,
    connectionLimit: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.mysqlPool = pool;
}

export const db = drizzle(pool, { schema, mode: "default" });

export {
  channel,
  ChannelType,
  conversation,
  directMessage,
  member,
  MemberRole,
  message,
  profile,
  server,
  type Channel,
  type Conversation,
  type DirectMessage,
  type Member,
  type Message,
  type Profile,
  type Server,
  channelTypeValues,
  memberRoleValues,
} from "@/lib/db/schema";