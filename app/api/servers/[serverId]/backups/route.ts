import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { getServerManagementAccess } from "@/lib/server-management-access";
import {
  createServerBackup,
  getServerBackupConfig,
  listServerBackups,
  type ServerBackupConfigPatch,
  upsertServerBackupConfig,
} from "@/lib/server-backups";

type Params = { params: Promise<{ serverId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { serverId } = await params;
    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const access = await getServerManagementAccess({ serverId, profileId: profile.id, profileRole: profile.role });
    if (!access.canManage) {
      return new NextResponse("Only the server owner or an In-Accord administrator can manage backups.", { status: 403 });
    }

    const [config, backups] = await Promise.all([
      getServerBackupConfig(serverId),
      listServerBackups(serverId),
    ]);

    return NextResponse.json({
      serverId,
      config,
      backups,
    });
  } catch (error) {
    console.error("[SERVER_BACKUPS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { serverId } = await params;
    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const access = await getServerManagementAccess({ serverId, profileId: profile.id, profileRole: profile.role });
    if (!access.canManage) {
      return new NextResponse("Only the server owner or an In-Accord administrator can manage backups.", { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as ServerBackupConfigPatch;
    const config = await upsertServerBackupConfig(serverId, body);
    const backups = await listServerBackups(serverId);

    return NextResponse.json({
      serverId,
      config,
      backups,
    });
  } catch (error) {
    console.error("[SERVER_BACKUPS_PATCH]", error);
    return new NextResponse(error instanceof Error ? error.message : "Internal Error", { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { serverId } = await params;
    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const access = await getServerManagementAccess({ serverId, profileId: profile.id, profileRole: profile.role });
    if (!access.canManage) {
      return new NextResponse("Only the server owner or an In-Accord administrator can create backups.", { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as { destination?: "FILE" | "S3" | "FTP" };
    const backup = await createServerBackup({
      serverId,
      createdByProfileId: profile.id,
      destinationOverride: body.destination,
    });

    const config = await getServerBackupConfig(serverId);
    const backups = await listServerBackups(serverId);

    return NextResponse.json({
      serverId,
      config,
      backups,
      backup,
      downloadUrl: `/api/servers/${encodeURIComponent(serverId)}/backups/${encodeURIComponent(backup.id)}`,
    });
  } catch (error) {
    console.error("[SERVER_BACKUPS_POST]", error);
    return new NextResponse(error instanceof Error ? error.message : "Internal Error", { status: 500 });
  }
}
