import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { getServerBackupRecord } from "@/lib/server-backups";
import { getServerManagementAccess } from "@/lib/server-management-access";

type Params = { params: Promise<{ serverId: string; backupId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { serverId, backupId } = await params;
    if (!serverId || !backupId) {
      return new NextResponse("Backup request is invalid.", { status: 400 });
    }

    const access = await getServerManagementAccess({ serverId, profileId: profile.id, profileRole: profile.role });

    if (!access.canManage) {
      return new NextResponse("Only the server owner or an In-Accord administrator can download backups.", { status: 403 });
    }

    const backup = await getServerBackupRecord(serverId, backupId);
    if (!backup) {
      return new NextResponse("Backup not found.", { status: 404 });
    }

    return new NextResponse(backup.snapshotJson, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${backup.fileName.replace(/"/g, "")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[SERVER_BACKUP_DOWNLOAD_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
