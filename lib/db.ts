import "server-only";

import type { SQLWrapper } from "drizzle-orm";
import type { AsyncRemoteCallback } from "drizzle-orm/sqlite-proxy";
import { drizzle } from "drizzle-orm/sqlite-proxy";

import "@/lib/silence-server-console";

import { executeD1Query } from "@/lib/d1-runtime";
import * as schema from "@/lib/db/schema";

declare global {
  // eslint-disable-next-line no-var
  var inAccordRawD1Db: DrizzleDbInstance | undefined;
}

const remoteCallback: AsyncRemoteCallback = (query, params, method) =>
  executeD1Query(query, params, method) as unknown as Promise<{ rows: any[] }>;

const createDb = () => drizzle(remoteCallback, { schema });

type DrizzleDbInstance = ReturnType<typeof createDb>;
type DrizzleTransactionInstance = DrizzleDbInstance extends {
  transaction: (callback: (tx: infer TTransaction) => Promise<unknown>, config?: infer TConfig) => Promise<unknown>;
}
  ? TTransaction
  : never;
type DrizzleTransactionConfig = Parameters<DrizzleDbInstance["transaction"]>[1];
type DbExecuteResult<TRow extends Record<string, unknown> = Record<string, unknown>> = {
  rows: TRow[];
};
type ExecuteCompat = <TRow extends Record<string, unknown> = Record<string, unknown>>(
  query: SQLWrapper | string,
) => Promise<DbExecuteResult<TRow>>;
type DbTransactionInstance = Omit<DrizzleTransactionInstance, "transaction"> & {
  execute: ExecuteCompat;
  transaction: <TResult>(
    callback: (tx: DbTransactionInstance) => Promise<TResult>,
    config?: DrizzleTransactionConfig,
  ) => Promise<TResult>;
};
type DbInstance = Omit<DrizzleDbInstance, "transaction"> & {
  execute: ExecuteCompat;
  transaction: <TResult>(
    callback: (tx: DbTransactionInstance) => Promise<TResult>,
    config?: DrizzleTransactionConfig,
  ) => Promise<TResult>;
};

let cachedDb: DrizzleDbInstance | null = null;

const getDb = () => {
  if (cachedDb) {
    return cachedDb;
  }

  if (globalThis.inAccordRawD1Db) {
    cachedDb = globalThis.inAccordRawD1Db;
    return cachedDb;
  }

  cachedDb = createDb();

  if (process.env.NODE_ENV !== "production") {
    globalThis.inAccordRawD1Db = cachedDb;
  }

  return cachedDb;
};

const isQueryExpectedToReturnRows = (query: SQLWrapper | string) => {
  const rawSql =
    typeof query === "string"
      ? query
      : ((getDb() as unknown as {
          dialect?: {
            sqlToQuery?: (value: ReturnType<SQLWrapper["getSQL"]>) => {
              sql?: string;
            };
          };
        }).dialect?.sqlToQuery?.(query.getSQL()).sql ?? "");
  const normalized = rawSql.trim().toLowerCase();

  return (
    /^(select|with|pragma|explain)\b/.test(normalized) ||
    /\breturning\b/.test(normalized)
  );
};

const executeCompatQueryAgainst = async <TRow extends Record<string, unknown> = Record<string, unknown>>(
  target: Pick<DrizzleDbInstance, "all" | "run">,
  query: SQLWrapper | string,
): Promise<DbExecuteResult<TRow>> => {
  if (isQueryExpectedToReturnRows(query)) {
    return {
      rows: (await target.all(query)) as TRow[],
    };
  }

  await target.run(query);
  return { rows: [] };
};

const executeCompatQuery: ExecuteCompat = (query) =>
  executeCompatQueryAgainst(getDb() as DrizzleDbInstance, query);

const wrapTransaction = (transaction: DrizzleTransactionInstance): DbTransactionInstance =>
  new Proxy(transaction as unknown as DbTransactionInstance, {
    get(target, property, receiver) {
      if (property === "execute") {
        return (query: SQLWrapper | string) => executeCompatQueryAgainst(target, query);
      }

      if (property === "transaction") {
        return async <TResult>(
          callback: (tx: DbTransactionInstance) => Promise<TResult>,
          config?: DrizzleTransactionConfig,
        ) =>
          (target as unknown as DrizzleTransactionInstance).transaction(
            (nestedTransaction) => callback(wrapTransaction(nestedTransaction)),
            config,
          );
      }

      const value = Reflect.get(target as unknown as Record<PropertyKey, unknown>, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

export const db = new Proxy({} as DbInstance, {
  get(_target, property, receiver) {
    if (property === "execute") {
      return executeCompatQuery;
    }

    if (property === "transaction") {
      return async <TResult>(
        callback: (tx: DbTransactionInstance) => Promise<TResult>,
        config?: DrizzleTransactionConfig,
      ) => {
        const target = getDb() as DrizzleDbInstance;
        return target.transaction((transaction) => callback(wrapTransaction(transaction)), config);
      };
    }

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
