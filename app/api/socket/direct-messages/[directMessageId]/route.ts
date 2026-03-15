import { NextResponse } from "next/server";
import { and, eq, or } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { conversation, db, directMessage, member, MemberRole } from "@/lib/db";
import { publishRealtimeRefresh } from "@/lib/realtime-events-server";

type RouteParams = { directMessageId: string };

const getConversationForMember = async ({
  profileId,
  conversationId,
}: {
  profileId: string;
  conversationId: string;
}) => {
  const currentConversation = await db.query.conversation.findFirst({
    where: eq(conversation.id, conversationId),
  });

  if (!currentConversation) {
    return { currentConversation: null, currentMember: null };
  }

  const currentMember = await db.query.member.findFirst({
    where: and(
      eq(member.profileId, profileId),
      or(
        eq(member.id, currentConversation.memberOneId),
        eq(member.id, currentConversation.memberTwoId)
      )
    ),
  });

  return {
    currentConversation,
    currentMember,
  };
};

const getConversationProfileIds = async (conversationId: string) => {
  const currentConversation = await db.query.conversation.findFirst({
    where: eq(conversation.id, conversationId),
  });

  if (!currentConversation) {
    return [] as string[];
  }

  const rows = await db.query.member.findMany({
    where: or(eq(member.id, currentConversation.memberOneId), eq(member.id, currentConversation.memberTwoId)),
  });

  return rows.map((item) => String(item.profileId ?? "").trim()).filter(Boolean);
};

export async function PATCH(req: Request, { params }: { params: Promise<RouteParams> }) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { directMessageId } = await params;
    const { searchParams } = new URL(req.url);
    const conversationId = String(searchParams.get("conversationId") ?? "").trim();
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const content = typeof body.content === "string" ? body.content.trim() : "";

    if (!directMessageId) {
      return new NextResponse("Direct message ID missing", { status: 400 });
    }

    if (!conversationId) {
      return new NextResponse("Conversation ID missing", { status: 400 });
    }

    if (!content) {
      return new NextResponse("Content is required", { status: 400 });
    }

    const { currentConversation, currentMember } = await getConversationForMember({
      profileId: profile.id,
      conversationId,
    });

    if (!currentConversation) {
      return new NextResponse("Conversation not found", { status: 404 });
    }

    if (!currentMember) {
      return new NextResponse("Member not found in conversation", { status: 404 });
    }

    const currentDirectMessage = await db.query.directMessage.findFirst({
      where: and(
        eq(directMessage.id, directMessageId),
        eq(directMessage.conversationId, conversationId)
      ),
    });

    if (!currentDirectMessage) {
      return new NextResponse("Direct message not found", { status: 404 });
    }

    if (currentDirectMessage.memberId !== currentMember.id) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    if (currentDirectMessage.deleted) {
      return new NextResponse("Direct message is already deleted", { status: 400 });
    }

    if (currentDirectMessage.fileUrl) {
      return new NextResponse("Attachment messages cannot be edited", { status: 400 });
    }

    const updated = await db
      .update(directMessage)
      .set({
        content,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(directMessage.id, directMessageId),
          eq(directMessage.conversationId, conversationId)
        )
      )
      .returning();

    const participantProfileIds = await getConversationProfileIds(conversationId);

    await publishRealtimeRefresh(
      {
        conversationId,
        profileIds: participantProfileIds,
      },
      { entity: "direct-message", action: "updated" }
    );

    return NextResponse.json(updated[0] ?? null);
  } catch (error) {
    console.error("[SOCKET_DIRECT_MESSAGES_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<RouteParams> }) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { directMessageId } = await params;
    const { searchParams } = new URL(req.url);
    const conversationId = String(searchParams.get("conversationId") ?? "").trim();

    if (!directMessageId) {
      return new NextResponse("Direct message ID missing", { status: 400 });
    }

    if (!conversationId) {
      return new NextResponse("Conversation ID missing", { status: 400 });
    }

    const { currentConversation, currentMember } = await getConversationForMember({
      profileId: profile.id,
      conversationId,
    });

    if (!currentConversation) {
      return new NextResponse("Conversation not found", { status: 404 });
    }

    if (!currentMember) {
      return new NextResponse("Member not found in conversation", { status: 404 });
    }

    const currentDirectMessage = await db.query.directMessage.findFirst({
      where: and(
        eq(directMessage.id, directMessageId),
        eq(directMessage.conversationId, conversationId)
      ),
    });

    if (!currentDirectMessage) {
      return new NextResponse("Direct message not found", { status: 404 });
    }

    const isOwner = currentDirectMessage.memberId === currentMember.id;
    const canModerate =
      currentMember.role === MemberRole.ADMIN ||
      currentMember.role === MemberRole.MODERATOR;

    if (!isOwner && !canModerate) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const updated = await db
      .update(directMessage)
      .set({
        content: "This message has been deleted.",
        fileUrl: null,
        deleted: true,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(directMessage.id, directMessageId),
          eq(directMessage.conversationId, conversationId)
        )
      )
      .returning();

    const participantProfileIds = await getConversationProfileIds(conversationId);

    await publishRealtimeRefresh(
      {
        conversationId,
        profileIds: participantProfileIds,
      },
      { entity: "direct-message", action: "deleted" }
    );

    return NextResponse.json(updated[0] ?? null);
  } catch (error) {
    console.error("[SOCKET_DIRECT_MESSAGES_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
