import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import "@/lib/silence-server-console";

import * as schema from "@/lib/db/schema";

declare global {
  // eslint-disable-next-line no-var
  var pgPool: Pool | undefined;
}

const liveDatabaseUrl = process.env.LIVE_DATABASE_URL?.trim();

const connectionString =
  liveDatabaseUrl && !/^replace_/i.test(liveDatabaseUrl)
    ? liveDatabaseUrl
    : "";

if (!connectionString) {
  throw new Error("No database URL configured. Set LIVE_DATABASE_URL for the shared live PostgreSQL database.");
}

const pool =
  globalThis.pgPool ||
  new Pool({
    connectionString,
    max: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.pgPool = pool;
}

export const db = drizzle(pool, { schema });
export { pool };

export {
  channel,
  ChannelType,
  conversation,
  directMessage,
  localCredential,
  member,
  MemberRole,
  message,
  profile,
  server,
  type Channel,
  type Conversation,
  type DirectMessage,
  type LocalCredential,
  type Member,
  type Message,
  type Profile,
  type Server,
  channelTypeValues,
  memberRoleValues,
} from "@/lib/db/schema";