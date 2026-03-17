import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { db, server } from "@/lib/db";
import { getServerBackupRecord } from "@/lib/server-backups";

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

    const ownerServer = await db.query.server.findFirst({
      where: and(eq(server.id, serverId), eq(server.profileId, profile.id)),
      columns: { id: true },
    });

    if (!ownerServer) {
      return new NextResponse("Only the server owner can download backups.", { status: 403 });
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
