import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { db, server } from "@/lib/db";
import { ensureServerRolesSchema, seedDefaultServerRoles } from "@/lib/server-roles";

type Params = { params: { serverId: string; roleId: string } };

const colorRegex = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export async function PATCH(req: Request, { params }: Params) {
	try {
		const profile = await currentProfile();
		if (!profile) {
			return new NextResponse("Unauthorized", { status: 401 });
		}

		const serverId = String(params.serverId ?? "").trim();
		const roleId = String(params.roleId ?? "").trim();

		if (!serverId || !roleId) {
			return new NextResponse("Server ID and Role ID are required", { status: 400 });
		}

		const targetServer = await db.query.server.findFirst({
			where: and(eq(server.id, serverId), eq(server.profileId, profile.id)),
		});

		if (!targetServer) {
			return new NextResponse("Only the server owner can edit roles", { status: 403 });
		}

		await ensureServerRolesSchema();
		await seedDefaultServerRoles(serverId);

		const body = (await req.json().catch(() => ({}))) as {
			name?: string;
			color?: string;
			iconUrl?: string | null;
			position?: number;
		};

		const nextName =
			typeof body.name === "string"
				? body.name.trim()
				: undefined;

		const nextColor =
			typeof body.color === "string"
				? body.color.trim()
				: undefined;

		const nextPosition =
			typeof body.position === "number" && Number.isFinite(body.position)
				? Math.max(1, Math.floor(body.position))
				: undefined;

		const nextIconUrl =
			body.iconUrl === null
				? null
				: typeof body.iconUrl === "string"
					? (body.iconUrl.trim() || null)
					: undefined;

		if (nextName !== undefined && !nextName) {
			return new NextResponse("Role name cannot be empty", { status: 400 });
		}

		if (nextName !== undefined && nextName.length > 100) {
			return new NextResponse("Role name must be 100 characters or fewer", { status: 400 });
		}

		if (nextColor !== undefined && !colorRegex.test(nextColor)) {
			return new NextResponse("Role color must be a valid hex value", { status: 400 });
		}

		const updateResult = await db.execute(sql`
			update "ServerRole"
			set
				"name" = coalesce(${nextName}, "name"),
				"color" = coalesce(${nextColor}, "color"),
				"iconUrl" = case
					when ${nextIconUrl === undefined} then "iconUrl"
					else ${nextIconUrl}
				end,
				"position" = coalesce(${nextPosition}, "position"),
				"updatedAt" = now()
			where "id" = ${roleId}
				and "serverId" = ${serverId}
			returning "id", "name", "color", "iconUrl", "position", "isManaged"
		`);

		const role = (updateResult as unknown as {
			rows?: Array<{
				id: string;
				name: string;
				color: string;
				iconUrl: string | null;
				position: number;
				isManaged: boolean;
			}>;
		}).rows?.[0];

		if (!role) {
			return new NextResponse("Role not found", { status: 404 });
		}

		return NextResponse.json({ role });
	} catch (error) {
		console.error("[SERVER_ROLE_PATCH]", error);
		return new NextResponse("Internal Error", { status: 500 });
	}
}
