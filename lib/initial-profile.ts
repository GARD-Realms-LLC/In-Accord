import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { db, profile } from "@/lib/db";

export const initialProfile = async () => {
  const user = await currentUser();

  if (!user) {
    return auth().redirectToSignIn();
  }

  const existingProfile = await db.query.profile.findFirst({
    where: eq(profile.userId, user.id),
  });

  if (existingProfile) {
    return existingProfile;
  }

  const now = new Date();

  await db.insert(profile).values({
      id: uuidv4(),
      userId: user.id,
      name: `${user.firstName} ${user.lastName}`,
      imageUrl: user.imageUrl,
      email: user.emailAddresses[0].emailAddress,
      createdAt: now,
      updatedAt: now,
  });

  const newProfile = await db.query.profile.findFirst({
    where: eq(profile.userId, user.id),
  });

  return newProfile;
}