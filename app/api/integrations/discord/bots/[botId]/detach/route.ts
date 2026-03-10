import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db, server } from "@/lib/db";
import { clearServerIntegrationBotFlags } from "@/lib/server-integration-bot-store";
import { makeIntegrationBotProfileId } from "@/lib/integration-bot-profile";

export async function POST(
  _req: Request,
  context: { params: Promise<{ botId: string }> }
) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = await context.params;
    const botId = String(params.botId ?? "").trim();

    if (!botId) {
      return NextResponse.json({ error: "Missing bot id." }, { status: 400 });
    }

    const botProfileId = makeIntegrationBotProfileId(profile.id, botId);

    const ownedServers = await db.query.server.findMany({
      where: eq(server.profileId, profile.id),
      columns: { id: true },
    });

    const ownedServerIds = ownedServers.map((item) => item.id).filter((value) => value.length > 0);

    for (const serverId of ownedServerIds) {
      await clearServerIntegrationBotFlags(serverId, botProfileId);
    }

    if (ownedServerIds.length === 0) {
      return NextResponse.json({
        detachedCount: 0,
        botProfileId,
        message: "No owned servers found to detach this bot from.",
      });
    }

    const deleteResult = await db.execute(sql`
      delete from "Member"
      where "profileId" = ${botProfileId}
        and "serverId" in (${sql.join(ownedServerIds.map((id) => sql`${id}`), sql`, `)})
      returning "id"
    `);

    const detachedCount = ((deleteResult as unknown as { rows?: Array<{ id: string }> }).rows ?? []).length;

    return NextResponse.json({
      detachedCount,
      botProfileId,
      message: `Detached bot from ${detachedCount} server member${detachedCount === 1 ? "" : "s"}.`,
    });
  } catch (error) {
    console.error("[Other_BOT_DETACH_POST]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
