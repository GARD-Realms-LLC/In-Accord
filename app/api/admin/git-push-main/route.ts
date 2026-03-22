import { NextResponse } from "next/server";

import { resolveAdminGitRuntime, runAdminGit } from "@/lib/admin-git-runtime";
import { currentProfile } from "@/lib/current-profile";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_GIT_STAGE_CHUNK_SIZE = 200;

const isExcludedPushPath = (value: string) =>
  value === ".tmp-asar-inspect" ||
  value.startsWith(".tmp-asar-inspect/") ||
  value.startsWith(".tmp-asar-check-") ||
  value.startsWith(".tmp-electron-") ||
  value.startsWith("Desktop/win64/") ||
  value.startsWith("Desktop/Win Dev/") ||
  /^\.tmp-electron-[^/]+\.log$/i.test(value);

const parseLineList = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

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

const runGitSafe = async (repoRoot: string, args: string[]) => {
  try {
    const result = await runAdminGit(repoRoot, args);
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

const getPushCandidatePaths = async (repoRoot: string) => {
  const [cachedDiff, workingTreeDiff, untrackedFiles] = await Promise.all([
    runAdminGit(repoRoot, ["diff", "--name-only", "--cached", "--relative"]),
    runAdminGit(repoRoot, ["diff", "--name-only", "--relative"]),
    runAdminGit(repoRoot, ["ls-files", "--others", "--exclude-standard"]),
  ]);

  return Array.from(
    new Set(
      [...parseLineList(cachedDiff.stdout), ...parseLineList(workingTreeDiff.stdout), ...parseLineList(untrackedFiles.stdout)]
        .map((filePath) => filePath.replace(/\\/g, "/"))
        .filter((filePath) => !isExcludedPushPath(filePath))
    )
  );
};

const stagePushCandidateChanges = async (repoRoot: string, paths: string[]) => {
  for (let index = 0; index < paths.length; index += ADMIN_GIT_STAGE_CHUNK_SIZE) {
    const chunk = paths.slice(index, index + ADMIN_GIT_STAGE_CHUNK_SIZE);
    if (!chunk.length) {
      continue;
    }

    await runAdminGit(repoRoot, ["add", "-A", "--", ...chunk]);
  }
};

const readResponse = (message: string, status = 500, extra?: Record<string, unknown>) =>
  NextResponse.json(
    {
      ok: false,
      message,
      ...(extra ?? {}),
    },
    { status }
  );

export async function POST() {
  try {
    const auth = await ensureAdmin();
    if (!auth.ok) {
      return auth.response;
    }

    const gitRuntime = await resolveAdminGitRuntime();
    if (!gitRuntime.workTreeAvailable || !gitRuntime.repoRoot) {
      return readResponse(gitRuntime.message, 409, {
        reason: gitRuntime.reason,
        mode: gitRuntime.mode,
        repoRoot: gitRuntime.repoRoot,
      });
    }

    await runAdminGit(gitRuntime.repoRoot, ["rev-parse", "--is-inside-work-tree"]);

    const currentBranch = await runAdminGit(gitRuntime.repoRoot, ["branch", "--show-current"]);
    const branch = currentBranch.stdout || "unknown";
    const localHead = await runAdminGit(gitRuntime.repoRoot, ["rev-parse", "HEAD"]);

    const remoteBeforeResult = await runGitSafe(gitRuntime.repoRoot, ["rev-parse", "origin/main"]);
    const remoteBefore = remoteBeforeResult.ok ? remoteBeforeResult.stdout : null;

    const pushCandidatePaths = await getPushCandidatePaths(gitRuntime.repoRoot);
    const hasLocalChanges = pushCandidatePaths.length > 0;

    let committed = false;
    if (hasLocalChanges) {
      await stagePushCandidateChanges(gitRuntime.repoRoot, pushCandidatePaths);

      const commitMessage = `chore: admin push ${new Date().toISOString()}`;
      const firstCommitAttempt = await runGitSafe(gitRuntime.repoRoot, ["commit", "-m", commitMessage]);

      if (!firstCommitAttempt.ok) {
        const adminName = String((auth.profile as { name?: string | null }).name ?? "").trim() || "In-Accord Admin";
        const adminEmail = String((auth.profile as { email?: string | null }).email ?? "").trim() || "admin@local.in-accord";

        await runAdminGit(gitRuntime.repoRoot, ["config", "user.name", adminName]);
        await runAdminGit(gitRuntime.repoRoot, ["config", "user.email", adminEmail]);

        const secondCommitAttempt = await runGitSafe(gitRuntime.repoRoot, ["commit", "-m", commitMessage]);
        if (!secondCommitAttempt.ok) {
          throw secondCommitAttempt.error instanceof Error
            ? secondCommitAttempt.error
            : new Error("Failed to create commit before push.");
        }
      }

      committed = true;
    } else {
      return NextResponse.json({
        ok: true,
        branch,
        committed: false,
        hadLocalChanges: false,
        remoteBefore,
        remoteAfter: remoteBefore,
        message: "No pushable repository changes were found after excluding temporary desktop inspection artifacts.",
      });
    }

    await runAdminGit(gitRuntime.repoRoot, ["push", "origin", "HEAD:main", "--force"]);

    const remoteAfter = await runAdminGit(gitRuntime.repoRoot, ["rev-parse", "origin/main"]);

    return NextResponse.json({
      ok: true,
      branch,
      committed,
      hadLocalChanges: hasLocalChanges,
      repoRoot: gitRuntime.repoRoot,
      localHead: localHead.stdout || null,
      remoteBefore,
      remoteAfter: remoteAfter.stdout || null,
      message: "Force push to origin/main completed.",
    });
  } catch (error) {
    console.error("[ADMIN_GIT_PUSH_MAIN_POST]", error);
    return readResponse(
      error instanceof Error ? error.message : "Failed to force push main.",
      500
    );
  }
}
