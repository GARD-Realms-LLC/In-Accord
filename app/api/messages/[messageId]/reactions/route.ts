import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { ensureMessageReactionSchema } from "@/lib/message-reactions";

type Scope = "channel" | "direct";

const basicEmotes = new Set(["😀", "😂", "😍", "🔥", "👏", "🎉", "👍", "👀", "💯", "🤝", "😎", "🙏"]);

const isValidScope = (value: unknown): value is Scope => value === "channel" || value === "direct";

const loadReactions = async (messageId: string, scope: Scope) => {
  const result = await db.execute(sql`
    select "emoji", "count"
    from "MessageReaction"
    where "messageId" = ${messageId}
      and "scope" = ${scope}
    order by "createdAt" asc
  `);

  return ((result as unknown as {
    rows?: Array<{ emoji: string; count: number }>;
  }).rows ?? []).map((row) => ({
    emoji: row.emoji,
    count: Number(row.count ?? 0),
  }));
};

const assertAccess = async (profileId: string, messageId: string, scope: Scope) => {
  if (scope === "channel") {
    const memberResult = await db.execute(sql`
      select mem."id"
      from "Message" msg
      inner join "Channel" ch on ch."id" = msg."channelId"
      inner join "Member" mem on mem."serverId" = ch."serverId"
      where msg."id" = ${messageId}
        and mem."profileId" = ${profileId}
      limit 1
    `);

    return Boolean((memberResult as unknown as { rows?: Array<{ id: string }> }).rows?.[0]);
  }

  const dmAccess = await db.execute(sql`
    select dm."id"
    from "DirectMessage" dm
    inner join "Conversation" c on c."id" = dm."conversationId"
    inner join "Member" m1 on m1."id" = c."memberOneId"
    inner join "Member" m2 on m2."id" = c."memberTwoId"
    where dm."id" = ${messageId}
      and (m1."profileId" = ${profileId} or m2."profileId" = ${profileId})
    limit 1
  `);

  return Boolean((dmAccess as unknown as { rows?: Array<{ id: string }> }).rows?.[0]);
};

export async function GET(req: Request, { params }: { params: { messageId: string } }) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const scopeParam = searchParams.get("scope");
    const scope = scopeParam as Scope;
    const messageId = String(params.messageId ?? "").trim();

    if (!messageId) {
      return new NextResponse("Message ID is required", { status: 400 });
    }

    if (!isValidScope(scope)) {
      return new NextResponse("Invalid reaction scope", { status: 400 });
    }

    const hasAccess = await assertAccess(profile.id, messageId, scope);
    if (!hasAccess) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    await ensureMessageReactionSchema();
    const reactions = await loadReactions(messageId, scope);
    return NextResponse.json({ reactions });
  } catch (error) {
    console.error("[MESSAGE_REACTIONS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: { messageId: string } }) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      emoji?: string;
      scope?: Scope;
    };

    const messageId = String(params.messageId ?? "").trim();
    const emoji = String(body.emoji ?? "").trim();
    const scope = body.scope;

    if (!messageId) {
      return new NextResponse("Message ID is required", { status: 400 });
    }

    if (!isValidScope(scope)) {
      return new NextResponse("Invalid reaction scope", { status: 400 });
    }

    if (!basicEmotes.has(emoji)) {
      return new NextResponse("Unsupported emoji", { status: 400 });
    }

    const hasAccess = await assertAccess(profile.id, messageId, scope);
    if (!hasAccess) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    await ensureMessageReactionSchema();

    await db.execute(sql`
      insert into "MessageReaction" (
        "id",
        "messageId",
        "scope",
        "emoji",
        "count",
        "createdAt",
        "updatedAt"
      )
      values (
        ${uuidv4()},
        ${messageId},
        ${scope},
        ${emoji},
        1,
        now(),
        now()
      )
      on conflict ("messageId", "scope", "emoji") do update
      set
        "count" = "MessageReaction"."count" + 1,
        "updatedAt" = now()
    `);

    const reactions = await loadReactions(messageId, scope);
    return NextResponse.json({ reactions });
  } catch (error) {
    console.error("[MESSAGE_REACTIONS_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
