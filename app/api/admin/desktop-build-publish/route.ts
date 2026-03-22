import { execFile } from "child_process";
import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { promisify } from "util";

import { currentProfile } from "@/lib/current-profile";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import { resolveAdminGitRuntime } from "@/lib/admin-git-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const NPM_EXECUTABLE = process.platform === "win32" ? "npm.cmd" : "npm";

type PackageJsonShape = {
  version?: string;
  inaccordDisplayVersion?: string;
};

type BuildPublishResult = {
  appVersion: string | null;
  displayVersion: string | null;
  updateFeed: string | null;
  message: string;
};

let activeDesktopBuildPublish: Promise<BuildPublishResult> | null = null;

const ensureAdmin = async () => {
  const profile = await currentProfile();
  if (!profile) {
    return {
      ok: false as const,
      response: new NextResponse("Unauthorized", { status: 401 }),
    };
  }

  if (!hasInAccordAdministrativeAccess(profile.role)) {
    return {
      ok: false as const,
      response: new NextResponse("Forbidden", { status: 403 }),
    };
  }

  return { ok: true as const, profile };
};

const readResponse = (
  message: string,
  status = 500,
  extra?: Record<string, unknown>,
) =>
  NextResponse.json(
    {
      ok: false,
      message,
      ...(extra ?? {}),
    },
    { status },
  );

const runNpm = async (cwd: string, args: string[]) => {
  try {
    const { stdout, stderr } = await execFileAsync(NPM_EXECUTABLE, args, {
      cwd,
      env: process.env,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 64,
    });

    return {
      stdout: String(stdout ?? "").trim(),
      stderr: String(stderr ?? "").trim(),
    };
  } catch (error) {
    const stdout = String(
      (error as { stdout?: string | Buffer | null })?.stdout ?? "",
    ).trim();
    const stderr = String(
      (error as { stderr?: string | Buffer | null })?.stderr ?? "",
    ).trim();
    const detail = stderr || stdout || "Command failed.";
    throw new Error(`${NPM_EXECUTABLE} ${args.join(" ")}: ${detail}`);
  }
};

const readPackageVersions = async (repoRoot: string) => {
  const packageJsonPath = path.join(repoRoot, "package.json");
  const packageJsonContent = await readFile(packageJsonPath, "utf8");
  const packageJson = JSON.parse(packageJsonContent) as PackageJsonShape;

  return {
    appVersion: String(packageJson.version ?? "").trim() || null,
    displayVersion:
      String(packageJson.inaccordDisplayVersion ?? "").trim() || null,
  };
};

const runDesktopBuildPublish = async (repoRoot: string): Promise<BuildPublishResult> => {
  await runNpm(repoRoot, ["run", "version:bump:patch"]);
  await runNpm(repoRoot, ["run", "app:dist:win"]);

  const versions = await readPackageVersions(repoRoot);
  const updateFeed =
    String(process.env.INACCORD_DESKTOP_UPDATE_URL ?? "").trim() || null;

  return {
    ...versions,
    updateFeed,
    message:
      versions.appVersion || versions.displayVersion
        ? `Desktop build ${versions.appVersion ?? "Unknown"} / ${versions.displayVersion ?? "Unknown"} published to the updater feed.`
        : "Desktop build published to the updater feed.",
  };
};

export async function POST() {
  try {
    const auth = await ensureAdmin();
    if (!auth.ok) {
      return auth.response;
    }

    const gitRuntime = await resolveAdminGitRuntime();

    if (!gitRuntime.workTreeAvailable || !gitRuntime.repoRoot) {
      return readResponse(
        gitRuntime.reason === "git-binary-missing"
          ? "Desktop build publishing is unavailable because Git is not installed in this runtime."
          : gitRuntime.reason === "git-command-failed"
            ? gitRuntime.message
            : "Desktop build publishing is unavailable in the deployed website runtime. Run it from the local repo workspace.",
        409,
        {
          gitRuntime,
        },
      );
    }

    if (activeDesktopBuildPublish) {
      return readResponse(
        "A desktop build and updater push is already running.",
        409,
      );
    }

    activeDesktopBuildPublish = runDesktopBuildPublish(gitRuntime.repoRoot);
    const result = await activeDesktopBuildPublish;

    return NextResponse.json({
      ok: true,
      ...result,
      repoRoot: gitRuntime.repoRoot,
    });
  } catch (error) {
    console.error("[ADMIN_DESKTOP_BUILD_PUBLISH_POST]", error);
    return readResponse(
      error instanceof Error
        ? error.message
        : "Failed to build and publish the desktop updater.",
      500,
    );
  } finally {
    activeDesktopBuildPublish = null;
  }
}
