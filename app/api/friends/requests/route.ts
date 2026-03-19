import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { ensureFriendRelationsSchema } from "@/lib/friend-relations";
import { ensureUserProfileSchema } from "@/lib/user-profile";

const revalidateUsersViews = () => {
  revalidatePath("/users");
  revalidatePath("/users", "layout");
};

export async function GET() {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await ensureFriendRelationsSchema();
    await ensureUserProfileSchema();

    const pendingRequestsResult = await db.execute(sql`
      with normalized_friend_requests as (
        select
          fr."id" as "requestId",
          fr."createdAt" as "createdAt",
          upper(trim(coalesce(fr."status", ''))) as "status",
          coalesce(reqm."profileId", fr."requesterProfileId") as "requesterProfileId",
          coalesce(recm."profileId", fr."recipientProfileId") as "recipientProfileId"
        from "FriendRequest" fr
        left join "Member" reqm on reqm."id" = fr."requesterProfileId"
        left join "Member" recm on recm."id" = fr."recipientProfileId"
      ),
      pending_requests as (
        select
          nfr."requestId" as "requestId",
          nfr."createdAt" as "createdAt",
          case
            when nfr."requesterProfileId" = ${profile.id} then false
            else true
          end as "isIncoming",
          case
            when nfr."requesterProfileId" = ${profile.id}
              then nfr."recipientProfileId"
            else nfr."requesterProfileId"
          end as "otherProfileId"
        from normalized_friend_requests nfr
        where nfr."status" = 'PENDING'
          and (
            nfr."requesterProfileId" = ${profile.id}
            or nfr."recipientProfileId" = ${profile.id}
          )
      )
      select
        pr."requestId" as "requestId",
        pr."createdAt" as "createdAt",
        pr."isIncoming" as "isIncoming",
        pr."otherProfileId" as "profileId",
        coalesce(
          nullif(trim(up."profileName"), ''),
          nullif(trim(u."name"), ''),
          nullif(trim(u."email"), ''),
          pr."otherProfileId"
        ) as "displayName",
        u."email" as "email",
        coalesce(u."avatarUrl", u."avatar", u."icon") as "imageUrl",
        up."avatarDecorationUrl" as "avatarDecorationUrl"
      from pending_requests pr
      left join "Users" u on u."userId" = pr."otherProfileId"
      left join "UserProfile" up on up."userId" = pr."otherProfileId"
      order by
        pr."isIncoming" desc,
        pr."createdAt" desc,
        pr."requestId" desc
    `);

    const rows =
      (
        pendingRequestsResult as unknown as {
          rows?: Array<{
            requestId: string;
            createdAt: Date | string | null;
            isIncoming: boolean | string | number | null;
            profileId: string;
            displayName: string | null;
            email: string | null;
            imageUrl: string | null;
            avatarDecorationUrl: string | null;
          }>;
        }
      ).rows ?? [];

    const normalizedRequests = rows
      .map((row) => ({
        requestId: String(row.requestId ?? "").trim(),
        profileId: String(row.profileId ?? "").trim(),
        displayName: String(row.displayName ?? row.profileId ?? "").trim(),
        email: row.email,
        imageUrl: row.imageUrl ?? null,
        avatarDecorationUrl: row.avatarDecorationUrl ?? null,
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
        isIncoming:
          row.isIncoming === true ||
          row.isIncoming === "true" ||
          row.isIncoming === "t" ||
          row.isIncoming === 1,
      }))
      .filter(
        (row) =>
          row.requestId.length > 0 &&
          row.profileId.length > 0 &&
          row.displayName.length > 0,
      );

    return NextResponse.json({
      incoming: normalizedRequests.filter((row) => row.isIncoming),
      outgoing: normalizedRequests.filter((row) => !row.isIncoming),
    });
  } catch (error) {
    console.error("[FRIEND_REQUESTS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

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
      return NextResponse.json(
        { error: "profileId or memberId is required" },
        { status: 400 },
      );
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

      const mappedProfileId = (
        memberLookup as unknown as {
          rows?: Array<{ profileId: string | null }>;
        }
      ).rows?.[0]?.profileId;

      targetProfileId = String(mappedProfileId ?? "").trim();
    }

    if (!targetProfileId) {
      return NextResponse.json(
        { error: "Target profile not found" },
        { status: 404 },
      );
    }

    if (targetProfileId === profile.id) {
      return NextResponse.json(
        { error: "You cannot friend yourself" },
        { status: 400 },
      );
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
      order by
        case
          when nfr."status" = 'ACCEPTED' then 0
          when nfr."status" = 'PENDING' then 1
          else 2
        end asc,
        case
          when nfr."requesterProfileId" = ${profile.id}
            and nfr."recipientProfileId" = ${targetProfileId}
            then 0
          else 1
        end asc,
        nfr."id" desc
      limit 1
    `);

    const existing = (
      existingResult as unknown as {
        rows?: Array<{
          id: string;
          status: string;
          requesterProfileId: string;
          recipientProfileId: string;
        }>;
      }
    ).rows?.[0];

    if (existing) {
      if (existing.status === "ACCEPTED") {
        return NextResponse.json({
          ok: true,
          status: "accepted",
          requestId: existing.id,
          created: false,
        });
      }

      if (existing.status === "PENDING") {
        const isIncoming = existing.requesterProfileId === targetProfileId;

        return NextResponse.json({
          ok: true,
          status: "pending",
          requestId: existing.id,
          isIncoming,
          direction: isIncoming ? "incoming" : "outgoing",
          created: false,
        });
      }

      await db.execute(sql`
        update "FriendRequest"
        set
          "requesterProfileId" = ${profile.id},
          "recipientProfileId" = ${targetProfileId},
          "status" = 'PENDING',
          "createdAt" = now(),
          "updatedAt" = now()
        where "id" = ${existing.id}
      `);

      revalidateUsersViews();

      return NextResponse.json({
        ok: true,
        status: "pending",
        requestId: existing.id,
        isIncoming: false,
        direction: "outgoing",
        created: true,
        reopened: true,
      });
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

    return NextResponse.json({
      ok: true,
      status: "pending",
      requestId,
      isIncoming: false,
      direction: "outgoing",
      created: true,
    });
  } catch (error) {
    console.error("[FRIEND_REQUESTS_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
