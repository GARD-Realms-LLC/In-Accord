import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { ensureFriendRelationsSchema } from "@/lib/friend-relations";

type FriendRequestAction = "accept" | "decline" | "cancel" | "block";

const revalidateUsersViews = () => {
  revalidatePath("/users");
  revalidatePath("/users", "layout");
};

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params;
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const parsedBody = (await req.json().catch(() => ({}))) as {
      action?: FriendRequestAction;
    };

    const action = parsedBody.action;

    if (!requestId?.trim()) {
      return new NextResponse("Request ID missing", { status: 400 });
    }

    if (!action || !["accept", "decline", "cancel", "block"].includes(action)) {
      return new NextResponse("Invalid action", { status: 400 });
    }

    await ensureFriendRelationsSchema();

    const requestResult = await db.execute(sql`
      select
        fr."id" as "id",
        fr."requesterProfileId" as "requesterProfileId",
        fr."recipientProfileId" as "recipientProfileId",
        fr."status" as "status"
      from "FriendRequest" fr
      where fr."id" = ${requestId}
      limit 1
    `);

    const row = (requestResult as unknown as {
      rows: Array<{
        id: string;
        requesterProfileId: string;
        recipientProfileId: string;
        status: string;
      }>;
    }).rows?.[0];

    if (!row) {
      return new NextResponse("Friend request not found", { status: 404 });
    }

    const isRequester = row.requesterProfileId === profile.id;
    const isRecipient = row.recipientProfileId === profile.id;

    if (!isRequester && !isRecipient) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const status = String(row.status ?? "").toUpperCase();
    if (status !== "PENDING") {
      return new NextResponse("Friend request is no longer pending", { status: 409 });
    }

    const otherProfileId = isRequester ? row.recipientProfileId : row.requesterProfileId;

    if (action === "accept") {
      if (!isRecipient) {
        return new NextResponse("Only recipients can accept requests", { status: 403 });
      }

      await db.execute(sql`
        update "FriendRequest"
        set "status" = 'ACCEPTED',
            "updatedAt" = now()
        where "id" = ${requestId}
      `);

      const membersResult = await db.execute(sql`
        select "id", "profileId"
        from "Member"
        where "profileId" in (${profile.id}, ${otherProfileId})
        order by "createdAt" asc
      `);

      const members = (membersResult as unknown as {
        rows: Array<{ id: string; profileId: string }>;
      }).rows;

      const currentMemberId = members.find((item) => item.profileId === profile.id)?.id;
      const otherMemberId = members.find((item) => item.profileId === otherProfileId)?.id;

      if (currentMemberId && otherMemberId) {
        const existingConversationResult = await db.execute(sql`
          select "id"
          from "Conversation"
          where (
            "memberOneId" = ${currentMemberId}
            and "memberTwoId" = ${otherMemberId}
          ) or (
            "memberOneId" = ${otherMemberId}
            and "memberTwoId" = ${currentMemberId}
          )
          limit 1
        `);

        const existingConversation = (existingConversationResult as unknown as {
          rows: Array<{ id: string }>;
        }).rows?.[0];

        if (!existingConversation) {
          await db.execute(sql`
            insert into "Conversation" ("id", "memberOneId", "memberTwoId")
            values (${crypto.randomUUID()}, ${currentMemberId}, ${otherMemberId})
          `);
        }
      }

      revalidateUsersViews();

      return NextResponse.json({ ok: true, action: "accept" });
    }

    if (action === "decline") {
      if (!isRecipient) {
        return new NextResponse("Only recipients can decline requests", { status: 403 });
      }

      await db.execute(sql`
        update "FriendRequest"
        set "status" = 'DECLINED',
            "updatedAt" = now()
        where "id" = ${requestId}
      `);

      revalidateUsersViews();

      return NextResponse.json({ ok: true, action: "decline" });
    }

    if (action === "cancel") {
      if (!isRequester) {
        return new NextResponse("Only requesters can cancel requests", { status: 403 });
      }

      await db.execute(sql`
        update "FriendRequest"
        set "status" = 'CANCELED',
            "updatedAt" = now()
        where "id" = ${requestId}
      `);

      revalidateUsersViews();

      return NextResponse.json({ ok: true, action: "cancel" });
    }

    if (action === "block") {
      await db.execute(sql`
        insert into "BlockedProfile" ("profileId", "blockedProfileId", "createdAt")
        values (${profile.id}, ${otherProfileId}, now())
        on conflict ("profileId", "blockedProfileId") do nothing
      `);

      await db.execute(sql`
        update "FriendRequest"
        set "status" = 'DECLINED',
            "updatedAt" = now()
        where "id" = ${requestId}
      `);

      revalidateUsersViews();

      return NextResponse.json({ ok: true, action: "block" });
    }

    return new NextResponse("Invalid action", { status: 400 });
  } catch (error) {
    console.error("[FRIEND_REQUEST_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
