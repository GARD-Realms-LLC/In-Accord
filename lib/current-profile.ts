import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";

export const currentProfile = async () => {
  const userId = await getSessionUserId();

  if (!userId) {
    return null;
  }

  const liveConnectionUrl = process.env.LIVE_DATABASE_URL?.trim() ?? "";
  const fallbackConnectionUrl = process.env.DATABASE_URL?.trim() ?? "";
  const connectionUrl =
    liveConnectionUrl && !/^replace_/i.test(liveConnectionUrl)
      ? liveConnectionUrl
      : fallbackConnectionUrl;

  if (!/^postgres(ql)?:\/\//i.test(connectionUrl)) {
    return null;
  }

  try {
    const userResult = await db.execute(sql`
      select
        "userId",
        "name",
        "email",
        coalesce("avatarUrl", "avatar", "icon") as "imageUrl",
        "account.created" as "accountCreated",
        "lastLogin"
      from "Users"
      where "userId" = ${userId}
      limit 1
    `);

    const rows = (userResult as unknown as {
      rows: Array<{
        userId: string;
        name: string | null;
        email: string | null;
        imageUrl: string | null;
        accountCreated: Date | string | null;
        lastLogin: Date | string | null;
      }>;
    }).rows;
    const user = rows?.[0];

    const current = user
      ? {
          id: user.userId,
          userId: user.userId,
          name: user.name ?? user.email ?? "User",
          imageUrl: user.imageUrl ?? "/in-accord-steampunk-logo.png",
          email: user.email ?? "",
          createdAt: user.accountCreated ? new Date(user.accountCreated) : new Date(0),
          updatedAt: user.lastLogin ? new Date(user.lastLogin) : new Date(0),
        }
      : null;

    return current;
  } catch (error) {
    console.error("[CURRENT_PROFILE_LOOKUP]", error);
    return null;
  }
}
