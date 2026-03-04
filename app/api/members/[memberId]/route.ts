import { NextResponse } from "next/server";
import { and, asc, eq, ne } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db, member, server } from "@/lib/db";

export async function DELETE(
  req: Request,
  { params }: { params: { memberId: string } }
) {
  try {
    const profile = await currentProfile();
    const { searchParams } = new URL(req.url);

    const serverId = searchParams.get("serverId");

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    if (!params.memberId) {
      return new NextResponse("Member ID missing", { status: 400 });
    }

    const ownerServer = await db.query.server.findFirst({
      where: and(eq(server.id, serverId), eq(server.profileId, profile.id)),
    });

    if (!ownerServer) {
      return new NextResponse("Server not found", { status: 404 });
    }

    await db.delete(member).where(
      and(
        eq(member.id, params.memberId),
        eq(member.serverId, serverId),
        ne(member.profileId, profile.id)
      )
    );

    const updatedServer = await db.query.server.findFirst({
      where: eq(server.id, serverId),
      with: {
        members: {
          with: {
            profile: true,
          },
          orderBy: (members, { asc }) => [asc(members.role)],
        },
      },
    });

    return NextResponse.json(updatedServer);
  } catch (error) {
    console.log("[MEMBERS_ID_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { memberId: string } }
) {
  try {
    const profile = await currentProfile();
    const { searchParams } = new URL(req.url);
    const { role } = await req.json();

    const serverId = searchParams.get("serverId");

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    if (!params.memberId) {
      return new NextResponse("Member ID missing", { status: 400 });
    }

    const ownerServer = await db.query.server.findFirst({
      where: and(eq(server.id, serverId), eq(server.profileId, profile.id)),
    });

    if (!ownerServer) {
      return new NextResponse("Server not found", { status: 404 });
    }

    await db.update(member).set({
      role,
      updatedAt: new Date(),
    }).where(
      and(
        eq(member.id, params.memberId),
        eq(member.serverId, serverId),
        ne(member.profileId, profile.id)
      )
    );

    const updatedServer = await db.query.server.findFirst({
      where: eq(server.id, serverId),
      with: {
        members: {
          with: {
            profile: true,
          },
          orderBy: (members, { asc }) => [asc(members.role)],
        },
      },
    });

    return NextResponse.json(updatedServer);
  } catch (error) {
    console.log("[MEMBERS_ID_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
