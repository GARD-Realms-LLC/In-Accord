import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { db, server } from "@/lib/db";
import { ensureServerRolesSchema } from "@/lib/server-roles";

type Params = { params: Promise<{ serverId: string; roleId: string }> };

const colorRegex = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export async function PATCH(req: Request, { params }: Params) {
	try {
		const resolvedParams = await params;

		const profile = await currentProfile();
		if (!profile) {
			return new NextResponse("Unauthorized", { status: 401 });
		}

		const serverId = String(resolvedParams.serverId ?? "").trim();
		const roleId = String(resolvedParams.roleId ?? "").trim();

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

		const body = (await req.json().catch(() => ({}))) as {
			name?: string;
			color?: string;
			iconUrl?: string | null;
			isMentionable?: boolean;
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

		const nextIsMentionable =
			typeof body.isMentionable === "boolean"
				? body.isMentionable
				: undefined;

		const shouldKeepName = nextName === undefined;
		const shouldKeepColor = nextColor === undefined;
		const shouldKeepPosition = nextPosition === undefined;
		const shouldKeepIcon = nextIconUrl === undefined;
		const shouldKeepIsMentionable = nextIsMentionable === undefined;

		const nextNameParam = nextName ?? "";
		const nextColorParam = nextColor ?? "#99aab5";
		const nextPositionParam = nextPosition ?? 0;
		const nextIconParam = nextIconUrl ?? null;
		const nextIsMentionableParam = nextIsMentionable ?? true;

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
				"name" = case
					when ${shouldKeepName} then "name"
					else ${nextNameParam}
				end,
				"color" = case
					when ${shouldKeepColor} then "color"
					else ${nextColorParam}
				end,
				"iconUrl" = case
					when ${shouldKeepIcon} then "iconUrl"
					else ${nextIconParam}
				end,
				"isMentionable" = case
					when ${shouldKeepIsMentionable} then "isMentionable"
					else ${nextIsMentionableParam}
				end,
				"position" = case
					when ${shouldKeepPosition} then "position"
					else ${nextPositionParam}
				end,
				"updatedAt" = now()
			where "id" = ${roleId}
				and "serverId" = ${serverId}
			returning "id", "name", "color", "iconUrl", "isMentionable", "position", "isManaged"
		`);

		const role = (updateResult as unknown as {
			rows?: Array<{
				id: string;
				name: string;
				color: string;
				iconUrl: string | null;
				isMentionable: boolean;
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

		const message = error instanceof Error ? error.message : String(error);
		if (/duplicate key|ServerRole_serverId_name_uq|unique/i.test(message)) {
			return new NextResponse("A role with that name already exists in this server", { status: 409 });
		}
		if (/undefined/i.test(message)) {
			return new NextResponse("Invalid role update payload", { status: 400 });
		}

		return new NextResponse("Internal Error", { status: 500 });
	}
}

export async function DELETE(_req: Request, { params }: Params) {
	try {
		const resolvedParams = await params;

		const profile = await currentProfile();
		if (!profile) {
			return new NextResponse("Unauthorized", { status: 401 });
		}

		const serverId = String(resolvedParams.serverId ?? "").trim();
		const roleId = String(resolvedParams.roleId ?? "").trim();

		if (!serverId || !roleId) {
			return new NextResponse("Server ID and Role ID are required", { status: 400 });
		}

		const targetServer = await db.query.server.findFirst({
			where: and(eq(server.id, serverId), eq(server.profileId, profile.id)),
		});

		if (!targetServer) {
			return new NextResponse("Only the server owner can delete roles", { status: 403 });
		}

		await ensureServerRolesSchema();

		const roleResult = await db.execute(sql`
			select "id", "isManaged"
			from "ServerRole"
			where "id" = ${roleId}
				and "serverId" = ${serverId}
			limit 1
		`);

		const role = (roleResult as unknown as {
			rows?: Array<{ id: string; isManaged: boolean }>;
		}).rows?.[0];

		if (!role) {
			return new NextResponse("Role not found", { status: 404 });
		}

		if (role.isManaged) {
			return new NextResponse("System roles cannot be deleted", { status: 400 });
		}

		await db.execute(sql`
			delete from "ServerRoleAssignment"
			where "roleId" = ${roleId}
				and "serverId" = ${serverId}
		`);

		await db.execute(sql`
			delete from "ServerRolePermission"
			where "roleId" = ${roleId}
				and "serverId" = ${serverId}
		`);

		await db.execute(sql`
			delete from "ServerRole"
			where "id" = ${roleId}
				and "serverId" = ${serverId}
		`);

		return NextResponse.json({ deletedRoleId: roleId });
	} catch (error) {
		console.error("[SERVER_ROLE_DELETE]", error);
		return new NextResponse("Internal Error", { status: 500 });
	}
}
