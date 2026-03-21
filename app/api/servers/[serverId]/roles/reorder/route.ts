import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { getServerManagementAccess } from "@/lib/server-management-access";
import { ensureServerRolesSchema } from "@/lib/server-roles";

type Params = { params: Promise<{ serverId: string }> };

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

    const access = await getServerManagementAccess({ serverId, profileId: profile.id, profileRole: profile.role });
    if (!access.target) {
      return new NextResponse("Server not found", { status: 404 });
    }

    if (!access.canManage) {
      return new NextResponse("Only the server owner or an In-Accord administrator can reorder roles", { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as
      | { orderedRoleIds?: string[] }
      | null;

    const incomingOrderedRoleIds = body?.orderedRoleIds;
    const orderedRoleIds = Array.isArray(incomingOrderedRoleIds)
      ? incomingOrderedRoleIds.map((id) => String(id ?? "").trim()).filter(Boolean)
      : [];

    if (!orderedRoleIds.length) {
      return new NextResponse("orderedRoleIds is required", { status: 400 });
    }

    await ensureServerRolesSchema();

    const existingResult = await db.execute(sql`
      select "id"
      from "ServerRole"
      where "serverId" = ${serverId}
    `);

    const existingIds = new Set(
      ((existingResult as unknown as { rows?: Array<{ id: string }> }).rows ?? []).map((row) => row.id)
    );

    const incomingIds = new Set(orderedRoleIds);
    if (existingIds.size !== incomingIds.size) {
      return new NextResponse("orderedRoleIds must include all roles", { status: 400 });
    }

    for (const id of Array.from(existingIds)) {
      if (!incomingIds.has(id)) {
        return new NextResponse("orderedRoleIds must include all roles", { status: 400 });
      }
    }

    await db.transaction(async (tx: any) => {
      for (let index = 0; index < orderedRoleIds.length; index += 1) {
        const roleId = orderedRoleIds[index];
        await tx.execute(sql`
          update "ServerRole"
          set
            "position" = ${index + 1},
            "updatedAt" = now()
          where "id" = ${roleId}
            and "serverId" = ${serverId}
        `);
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[SERVER_ROLES_REORDER_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
