import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db, server } from "@/lib/db";

export async function DELETE(
  req: Request,
  { params }: { params: { serverId: string } }
) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!params.serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const target = await db.query.server.findFirst({
      where: and(eq(server.id, params.serverId), eq(server.profileId, profile.id)),
    });

    if (!target) {
      return new NextResponse("Server not found", { status: 404 });
    }

    await db.delete(server).where(
      and(eq(server.id, params.serverId), eq(server.profileId, profile.id))
    );

    return NextResponse.json(target);
  } catch (error) {
    console.log("[SERVER_ID_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { serverId: string } }
) {
  try {
    const profile = await currentProfile();
    const { name, imageUrl } = await req.json();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!params.serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    await db.update(server).set({
        name,
        imageUrl,
        updatedAt: new Date(),
      }).where(and(eq(server.id, params.serverId), eq(server.profileId, profile.id)));

    const updatedServer = await db.query.server.findFirst({
      where: and(eq(server.id, params.serverId), eq(server.profileId, profile.id)),
    });

    return NextResponse.json(updatedServer);
  } catch (error) {
    console.log("[SERVER_ID_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
