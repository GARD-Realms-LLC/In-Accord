import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import "@/lib/silence-server-console";

import {
  getEffectiveDatabaseConnectionString,
} from "@/lib/database-runtime-control";
import * as schema from "@/lib/db/schema";

declare global {
  // eslint-disable-next-line no-var
  var pgPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var pgPoolConnectionString: string | undefined;
}

const createDb = (pool: Pool) => drizzle(pool, { schema });

type DbInstance = ReturnType<typeof createDb>;

let cachedPool: Pool | null = null;
let cachedDb: DbInstance | null = null;
let cachedConnectionString: string | null = null;

const getConnectionString = () => {
  return getEffectiveDatabaseConnectionString();
};

const getPool = () => {
  const connectionString = getConnectionString();

  if (cachedPool && cachedConnectionString === connectionString) {
    return cachedPool;
  }

  if (
    globalThis.pgPool &&
    globalThis.pgPoolConnectionString === connectionString
  ) {
    cachedPool = globalThis.pgPool;
    cachedConnectionString = connectionString;
    return cachedPool;
  }

  const previousPool =
    cachedPool ??
    (globalThis.pgPoolConnectionString !== connectionString
      ? globalThis.pgPool
      : null);
  const pooled = new Pool({
    connectionString,
    max: 10,
  });

  if (process.env.NODE_ENV !== "production") {
    globalThis.pgPool = pooled;
    globalThis.pgPoolConnectionString = connectionString;
  }

  cachedPool = pooled;
  cachedDb = null;
  cachedConnectionString = connectionString;

  if (previousPool && previousPool !== pooled) {
    const closablePool = previousPool as unknown as {
      end?: () => Promise<void> | void;
    };
    const endResult = closablePool.end?.();
    if (endResult && typeof (endResult as Promise<void>).catch === "function") {
      void (endResult as Promise<void>).catch(() => undefined);
    }
  }

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
