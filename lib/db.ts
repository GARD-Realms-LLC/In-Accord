import "server-only";

import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import type { PoolClient } from "pg";

import "@/lib/silence-server-console";

import { executeD1Query } from "@/lib/d1-runtime";
import * as schema from "@/lib/db/schema";

const sqliteExecutor = (query: string, params: unknown[], method: "run" | "all" | "values" | "get") =>
  executeD1Query(query, params, method) as Promise<{ rows: unknown[] }>;

let sqliteDb: SqliteRemoteDatabase<typeof schema> | null = null;

type D1Database = Omit<SqliteRemoteDatabase<typeof schema>, "transaction"> & {
  execute: (query: unknown) => Promise<{ rows: unknown[] }>;
  transaction: <TResult>(
    callback: (tx: D1Database) => Promise<TResult>,
    config?: unknown,
  ) => Promise<TResult>;
};

const wrapDatabaseScope = <TScope extends object>(scope: TScope): TScope =>
  new Proxy(scope, {
    get(target, property, receiver) {
      if (property === "execute") {
        return async (query: unknown) => {
          try {
            const rows = await (target as { all: (queryInput: unknown) => Promise<unknown[]> }).all(query);
            return { rows: Array.isArray(rows) ? rows : [] };
          } catch {
            const result = await (target as { run: (queryInput: unknown) => Promise<{ rows?: unknown[]; results?: unknown[] }> }).run(query);
            return { rows: result.rows ?? result.results ?? [] };
          }
        };
      }

      if (property === "transaction") {
        const transaction = Reflect.get(target, property, receiver);
        if (typeof transaction !== "function") {
          return transaction;
        }

        return async (
          callback: (tx: TScope) => Promise<unknown>,
          config?: unknown,
        ) => transaction.call(
          target,
          async (innerScope: TScope) => callback(wrapDatabaseScope(innerScope)),
          config,
        );
      }

      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

type UnsupportedPostgresPool = {
  connect: () => Promise<PoolClient>;
  query: (...args: unknown[]) => Promise<unknown>;
};

type RuntimeDb = any;

export const pool: UnsupportedPostgresPool = new Proxy({} as UnsupportedPostgresPool, {
  get() {
    throw new Error("PostgreSQL pool is unavailable. In-Accord now uses Cloudflare D1.");
  },
});

export const db = new Proxy({} as D1Database, {
  get(_target, property, receiver) {
    const target = wrapDatabaseScope(
      sqliteDb ?? (sqliteDb = drizzle(sqliteExecutor, { schema })),
    );
    const value = Reflect.get(target, property, receiver);
    return typeof value === "function" ? value.bind(target) : value;
  },
}) as RuntimeDb;

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