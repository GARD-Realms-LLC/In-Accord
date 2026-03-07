import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { db, member } from "@/lib/db";

type Params = { params: Promise<{ serverId: string }> };

const defaultEmotes = [
  "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f60a.png",
  "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f44d.png",
  "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f525.png",
  "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f389.png",
  "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f64c.png",
  "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f44f.png",
];

type ServerEmoteRow = {
  fileUrl: string | null;
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
        m."fileUrl" as "fileUrl"
      from "Message" m
      inner join "Channel" c on c."id" = m."channelId"
      where c."serverId" = ${serverId}
        and m."fileUrl" is not null
        and (
          lower(coalesce(m."content", '')) = '[emote]'
          or lower(m."fileUrl") like '%/emotes/%'
          or lower(m."fileUrl") like '%emoji%'
        )
      order by m."updatedAt" desc
      limit 250
    `);

    const rows = (rowsResult as unknown as { rows?: ServerEmoteRow[] }).rows ?? [];

    const seen = new Set<string>();
    const serverEmotes: Array<{ url: string; label: string }> = [];

    for (const row of rows) {
      const normalized = String(row.fileUrl ?? "").trim();
      if (!normalized || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      serverEmotes.push({
        url: normalized,
        label: normalized,
      });

      if (serverEmotes.length >= 40) {
        break;
      }
    }

    const normalizedDefaults = Array.from(new Set(defaultEmotes.map((item) => item.trim()).filter(Boolean))).map(
      (url) => ({
        url,
        label: url,
      })
    );

    return NextResponse.json({
      serverEmotes,
      defaultEmotes: normalizedDefaults,
    });
  } catch (error) {
    console.error("[SERVER_EMOTES_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
