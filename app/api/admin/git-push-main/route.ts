import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

const ensureAdmin = async () => {
  const profile = await currentProfile();
  if (!profile) {
    return { ok: false as const, response: new NextResponse("Unauthorized", { status: 401 }) };
  }

  if (!hasInAccordAdministrativeAccess(profile.role)) {
    return { ok: false as const, response: new NextResponse("Forbidden", { status: 403 }) };
  }

  return { ok: true as const, profile };
};

const runGit = async (args: string[]) => {
  const { stdout, stderr } = await execFileAsync("git", args, {
    cwd: process.cwd(),
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });

  return {
    stdout: String(stdout ?? "").trim(),
    stderr: String(stderr ?? "").trim(),
  };
};

const runGitSafe = async (args: string[]) => {
  try {
    const result = await runGit(args);
    return {
      ok: true as const,
      stdout: result.stdout,
      stderr: result.stderr,
      error: null,
    };
  } catch (error) {
    return {
      ok: false as const,
      stdout: "",
      stderr: "",
      error,
    };
  }
};

export async function POST() {
  try {
    const auth = await ensureAdmin();
    if (!auth.ok) {
      return auth.response;
    }

    await runGit(["rev-parse", "--is-inside-work-tree"]);

    const currentBranch = await runGit(["branch", "--show-current"]);
    const branch = currentBranch.stdout || "unknown";

    const remoteBeforeResult = await runGitSafe(["rev-parse", "origin/main"]);
    const remoteBefore = remoteBeforeResult.ok ? remoteBeforeResult.stdout : null;

    const statusResult = await runGit(["status", "--porcelain"]);
    const hasLocalChanges = statusResult.stdout.length > 0;

    let committed = false;
    if (hasLocalChanges) {
      await runGit(["add", "-A"]);

      const commitMessage = `chore: admin push ${new Date().toISOString()}`;
      const firstCommitAttempt = await runGitSafe(["commit", "-m", commitMessage]);

      if (!firstCommitAttempt.ok) {
        const adminName = String((auth.profile as { name?: string | null }).name ?? "").trim() || "In-Accord Admin";
        const adminEmail = String((auth.profile as { email?: string | null }).email ?? "").trim() || "admin@local.in-accord";

        await runGit(["config", "user.name", adminName]);
        await runGit(["config", "user.email", adminEmail]);

        const secondCommitAttempt = await runGitSafe(["commit", "-m", commitMessage]);
        if (!secondCommitAttempt.ok) {
          throw secondCommitAttempt.error instanceof Error
            ? secondCommitAttempt.error
            : new Error("Failed to create commit before push.");
        }
      }

      committed = true;
    }

    await runGit(["push", "origin", "HEAD:main", "--force"]);

    const remoteAfter = await runGit(["rev-parse", "origin/main"]);

    return NextResponse.json({
      ok: true,
      branch,
      committed,
      hadLocalChanges: hasLocalChanges,
      remoteBefore,
      remoteAfter: remoteAfter.stdout || null,
      message: "Force push to origin/main completed.",
    });
  } catch (error) {
    console.error("[ADMIN_GIT_PUSH_MAIN_POST]", error);
    return new NextResponse(error instanceof Error ? error.message : "Failed to force push main.", {
      status: 500,
    });
  }
}
