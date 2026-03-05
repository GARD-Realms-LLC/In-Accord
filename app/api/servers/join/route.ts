import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { currentProfile } from "@/lib/current-profile";
import { db, member, MemberRole, server } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      serverId?: string;
    } | null;

    const serverId = String(body?.serverId ?? "").trim();
    if (!serverId) {
      return new NextResponse("serverId is required", { status: 400 });
    }

    const targetServer = await db.query.server.findFirst({
      where: eq(server.id, serverId),
    });

    if (!targetServer) {
      return new NextResponse("Server not found", { status: 404 });
    }

    const existingMember = await db.query.member.findFirst({
      where: and(eq(member.serverId, serverId), eq(member.profileId, profile.id)),
    });

    if (!existingMember) {
      const now = new Date();
      await db.insert(member).values({
        id: uuidv4(),
        profileId: profile.id,
        serverId,
        role: MemberRole.GUEST,
        createdAt: now,
        updatedAt: now,
      });
    }

    return NextResponse.json({ ok: true, serverId, alreadyMember: Boolean(existingMember) });
  } catch (error) {
    console.error("[SERVERS_JOIN_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
