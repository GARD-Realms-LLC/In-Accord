import { db } from "@/lib/db";
import { and, eq, or } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { conversation } from "@/lib/db";

export const getOrCreateConversation = async (
  memberOneId: string,
  memberTwoId: string
) => {
  let conversation = await findConversation(memberOneId, memberTwoId);

  if (!conversation) {
    conversation = await createConversation(memberOneId, memberTwoId);
  }

  return conversation;
};

const findConversation = async (memberOneId: string, memberTwoId: string) => {
  try {
    return await db.query.conversation.findFirst({
      where: or(
        and(
          eq(conversation.memberOneId, memberOneId),
          eq(conversation.memberTwoId, memberTwoId)
        ),
        and(
          eq(conversation.memberOneId, memberTwoId),
          eq(conversation.memberTwoId, memberOneId)
        )
      ),
      with: {
        memberOne: {
          with: {
            profile: true,
          },
        },
        memberTwo: {
          with: {
            profile: true,
          },
        },
      },
    });
  } catch (error) {
    return null;
  }
};

const createConversation = async (memberOneId: string, memberTwoId: string) => {
  try {
    const nowId = uuidv4();

    await db.insert(conversation).values({
        id: nowId,
        memberOneId,
        memberTwoId,
    });

    return await db.query.conversation.findFirst({
      where: eq(conversation.id, nowId),
      with: {
        memberOne: {
          with: {
            profile: true,
          },
        },
        memberTwo: {
          with: {
            profile: true,
          },
        },
      },
    });
  } catch (error) {
    return null;
  }
};
