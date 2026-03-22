import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { ensureChannelThreadSchema } from "@/lib/channel-threads";

type TopbarThreadRow = {
  id: string;
  title: string;
  serverId: string;
  serverName: string | null;
  channelId: string;
  channelName: string | null;
  archived: boolean;
  unreadCount: number | string;
  lastActivityAt: Date | string;
};

export async function GET() {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await ensureChannelThreadSchema();

    const result = await db.execute(sql`
      select
        ct."id" as "id",
        ct."title" as "title",
        ct."serverId" as "serverId",
        s."name" as "serverName",
        ct."channelId" as "channelId",
        ch."name" as "channelName",
        ct."archived" as "archived",
        case
          when ct."lastActivityAt" > coalesce(trs."lastReadAt", timestamp 'epoch') then 1
          else 0
        end as "unreadCount",
        ct."lastActivityAt" as "lastActivityAt"
      from "ChannelThread" ct
      inner join "Member" m
        on m."serverId" = ct."serverId"
      left join "Server" s
        on s."id" = ct."serverId"
      left join "Channel" ch
        on ch."id" = ct."channelId"
      left join "ThreadReadState" trs
        on trs."threadId" = ct."id"
       and trs."profileId" = ${profile.id}
      where m."profileId" = ${profile.id}
      order by ct."archived" asc, ct."lastActivityAt" desc
      limit 75
    `);

    const threads = ((result as unknown as { rows?: TopbarThreadRow[] }).rows ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      serverId: row.serverId,
      serverName: row.serverName ?? "Server",
      channelId: row.channelId,
      channelName: row.channelName ?? "channel",
      archived: Boolean(row.archived),
      unreadCount: Number(row.unreadCount ?? 0),
      lastActivityAt: new Date(row.lastActivityAt).toISOString(),
    }));

    return NextResponse.json({ threads });
  } catch (error) {
    console.error("[THREADS_TOPBAR_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
