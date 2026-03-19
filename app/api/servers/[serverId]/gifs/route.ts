import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { db, member } from "@/lib/db";

type Params = { params: Promise<{ serverId: string }> };

const defaultGifs = [
  "https://media.giphy.com/media/ICOgUNjpvO0PC/giphy.gif",
  "https://media.giphy.com/media/l0HlBO7eyXzSZkJri/giphy.gif",
  "https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif",
  "https://media.giphy.com/media/26u4lOMA8JKSnL9Uk/giphy.gif",
  "https://media.giphy.com/media/111ebonMs90YLu/giphy.gif",
  "https://media.giphy.com/media/13CoXDiaCcCoyk/giphy.gif",
];

type ServerGifRow = {
  content: string | null;
  fileUrl: string | null;
  updatedAt: Date | string | null;
};

export async function GET(_req: Request, { params }: Params) {
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

    const existingMember = await db.query.member.findFirst({
      where: and(eq(member.serverId, serverId), eq(member.profileId, profile.id)),
      columns: { id: true },
    });

    if (!existingMember) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const rowsResult = await db.execute(sql`
      select
        m."content" as "content",
        m."fileUrl" as "fileUrl",
        m."updatedAt" as "updatedAt"
      from "Message" m
      where m."channelId" in (
        select c."id"
        from "Channel" c
        where c."serverId" = ${serverId}
      )
        and m."fileUrl" is not null
      order by m."updatedAt" desc
      limit 500
    `);

    const rows = ((rowsResult as unknown as { rows?: ServerGifRow[] }).rows ?? []).map((row) => ({
      content: typeof row.content === "string" ? row.content.trim() : "",
      fileUrl: typeof row.fileUrl === "string" ? row.fileUrl.trim() : "",
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    }));

    const seen = new Set<string>();
    const serverGifs: Array<{ url: string; label: string }> = [];

    for (const row of rows) {
      const normalizedContent = row.content.toLowerCase();
      const normalizedUrl = row.fileUrl.toLowerCase();
      const isGifLike =
        normalizedContent === "[gif]" ||
        normalizedContent.endsWith(" [gif]") ||
        normalizedUrl.includes(".gif") ||
        normalizedUrl.includes("giphy") ||
        normalizedUrl.includes("tenor");

      if (!row.fileUrl || !isGifLike || seen.has(row.fileUrl)) {
        continue;
      }

      seen.add(row.fileUrl);
      serverGifs.push({
        url: row.fileUrl,
        label: row.fileUrl,
      });

      if (serverGifs.length >= 40) {
        break;
      }
    }

    const normalizedDefaults = Array.from(new Set(defaultGifs.map((item) => item.trim()).filter(Boolean))).map(
      (url) => ({
        url,
        label: url,
      })
    );

    return NextResponse.json({
      serverGifs,
      defaultGifs: normalizedDefaults,
    });
  } catch (error) {
    console.error("[SERVER_GIFS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
