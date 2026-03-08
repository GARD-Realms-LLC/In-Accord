import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { ensureMessageReactionSchema } from "@/lib/message-reactions";

type Scope = "channel" | "direct";

const basicEmotes = new Set(["😀", "😂", "😍", "🔥", "👏", "🎉", "👍", "👀", "💯", "🤝", "😎", "🙏"]);
const ACCESS_CACHE_TTL_MS = 30_000;
const REACTIONS_CACHE_TTL_MS = 2_000;

const isValidScope = (value: unknown): value is Scope => value === "channel" || value === "direct";

const accessCache = new Map<string, { allowed: boolean; expiresAt: number }>();
const reactionsCache = new Map<
  string,
  { reactions: Array<{ emoji: string; count: number }>; expiresAt: number }
>();

const getAccessCacheKey = (profileId: string, messageId: string, scope: Scope) =>
  `${profileId}:${scope}:${messageId}`;

const getReactionsCacheKey = (messageId: string, scope: Scope) => `${scope}:${messageId}`;

const getCachedAccess = (profileId: string, messageId: string, scope: Scope) => {
  const key = getAccessCacheKey(profileId, messageId, scope);
  const cached = accessCache.get(key);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    accessCache.delete(key);
    return null;
  }

  return cached.allowed;
};

const setCachedAccess = (profileId: string, messageId: string, scope: Scope, allowed: boolean) => {
  accessCache.set(getAccessCacheKey(profileId, messageId, scope), {
    allowed,
    expiresAt: Date.now() + ACCESS_CACHE_TTL_MS,
  });
};

const getCachedReactions = (messageId: string, scope: Scope) => {
  const key = getReactionsCacheKey(messageId, scope);
  const cached = reactionsCache.get(key);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    reactionsCache.delete(key);
    return null;
  }

  return cached.reactions;
};

const setCachedReactions = (messageId: string, scope: Scope, reactions: Array<{ emoji: string; count: number }>) => {
  reactionsCache.set(getReactionsCacheKey(messageId, scope), {
    reactions,
    expiresAt: Date.now() + REACTIONS_CACHE_TTL_MS,
  });
};

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

export async function GET(req: Request, { params }: { params: Promise<{ messageId: string }> }) {
  try {
    const perfStart = Date.now();
    const isPerfLoggingEnabled = process.env.NODE_ENV !== "production";
    const { messageId: rawMessageId } = await params;

    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (isPerfLoggingEnabled) {
      console.info(`[PERF][ReactionsGET] auth ${Date.now() - perfStart}ms message=${rawMessageId}`);
    }

    const { searchParams } = new URL(req.url);
    const scopeParam = searchParams.get("scope");
    const scope = scopeParam as Scope;
    const messageId = String(rawMessageId ?? "").trim();

    if (!messageId) {
      return new NextResponse("Message ID is required", { status: 400 });
    }

    if (!isValidScope(scope)) {
      return new NextResponse("Invalid reaction scope", { status: 400 });
    }

    const cachedAccess = getCachedAccess(profile.id, messageId, scope);
    const hasAccess =
      typeof cachedAccess === "boolean"
        ? cachedAccess
        : await assertAccess(profile.id, messageId, scope);
    setCachedAccess(profile.id, messageId, scope, hasAccess);

    if (isPerfLoggingEnabled) {
      console.info(
        `[PERF][ReactionsGET] access ${Date.now() - perfStart}ms message=${messageId} scope=${scope} cache=${typeof cachedAccess === "boolean"}`
      );
    }

    if (!hasAccess) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const cachedReactions = getCachedReactions(messageId, scope);
    if (cachedReactions) {
      if (isPerfLoggingEnabled) {
        console.info(
          `[PERF][ReactionsGET] done ${Date.now() - perfStart}ms message=${messageId} scope=${scope} source=cache`
        );
      }
      return NextResponse.json({ reactions: cachedReactions });
    }

    const reactions = await loadReactions(messageId, scope);
    setCachedReactions(messageId, scope, reactions);

    if (isPerfLoggingEnabled) {
      console.info(
        `[PERF][ReactionsGET] done ${Date.now() - perfStart}ms message=${messageId} scope=${scope} source=db count=${reactions.length}`
      );
    }

    return NextResponse.json({ reactions });
  } catch (error) {
    console.error("[MESSAGE_REACTIONS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ messageId: string }> }) {
  try {
    const { messageId: rawMessageId } = await params;

    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      emoji?: string;
      scope?: Scope;
    };

    const messageId = String(rawMessageId ?? "").trim();
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

    const cachedAccess = getCachedAccess(profile.id, messageId, scope);
    const hasAccess =
      typeof cachedAccess === "boolean"
        ? cachedAccess
        : await assertAccess(profile.id, messageId, scope);
    setCachedAccess(profile.id, messageId, scope, hasAccess);
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
    setCachedReactions(messageId, scope, reactions);
    return NextResponse.json({ reactions });
  } catch (error) {
    console.error("[MESSAGE_REACTIONS_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
