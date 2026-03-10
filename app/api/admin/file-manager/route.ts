import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

import { currentProfile } from "@/lib/current-profile";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ListedFile = {
  name: string;
  path: string;
  isDirectory: boolean;
  sizeBytes: number;
  updatedAt: string;
  url: string | null;
};

const workspaceRoot = process.cwd();
const excludedTopLevelEntries = new Set([".data", ".git", ".next-dev", ".vs", ".vscode"]);

const sanitizeSegment = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, "-");

const resolveSafeFolder = (folder: string) => {
  const trimmed = String(folder ?? "").trim();
  if (!trimmed) {
    return { absolute: workspaceRoot, relative: "" };
  }

  const normalized = path
    .normalize(trimmed)
    .replace(/^([/\\])+/, "")
    .replace(/^([a-zA-Z]:)/, "");

  const absolute = path.resolve(workspaceRoot, normalized);
  if (!absolute.startsWith(workspaceRoot)) {
    return null;
  }

  const relative = path.relative(workspaceRoot, absolute).replace(/\\/g, "/");

  const firstSegment = relative.split("/").filter(Boolean)[0] ?? "";
  if (firstSegment && excludedTopLevelEntries.has(firstSegment.toLowerCase())) {
    return null;
  }

  return { absolute, relative };
};

const ensureDirectory = async (directoryPath: string) => {
  await fs.mkdir(directoryPath, { recursive: true });
};

const toPublicUrl = (relativePath: string, isDirectory: boolean) => {
  if (isDirectory) {
    return null;
  }

  const normalized = relativePath.replace(/\\/g, "/").replace(/^\//, "");
  if (!normalized.toLowerCase().startsWith("public/")) {
    return null;
  }

  const publicPath = normalized.slice("public/".length);
  return `/${publicPath}`;
};

export async function GET(request: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!hasInAccordAdministrativeAccess(profile.role)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const folder = String(searchParams.get("folder") ?? "");
    const safeFolder = resolveSafeFolder(folder);

    if (!safeFolder) {
      return new NextResponse("Invalid folder path", { status: 400 });
    }

    await ensureDirectory(safeFolder.absolute);

    const entries = await fs.readdir(safeFolder.absolute, { withFileTypes: true });

    const files: ListedFile[] = [];
    for (const entry of entries) {
      if (excludedTopLevelEntries.has(entry.name.toLowerCase())) {
        continue;
      }

      const absoluteEntryPath = path.join(safeFolder.absolute, entry.name);
      const stats = await fs.stat(absoluteEntryPath);

      const relativePath = path
        .join(safeFolder.relative, entry.name)
        .replace(/\\/g, "/")
        .replace(/^\//, "");

      files.push({
        name: entry.name,
        path: relativePath,
        isDirectory: entry.isDirectory(),
        sizeBytes: entry.isDirectory() ? 0 : Number(stats.size ?? 0),
        updatedAt: new Date(stats.mtimeMs).toISOString(),
        url: toPublicUrl(relativePath, entry.isDirectory()),
      });
    }

    files.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }

      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    });

    return NextResponse.json({
      folder: safeFolder.relative,
      files,
    });
  } catch (error) {
    console.error("[ADMIN_FILE_MANAGER_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!hasInAccordAdministrativeAccess(profile.role)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const formData = await request.formData();
    const folder = String(formData.get("folder") ?? "");
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return new NextResponse("file is required", { status: 400 });
    }

    const safeFolder = resolveSafeFolder(folder);
    if (!safeFolder) {
      return new NextResponse("Invalid folder path", { status: 400 });
    }

    await ensureDirectory(safeFolder.absolute);

    const originalName = file.name || `upload-${Date.now()}`;
    const ext = path.extname(originalName);
    const base = path.basename(originalName, ext);
    const safeFileName = `${sanitizeSegment(base)}${sanitizeSegment(ext) || ""}` || `upload-${Date.now()}`;

    const targetPath = path.join(safeFolder.absolute, safeFileName);

    const data = await file.arrayBuffer();
    await fs.writeFile(targetPath, Buffer.from(data));

    const relativePath = path
      .join(safeFolder.relative, safeFileName)
      .replace(/\\/g, "/")
      .replace(/^\//, "");

    return NextResponse.json({
      ok: true,
      file: {
        name: safeFileName,
        path: relativePath,
        url: toPublicUrl(relativePath, false),
      },
    });
  } catch (error) {
    console.error("[ADMIN_FILE_MANAGER_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!hasInAccordAdministrativeAccess(profile.role)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as { path?: string } | null;
    const targetRelativePath = String(body?.path ?? "").trim();

    if (!targetRelativePath) {
      return new NextResponse("path is required", { status: 400 });
    }

    const safe = resolveSafeFolder(targetRelativePath);
    if (!safe) {
      return new NextResponse("Invalid path", { status: 400 });
    }

    const targetStats = await fs.stat(safe.absolute).catch(() => null);
    if (!targetStats || targetStats.isDirectory()) {
      return new NextResponse("File not found", { status: 404 });
    }

    await fs.unlink(safe.absolute);

    return NextResponse.json({ ok: true, path: safe.relative });
  } catch (error) {
    console.error("[ADMIN_FILE_MANAGER_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
