import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { getServerManagementAccess } from "@/lib/server-management-access";
import {
  allowedServerEmojiStickerAssetTypes,
  ensureServerEmojiStickerSchema,
  type ServerEmojiStickerAssetType,
} from "@/lib/server-emoji-stickers";

type Params = { params: Promise<{ serverId: string }> };

type ServerEmojiStickerAssetRow = {
  id: string;
  serverId: string;
  assetType: ServerEmojiStickerAssetType;
  name: string;
  emoji: string | null;
  imageUrl: string | null;
  isEnabled: boolean | null;
  createdByProfileId: string | null;
  createdByName: string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
};

type StatusFilter = "ALL" | "ACTIVE" | "DISABLED";

const normalizeAssetType = (value: unknown): ServerEmojiStickerAssetType | null => {
  const normalized = String(value ?? "").trim().toUpperCase();
  return allowedServerEmojiStickerAssetTypes.has(normalized as ServerEmojiStickerAssetType)
    ? (normalized as ServerEmojiStickerAssetType)
    : null;
};

const normalizeAssetName = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const isValidAssetName = (value: string) => /^[a-z0-9_]{2,32}$/.test(value);

const normalizeImageUrl = (value: unknown) => String(value ?? "").trim();

const isValidImageUrl = (value: string) => /^(https?:\/\/|\/)/i.test(value);

const normalizeStatusFilter = (value: unknown): StatusFilter => {
  const normalized = String(value ?? "ALL").trim().toUpperCase();
  if (normalized === "ACTIVE" || normalized === "DISABLED") {
    return normalized;
  }
  return "ALL";
};

export async function GET(req: Request, { params }: Params) {
  try {
    const { serverId: rawServerId } = await params;

    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const serverId = String(rawServerId ?? "").trim();
    if (!serverId) {
      return new NextResponse("Server ID is required", { status: 400 });
    }

    await ensureServerEmojiStickerSchema();

    const access = await getServerManagementAccess({ serverId, profileId: profile.id, profileRole: profile.role });
    if (!access.canView) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const assetTypeFilter = normalizeAssetType(searchParams.get("assetType"));
    const statusFilter = normalizeStatusFilter(searchParams.get("status"));

    const whereClauses: Array<ReturnType<typeof sql>> = [sql`a."serverId" = ${serverId}`];

    if (assetTypeFilter) {
      whereClauses.push(sql`a."assetType" = ${assetTypeFilter}`);
    }

    if (statusFilter === "ACTIVE") {
      whereClauses.push(sql`a."isEnabled" = true`);
    } else if (statusFilter === "DISABLED") {
      whereClauses.push(sql`a."isEnabled" = false`);
    }

    const whereSql = sql`where ${sql.join(whereClauses, sql` and `)}`;

    const assetsResult = await db.execute(sql`
      select
        a."id" as "id",
        a."serverId" as "serverId",
        a."assetType" as "assetType",
        a."name" as "name",
        a."emoji" as "emoji",
        a."imageUrl" as "imageUrl",
        a."isEnabled" as "isEnabled",
        a."createdByProfileId" as "createdByProfileId",
        coalesce(nullif(trim(up."profileName"), ''), nullif(trim(u."name"), ''), u."email", a."createdByProfileId") as "createdByName",
        a."createdAt" as "createdAt",
        a."updatedAt" as "updatedAt"
      from "ServerEmojiSticker" a
      left join "Users" u on u."userId" = a."createdByProfileId"
      left join "UserProfile" up on up."userId" = a."createdByProfileId"
      ${whereSql}
      order by a."updatedAt" desc, a."createdAt" desc
      limit 1000
    `);

    const assets = ((assetsResult as unknown as { rows?: ServerEmojiStickerAssetRow[] }).rows ?? []).map((row) => ({
      id: row.id,
      serverId: row.serverId,
      assetType: row.assetType,
      name: row.name,
      emoji: row.emoji,
      imageUrl: row.imageUrl,
      isEnabled: Boolean(row.isEnabled),
      createdByProfileId: row.createdByProfileId,
      createdByName: row.createdByName ?? row.createdByProfileId ?? "Unknown",
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    }));

    const summary = assets.reduce(
      (acc, item) => {
        acc.totalAssets += 1;
        if (item.assetType === "EMOJI") {
          acc.emojiAssets += 1;
        } else {
          acc.stickerAssets += 1;
        }
        if (item.isEnabled) {
          acc.activeAssets += 1;
        }
        return acc;
      },
      {
        totalAssets: 0,
        emojiAssets: 0,
        stickerAssets: 0,
        activeAssets: 0,
      }
    );

    return NextResponse.json({
      assets,
      summary,
      canManageEmojiStickers: access.canManage,
    });
  } catch (error) {
    console.error("[SERVER_EMOJI_STICKERS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { serverId: rawServerId } = await params;

    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const serverId = String(rawServerId ?? "").trim();
    if (!serverId) {
      return new NextResponse("Server ID is required", { status: 400 });
    }

    await ensureServerEmojiStickerSchema();

    const access = await getServerManagementAccess({ serverId, profileId: profile.id, profileRole: profile.role });
    if (!access.canManage) {
      return new NextResponse("Only the server owner or an In-Accord administrator can manage emoji and stickers", { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      assetType?: string;
      name?: string;
      emoji?: string;
      imageUrl?: string;
    };

    const assetType = normalizeAssetType(body.assetType);
    const name = normalizeAssetName(body.name);
    const emoji = String(body.emoji ?? "").trim();
    const imageUrl = normalizeImageUrl(body.imageUrl);

    if (!assetType) {
      return new NextResponse("assetType is required", { status: 400 });
    }

    if (!isValidAssetName(name)) {
      return new NextResponse("name must be 2-32 chars using lowercase letters, numbers, or underscore", { status: 400 });
    }

    if (assetType === "EMOJI") {
      if (!emoji) {
        return new NextResponse("emoji is required for emoji assets", { status: 400 });
      }
    } else if (!imageUrl || !isValidImageUrl(imageUrl)) {
      return new NextResponse("imageUrl must be an absolute URL or app-relative path for sticker assets", { status: 400 });
    }

    await db.execute(sql`
      insert into "ServerEmojiSticker" (
        "id",
        "serverId",
        "assetType",
        "name",
        "emoji",
        "imageUrl",
        "isEnabled",
        "createdByProfileId",
        "createdAt",
        "updatedAt"
      )
      values (
        ${uuidv4()},
        ${serverId},
        ${assetType},
        ${name},
        ${assetType === "EMOJI" ? emoji : null},
        ${assetType === "STICKER" ? imageUrl : null},
        true,
        ${profile.id},
        now(),
        now()
      )
      on conflict ("serverId", "assetType", "name") do update
      set
        "emoji" = excluded."emoji",
        "imageUrl" = excluded."imageUrl",
        "isEnabled" = true,
        "createdByProfileId" = excluded."createdByProfileId",
        "updatedAt" = excluded."updatedAt"
    `);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[SERVER_EMOJI_STICKERS_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { serverId: rawServerId } = await params;

    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const serverId = String(rawServerId ?? "").trim();
    if (!serverId) {
      return new NextResponse("Server ID is required", { status: 400 });
    }

    await ensureServerEmojiStickerSchema();

    const access = await getServerManagementAccess({ serverId, profileId: profile.id, profileRole: profile.role });
    if (!access.canManage) {
      return new NextResponse("Only the server owner or an In-Accord administrator can manage emoji and stickers", { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      itemId?: string;
      action?: string;
    };

    const itemId = String(body.itemId ?? "").trim();
    const action = String(body.action ?? "").trim().toUpperCase();

    if (!itemId) {
      return new NextResponse("itemId is required", { status: 400 });
    }

    if (action === "DELETE") {
      await db.execute(sql`
        delete from "ServerEmojiSticker"
        where "id" = ${itemId}
          and "serverId" = ${serverId}
      `);

      return NextResponse.json({ ok: true, action });
    }

    if (action !== "ENABLE" && action !== "DISABLE") {
      return new NextResponse("action must be ENABLE, DISABLE, or DELETE", { status: 400 });
    }

    await db.execute(sql`
      update "ServerEmojiSticker"
      set
        "isEnabled" = ${action === "ENABLE"},
        "updatedAt" = now()
      where "id" = ${itemId}
        and "serverId" = ${serverId}
    `);

    return NextResponse.json({ ok: true, action });
  } catch (error) {
    console.error("[SERVER_EMOJI_STICKERS_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
