import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { ensureFriendRelationsSchema } from "@/lib/friend-relations";

const revalidateUsersViews = () => {
  revalidatePath("/users");
  revalidatePath("/users", "layout");
};

export async function POST(req: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      profileId?: string;
      memberId?: string;
    };

    const rawProfileId = String(body.profileId ?? "").trim();
    const rawMemberId = String(body.memberId ?? "").trim();

    if (!rawProfileId && !rawMemberId) {
      return NextResponse.json({ error: "profileId or memberId is required" }, { status: 400 });
    }

    await ensureFriendRelationsSchema();

    let targetProfileId = rawProfileId;

    if (!targetProfileId && rawMemberId) {
      const memberLookup = await db.execute(sql`
        select m."profileId" as "profileId"
        from "Member" m
        where m."id" = ${rawMemberId}
        limit 1
      `);

      const mappedProfileId = (memberLookup as unknown as {
        rows?: Array<{ profileId: string | null }>;
      }).rows?.[0]?.profileId;

      targetProfileId = String(mappedProfileId ?? "").trim();
    }

    if (!targetProfileId) {
      return NextResponse.json({ error: "Target profile not found" }, { status: 404 });
    }

    const isSelfFriendRequest = targetProfileId === profile.id;
    const canSelfFriendForTesting = process.env.NODE_ENV !== "production";

    if (isSelfFriendRequest && !canSelfFriendForTesting) {
      return NextResponse.json({ error: "You cannot friend yourself" }, { status: 400 });
    }

    const existingResult = await db.execute(sql`
      with normalized_friend_requests as (
        select
          fr."id" as "id",
          upper(trim(coalesce(fr."status", ''))) as "status",
          coalesce(reqm."profileId", fr."requesterProfileId") as "requesterProfileId",
          coalesce(recm."profileId", fr."recipientProfileId") as "recipientProfileId"
        from "FriendRequest" fr
        left join "Member" reqm on reqm."id" = fr."requesterProfileId"
        left join "Member" recm on recm."id" = fr."recipientProfileId"
      )
      select
        nfr."id" as "id",
        nfr."status" as "status",
        nfr."requesterProfileId" as "requesterProfileId",
        nfr."recipientProfileId" as "recipientProfileId"
      from normalized_friend_requests nfr
      where
        (nfr."requesterProfileId" = ${profile.id} and nfr."recipientProfileId" = ${targetProfileId})
        or
        (nfr."requesterProfileId" = ${targetProfileId} and nfr."recipientProfileId" = ${profile.id})
      order by nfr."id" asc
      limit 1
    `);

    const existing = (existingResult as unknown as {
      rows?: Array<{
        id: string;
        status: string;
        requesterProfileId: string;
        recipientProfileId: string;
      }>;
    }).rows?.[0];

    if (existing) {
      if (existing.status === "ACCEPTED") {
        return NextResponse.json({ ok: true, status: "accepted", requestId: existing.id });
      }

      if (existing.status === "PENDING") {
        return NextResponse.json({
          ok: true,
          status: "pending",
          requestId: existing.id,
          isIncoming: existing.requesterProfileId === targetProfileId,
        });
      }
    }

    const requestId = crypto.randomUUID();

    await db.execute(sql`
      insert into "FriendRequest" (
        "id",
        "requesterProfileId",
        "recipientProfileId",
        "status",
        "createdAt",
        "updatedAt"
      )
      values (
        ${requestId},
        ${profile.id},
        ${targetProfileId},
        'PENDING',
        now(),
        now()
      )
    `);

    revalidateUsersViews();

    return NextResponse.json({ ok: true, status: "pending", requestId });
  } catch (error) {
    console.error("[FRIEND_REQUESTS_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
