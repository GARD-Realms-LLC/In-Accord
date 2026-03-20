import "server-only";

import { drizzle } from "drizzle-orm/sqlite-proxy";
import type { SQLWrapper } from "drizzle-orm";
import type { AsyncRemoteCallback } from "drizzle-orm/sqlite-proxy";

import "@/lib/silence-server-console";

import { executeD1Query } from "@/lib/d1-runtime";
import * as schema from "@/lib/db/schema";

const d1Callback = ((query, params, method) =>
  executeD1Query(query, params, method)) as AsyncRemoteCallback;

const createDb = () =>
  drizzle(d1Callback, {
    schema,
  });

type RawExecuteResult = { rows: Array<Record<string, unknown>> };
type BaseDbInstance = ReturnType<typeof createDb>;
type BaseTransaction = Parameters<BaseDbInstance["transaction"]>[0] extends (
  tx: infer TTransaction,
  ...args: never[]
) => unknown
  ? TTransaction
  : never;
type ExecuteCapableTransaction = BaseTransaction & {
  execute: (query: SQLWrapper | string) => Promise<RawExecuteResult>;
};
type DbInstance = Omit<BaseDbInstance, "transaction"> & {
  execute: (query: SQLWrapper | string) => Promise<RawExecuteResult>;
  transaction: <TResult>(
    callback: (
      tx: ExecuteCapableTransaction,
    ) => TResult | Promise<TResult>,
    config?: Parameters<BaseDbInstance["transaction"]>[1],
  ) => Promise<TResult>;
};

let cachedDb: DbInstance | null = null;

const getDb = () => {
  if (cachedDb) {
    return cachedDb;
  }

  cachedDb = createDb() as unknown as DbInstance;
  return cachedDb;
};

const buildExecuteMethod = (target: {
  all: (queryValue: SQLWrapper | string) => Promise<unknown>;
  run: (queryValue: SQLWrapper | string) => Promise<{
    rows?: Array<Record<string, unknown>>;
    results?: Array<Record<string, unknown>>;
  }>;
}) => {
  return async (query: SQLWrapper | string): Promise<RawExecuteResult> => {
    try {
      const rows = await target.all(query);
      return {
        rows: Array.isArray(rows)
          ? (rows as Array<Record<string, unknown>>)
          : [],
      };
    } catch {
      const result = await target.run(query);
      return {
        rows: result.rows ?? result.results ?? [],
      };
    }
  };
};

const wrapExecuteCompatibleTarget = <TTarget extends object>(target: TTarget) =>
  new Proxy(target as TTarget & {
    execute: (query: SQLWrapper | string) => Promise<RawExecuteResult>;
    transaction?: (
      callback: (tx: unknown) => Promise<unknown>,
      config?: unknown,
    ) => Promise<unknown>;
  }, {
    get(currentTarget, property, receiver) {
      if (property === "execute") {
        return buildExecuteMethod(currentTarget as never);
      }

      if (property === "transaction") {
        const transactionMethod = Reflect.get(currentTarget, property, receiver);
        if (typeof transactionMethod !== "function") {
          return transactionMethod;
        }

        return async (
          callback: (tx: unknown) => Promise<unknown>,
          config?: unknown,
        ) =>
          transactionMethod.call(
            currentTarget,
            async (tx: unknown) => callback(wrapExecuteCompatibleTarget(tx as object)),
            config,
          );
      }

      const value = Reflect.get(currentTarget, property, receiver);
      return typeof value === "function" ? value.bind(currentTarget) : value;
    },
  });

export const pool = new Proxy({} as Record<PropertyKey, never>, {
  get() {
    throw new Error(
      "PostgreSQL pool is unavailable. In-Accord now uses Cloudflare D1.",
    );
  },
}) as never;

export const db = new Proxy({} as DbInstance, {
  get(_target, property, receiver) {
    const target = wrapExecuteCompatibleTarget(getDb());
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
