import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import "@/lib/silence-server-console";

import * as schema from "@/lib/db/schema";

declare global {
  // eslint-disable-next-line no-var
  var pgPool: Pool | undefined;
}

const createDb = (pool: Pool) => drizzle(pool, { schema });

type DbInstance = ReturnType<typeof createDb>;

let cachedPool: Pool | null = null;
let cachedDb: DbInstance | null = null;

const getConnectionString = () => {
  const liveDatabaseUrl = process.env.LIVE_DATABASE_URL?.trim();
  const connectionString =
    liveDatabaseUrl && !/^replace_/i.test(liveDatabaseUrl)
      ? liveDatabaseUrl
      : "";

  if (!connectionString) {
    throw new Error("No database URL configured. Set LIVE_DATABASE_URL for the shared live PostgreSQL database.");
  }

  return connectionString;
};

const getPool = () => {
  if (cachedPool) {
    return cachedPool;
  }

  const pooled =
    globalThis.pgPool ||
    new Pool({
      connectionString: getConnectionString(),
      max: 10,
    });

  if (process.env.NODE_ENV !== "production") {
    globalThis.pgPool = pooled;
  }

  cachedPool = pooled;
  return cachedPool;
};

const getDb = () => {
  if (cachedDb) {
    return cachedDb;
  }

  cachedDb = createDb(getPool());
  return cachedDb;
};

export const pool = new Proxy({} as Pool, {
  get(_target, property, receiver) {
    const target = getPool() as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(target, property, receiver);
    return typeof value === "function" ? value.bind(target) : value;
  },
}) as Pool;

export const db = new Proxy({} as DbInstance, {
  get(_target, property, receiver) {
    const target = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(target, property, receiver);
    return typeof value === "function" ? value.bind(target) : value;
  },
}) as DbInstance;

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
