import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export type AuthIntegrityIssueCode =
  | "ok"
  | "missing-users-for-profiles"
  | "missing-users-for-credentials";

export type AuthIntegrityStatus = {
  ok: boolean;
  code: AuthIntegrityIssueCode;
  message: string;
  stats: {
    users: number;
    userProfiles: number;
    localCredentials: number;
    orphanUserProfiles: number;
    orphanLocalCredentials: number;
  };
};

type AuthIntegrityRow = {
  users?: number | string | null;
  userProfiles?: number | string | null;
  localCredentials?: number | string | null;
  orphanUserProfiles?: number | string | null;
  orphanLocalCredentials?: number | string | null;
};

let cachedStatus: AuthIntegrityStatus | null = null;
let cachedAt = 0;

const AUTH_INTEGRITY_CACHE_MS = 30_000;

const toCount = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : 0;
};

const buildStatus = (row: AuthIntegrityRow | undefined): AuthIntegrityStatus => {
  const stats = {
    users: toCount(row?.users),
    userProfiles: toCount(row?.userProfiles),
    localCredentials: toCount(row?.localCredentials),
    orphanUserProfiles: toCount(row?.orphanUserProfiles),
    orphanLocalCredentials: toCount(row?.orphanLocalCredentials),
  };

  const hasAnyUsers = stats.users > 0;
  const hasAnyUserProfiles = stats.userProfiles > 0;
  const hasAnyLocalCredentials = stats.localCredentials > 0;
  const allUserProfilesAreOrphaned =
    hasAnyUserProfiles && stats.orphanUserProfiles === stats.userProfiles;
  const allLocalCredentialsAreOrphaned =
    hasAnyLocalCredentials && stats.orphanLocalCredentials === stats.localCredentials;
  const hasGlobalUsersOutage =
    !hasAnyUsers && (hasAnyUserProfiles || hasAnyLocalCredentials);

  if (hasGlobalUsersOutage || allLocalCredentialsAreOrphaned) {
    return {
      ok: false,
      code: "missing-users-for-credentials",
      message:
        "Authentication database is incomplete. Live password credentials exist without matching Users rows.",
      stats,
    };
  }

  if (hasGlobalUsersOutage || allUserProfilesAreOrphaned) {
    return {
      ok: false,
      code: "missing-users-for-profiles",
      message:
        "Authentication database is incomplete. Live user profiles exist without matching Users rows.",
      stats,
    };
  }

  if (stats.orphanLocalCredentials > 0 || stats.orphanUserProfiles > 0) {
    return {
      ok: true,
      code: "ok",
      message:
        "Authentication data contains orphaned profile or credential rows, but linked Users rows still exist for active sign-in candidates.",
      stats,
    };
  }

  return {
    ok: true,
    code: "ok",
    message: "Authentication database integrity is healthy.",
    stats,
  };
};

export const getAuthIntegrityStatus = async (options?: { force?: boolean }) => {
  const now = Date.now();
  if (!options?.force && cachedStatus && now - cachedAt < AUTH_INTEGRITY_CACHE_MS) {
    return cachedStatus;
  }

  const result = await db.execute(sql`
    select
      (select count(*) from "Users") as "users",
      (select count(*) from "UserProfile") as "userProfiles",
      (select count(*) from "LocalCredential") as "localCredentials",
      (
        select count(*)
        from "UserProfile" up
        left join "Users" u on u."userId" = up."userId"
        where u."userId" is null
      ) as "orphanUserProfiles",
      (
        select count(*)
        from "LocalCredential" lc
        left join "Users" u on u."userId" = lc."userId"
        where u."userId" is null
      ) as "orphanLocalCredentials"
  `);

  const row = ((result as unknown as { rows?: AuthIntegrityRow[] }).rows ?? [])[0];
  cachedStatus = buildStatus(row);
  cachedAt = now;
  return cachedStatus;
};