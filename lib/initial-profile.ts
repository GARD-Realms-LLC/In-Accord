import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { clearSessionUserId, getSessionUserId } from "@/lib/session";

export const initialProfile = async () => {
  const userId = await getSessionUserId();

  if (!userId) {
    return redirect("/sign-in");
  }

  const connectionUrl = process.env.LIVE_DATABASE_URL?.trim() ?? "";

  if (!connectionUrl || /^replace_/i.test(connectionUrl) || !/^postgres(ql)?:\/\//i.test(connectionUrl)) {
    await clearSessionUserId();
    return redirect("/sign-in");
  }

  try {
    const userResult = await db.execute(sql`
      select
        "userId",
        "name",
        "role",
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
        role: string | null;
        email: string | null;
        imageUrl: string | null;
        accountCreated: Date | string | null;
        lastLogin: Date | string | null;
      }>;
    }).rows;
    const user = rows?.[0];

    const existingProfile = user
      ? {
          id: user.userId,
          userId: user.userId,
          name: user.name ?? "User",
          role: user.role ?? null,
          imageUrl: user.imageUrl ?? "/in-accord-steampunk-logo.png",
          email: user.email ?? "",
          createdAt: user.accountCreated ? new Date(user.accountCreated) : new Date(0),
          updatedAt: user.lastLogin ? new Date(user.lastLogin) : new Date(0),
        }
      : null;

    if (existingProfile) {
      return existingProfile;
    }
  } catch (error) {
    console.error("[INITIAL_PROFILE_LOOKUP]", error);
    return redirect("/sign-in");
  }

  await clearSessionUserId();
  return redirect("/sign-in");
}