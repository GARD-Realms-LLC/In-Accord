import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { db, profile } from "@/lib/db";

export const currentProfile = async () => {
  const { userId } = auth();

  if (!userId) {
    return null;
  }

  const current = await db.query.profile.findFirst({
    where: eq(profile.userId, userId),
  });

  return current;
}
