import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { resolveBannerUrl } from "@/lib/asset-url";
import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { ensureFriendRelationsSchema } from "@/lib/friend-relations";
import { ensureUserProfileSchema } from "@/lib/user-profile";
import { normalizePresenceStatus } from "@/lib/presence-status";

type BlockPayload = {
  profileId?: string;
  memberId?: string;
};

const revalidateUsersViews = () => {
  revalidatePath("/users");
  revalidatePath("/users", "layout");
};

const resolveTargetProfileId = async (payload: BlockPayload) => {
  const rawProfileId = String(payload.profileId ?? "").trim();
  const rawMemberId = String(payload.memberId ?? "").trim();

  if (rawProfileId) {
    return rawProfileId;
  }

  if (!rawMemberId) {
    return "";
  }

  const memberLookup = await db.execute(sql`
    select m."profileId" as "profileId"
    from "Member" m
    where m."id" = ${rawMemberId}
    limit 1
  `);

  const mappedProfileId = (memberLookup as unknown as {
    rows?: Array<{ profileId: string | null }>;
  }).rows?.[0]?.profileId;

  return String(mappedProfileId ?? "").trim();
};

export async function GET() {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await ensureFriendRelationsSchema();
    await ensureUserProfileSchema();

    const blockedResult = await db.execute(sql`
      select
        bp."blockedProfileId" as "profileId",
        coalesce(
          nullif(trim(up."profileName"), ''),
          nullif(trim(u."name"), ''),
          nullif(trim(u."email"), ''),
          bp."blockedProfileId"
        ) as "displayName",
        u."email" as "email",
        coalesce(u."avatarUrl", u."avatar", u."icon") as "imageUrl",
        up."presenceStatus" as "presenceStatus",
        up."bannerUrl" as "bannerUrl",
        u."lastLogin" as "lastLogonAt",
        u."account.created" as "createdAt",
        bp."createdAt" as "blockedAt"
      from "BlockedProfile" bp
      left join "Users" u on u."userId" = bp."blockedProfileId"
      left join "UserProfile" up on up."userId" = bp."blockedProfileId"
      where bp."profileId" = ${profile.id}
      order by bp."createdAt" desc
    `);

    const rows = (blockedResult as unknown as {
      rows?: Array<{
        profileId: string;
        displayName: string | null;
        email: string | null;
        imageUrl: string | null;
        presenceStatus: string | null;
        bannerUrl: string | null;
        lastLogonAt: Date | string | null;
        createdAt: Date | string | null;
        blockedAt: Date | string | null;
      }>;
    }).rows ?? [];

    return NextResponse.json({
      blocked: rows.map((row) => ({
        profileId: row.profileId,
        displayName: row.displayName || row.profileId,
        email: row.email,
        imageUrl: row.imageUrl ?? null,
        presenceStatus: normalizePresenceStatus(row.presenceStatus),
        bannerUrl: resolveBannerUrl(row.bannerUrl),
        lastLogonAt: row.lastLogonAt ? new Date(row.lastLogonAt).toISOString() : null,
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
        blockedAt: row.blockedAt ? new Date(row.blockedAt).toISOString() : null,
      })),
    });
  } catch (error) {
    console.error("[FRIENDS_BLOCKED_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as BlockPayload;

    await ensureFriendRelationsSchema();

    const targetProfileId = await resolveTargetProfileId(body);

    if (!targetProfileId) {
      return NextResponse.json({ error: "profileId or memberId is required" }, { status: 400 });
    }

    if (targetProfileId === profile.id) {
      return NextResponse.json({ error: "You cannot block yourself" }, { status: 400 });
    }

    await db.execute(sql`
      insert into "BlockedProfile" ("profileId", "blockedProfileId", "createdAt")
      values (${profile.id}, ${targetProfileId}, now())
      on conflict ("profileId", "blockedProfileId") do nothing
    `);

    await db.execute(sql`
      update "FriendRequest"
      set "status" = 'DECLINED',
          "updatedAt" = now()
      where (
        ("requesterProfileId" = ${profile.id} and "recipientProfileId" = ${targetProfileId})
        or
        ("requesterProfileId" = ${targetProfileId} and "recipientProfileId" = ${profile.id})
      )
      and upper(trim(coalesce("status", ''))) = 'PENDING'
    `);

    revalidateUsersViews();

    return NextResponse.json({ ok: true, status: "blocked", profileId: targetProfileId });
  } catch (error) {
    console.error("[FRIENDS_BLOCKED_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as BlockPayload;

    await ensureFriendRelationsSchema();

    const targetProfileId = await resolveTargetProfileId(body);

    if (!targetProfileId) {
      return NextResponse.json({ error: "profileId or memberId is required" }, { status: 400 });
    }

    await db.execute(sql`
      delete from "BlockedProfile"
      where "profileId" = ${profile.id}
        and "blockedProfileId" = ${targetProfileId}
    `);

    revalidateUsersViews();

    return NextResponse.json({ ok: true, status: "unblocked", profileId: targetProfileId });
  } catch (error) {
    console.error("[FRIENDS_BLOCKED_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
