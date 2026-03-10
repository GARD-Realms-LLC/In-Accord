import { NextResponse } from "next/server";
import { and, eq, or } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { currentProfile } from "@/lib/current-profile";
import { conversation, db, directMessage, member } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { content, fileUrl } = await req.json();
    const { searchParams } = new URL(req.url);
    const conversationId = String(searchParams.get("conversationId") ?? "").trim();

    if (!conversationId) {
      return new NextResponse("Conversation ID missing", { status: 400 });
    }

    const currentConversation = await db.query.conversation.findFirst({
      where: eq(conversation.id, conversationId),
    });

    if (!currentConversation) {
      return new NextResponse("Conversation not found", { status: 404 });
    }

    const currentMember = await db.query.member.findFirst({
      where: and(
        eq(member.profileId, profile.id),
        or(
          eq(member.id, currentConversation.memberOneId),
          eq(member.id, currentConversation.memberTwoId)
        )
      ),
    });

    if (!currentMember) {
      return new NextResponse("Member not found in conversation", { status: 404 });
    }

    const normalizedContent = typeof content === "string" ? content.trim() : "";
    const normalizedFileUrl = typeof fileUrl === "string" ? fileUrl.trim() : "";

    if (!normalizedContent && !normalizedFileUrl) {
      return new NextResponse("Content is required", { status: 400 });
    }

    const now = new Date();

    const inserted = await db
      .insert(directMessage)
      .values({
        id: uuidv4(),
        content: normalizedContent || "[attachment]",
        fileUrl: normalizedFileUrl || null,
        memberId: currentMember.id,
        conversationId,
        deleted: false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json(inserted[0]);
  } catch (error) {
    console.error("[SOCKET_DIRECT_MESSAGES_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
