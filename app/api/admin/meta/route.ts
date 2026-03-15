import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";

import { currentProfile } from "@/lib/current-profile";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";

type PackageJsonShape = {
  name?: string;
  version?: string;
  inaccordDisplayVersion?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  repository?: string | { type?: string; url?: string };
  bugs?: string | { url?: string };
  homepage?: string;
};

const DEFAULT_GITHUB_REPO_URL = "https://github.com/GARD-Realms-LLC/In-Accord";
const execFileAsync = promisify(execFile);
const SDK_SOURCE_FILE = "In-Accord.js";
const SDK_BASE_VERSION = "1.0.0.1";

declare global {
  // eslint-disable-next-line no-var
  var inAccordSdkVersionCache:
    | {
        sourceHash: string;
        version: string;
      }
    | undefined;
}

const isPlaceholder = (value?: string) =>
  !value || value.trim() === "" || value.includes("replace_me");

type CommitLogEntry = {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  committedAt: string;
};

type GitHubCommitEntry = {
  sha: string;
  shortSha: string;
  message: string;
  url: string;
  committedAt: string;
};

const normalizeRepoUrl = (value: string | null | undefined) => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  const withoutGitPlus = raw.replace(/^git\+/, "");
  const withoutGitSuffix = withoutGitPlus.replace(/\.git$/i, "");

  if (withoutGitSuffix.startsWith("git@github.com:")) {
    return `https://github.com/${withoutGitSuffix.slice("git@github.com:".length)}`;
  }

  if (/^https?:\/\//i.test(withoutGitSuffix)) {
    return withoutGitSuffix;
  }

  return null;
};

const toDisplayVersion = (value: string | null | undefined) => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "Unknown";
  }

  return raw.replace(/^[~^]/, "");
};

const toAppDisplayVersion = (value: string | null | undefined) => {
  const normalized = toDisplayVersion(value);
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return normalized;
  }

  return `${match[1]}.${match[2]}.${match[3].padStart(2, "0")}`;
};

const normalizeSdkVersion = (value: string | null | undefined) => {
  const raw = String(value ?? "").trim();
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(raw)) {
    return SDK_BASE_VERSION;
  }
  return raw;
};

const bumpSdkVersion = (value: string) => {
  const normalized = normalizeSdkVersion(value);
  const parts = normalized.split(".").map((part) => Number.parseInt(part, 10));

  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part) || part < 0)) {
    return SDK_BASE_VERSION;
  }

  return `${parts[0]}.${parts[1]}.${parts[2]}.${parts[3] + 1}`;
};

const getSdkVersion = async () => {
  try {
    const root = process.cwd();
    const sdkSourcePath = path.join(root, SDK_SOURCE_FILE);
    const sdkSourceContent = await readFile(sdkSourcePath, "utf8");
    const sourceHash = createHash("sha256").update(sdkSourceContent).digest("hex");

    if (globalThis.inAccordSdkVersionCache?.sourceHash === sourceHash) {
      return globalThis.inAccordSdkVersionCache.version;
    }

    const previousVersion = normalizeSdkVersion(globalThis.inAccordSdkVersionCache?.version);
    const nextVersion = globalThis.inAccordSdkVersionCache ? bumpSdkVersion(previousVersion) : SDK_BASE_VERSION;

    globalThis.inAccordSdkVersionCache = {
      sourceHash,
      version: nextVersion,
    };

    return nextVersion;
  } catch {
    return globalThis.inAccordSdkVersionCache?.version ?? SDK_BASE_VERSION;
  }
};

const parseGitHubOwnerRepo = (repositoryUrl: string | null | undefined) => {
  const normalized = normalizeRepoUrl(repositoryUrl);
  if (!normalized) {
    return null;
  }

  const matched = normalized.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)$/i);
  if (!matched) {
    return null;
  }

  const owner = matched[1]?.trim();
  const repo = matched[2]?.trim();

  if (!owner || !repo) {
    return null;
  }

  return { owner, repo };
};

const getRecentCommitLog = async (): Promise<CommitLogEntry[]> => {
  try {
    const prettyFormat = "%H%x1f%h%x1f%s%x1f%an%x1f%cI";
    const { stdout } = await execFileAsync(
      "git",
      ["log", "-n", "12", `--pretty=format:${prettyFormat}`],
      {
        cwd: process.cwd(),
      }
    );

    const rows = String(stdout ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [sha, shortSha, message, author, committedAt] = line.split("\u001f");

        if (!sha || !shortSha || !message || !author || !committedAt) {
          return null;
        }

        return {
          sha,
          shortSha,
          message,
          author,
          committedAt,
        } satisfies CommitLogEntry;
      })
      .filter((entry): entry is CommitLogEntry => Boolean(entry));

    return rows;
  } catch {
    return [];
  }
};

const getRecentGitHubCommits = async (
  repositoryUrl: string,
  branch: string
): Promise<GitHubCommitEntry[]> => {
  try {
    const parsed = parseGitHubOwnerRepo(repositoryUrl);
    if (!parsed) {
      return [];
    }

    const search = new URLSearchParams({
      sha: branch,
      per_page: "5",
    });

    const endpoint = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(
      parsed.repo
    )}/commits?${search.toString()}`;

    const token = process.env.GITHUB_TOKEN || process.env.INACCORD_GITHUB_TOKEN || null;
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "In-Accord-AdminMeta",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as Array<{
      sha?: string;
      html_url?: string;
      commit?: {
        message?: string;
        author?: {
          date?: string;
        };
      };
    }>;

    return (payload ?? [])
      .map((entry) => {
        const sha = String(entry.sha ?? "").trim();
        if (!sha) {
          return null;
        }

        return {
          sha,
          shortSha: sha.slice(0, 7),
          message: String(entry.commit?.message ?? "").split("\n")[0] ?? "",
          url: String(entry.html_url ?? "").trim() || `${repositoryUrl}/commit/${sha}`,
          committedAt: String(entry.commit?.author?.date ?? "").trim(),
        } satisfies GitHubCommitEntry;
      })
      .filter((entry): entry is GitHubCommitEntry => Boolean(entry));
  } catch {
    return [];
  }
};

export async function GET() {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!hasInAccordAdministrativeAccess(profile.role)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const packagePath = path.join(process.cwd(), "package.json");
    const packageContent = await readFile(packagePath, "utf8");
    const packageJson = JSON.parse(packageContent) as PackageJsonShape;

    const envRepoUrl = normalizeRepoUrl(process.env.INACCORD_GITHUB_REPO_URL);
    const envIssuesUrl = normalizeRepoUrl(process.env.INACCORD_GITHUB_ISSUES_URL);

    const repoField = packageJson.repository;
    const repositoryUrl =
      envRepoUrl ||
      normalizeRepoUrl(typeof repoField === "string" ? repoField : repoField?.url) ||
      DEFAULT_GITHUB_REPO_URL;
    const bugsUrl =
      envIssuesUrl ||
      normalizeRepoUrl(typeof packageJson.bugs === "string" ? packageJson.bugs : packageJson.bugs?.url) ||
      `${repositoryUrl}/issues`;

    const commitSha =
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.GITHUB_SHA ||
      process.env.COMMIT_SHA ||
      null;

    const branch =
      process.env.VERCEL_GIT_COMMIT_REF ||
      process.env.GITHUB_REF_NAME ||
      process.env.BRANCH_NAME ||
      process.env.INACCORD_DEFAULT_BRANCH ||
      "main";

    const commits = await getRecentCommitLog();
    const githubMainCommits = await getRecentGitHubCommits(repositoryUrl, "main");
    const sdkVersion = await getSdkVersion();

    const storageConfigured =
      !isPlaceholder(process.env.CLOUDFLARE_R2_ACCOUNT_ID) &&
      !isPlaceholder(process.env.CLOUDFLARE_R2_ACCESS_KEY_ID) &&
      !isPlaceholder(process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY) &&
      !isPlaceholder(process.env.CLOUDFLARE_R2_BUCKET_NAME || "inaccord");

    return NextResponse.json({
      build: {
        appName: packageJson.name ?? "In-Accord",
        appVersion: toAppDisplayVersion(packageJson.inaccordDisplayVersion ?? packageJson.version),
        sdkVersion: toDisplayVersion(sdkVersion),
        nextVersion: toDisplayVersion(
          packageJson.dependencies?.next ?? packageJson.devDependencies?.next ?? null
        ),
        nodeEnv: process.env.NODE_ENV ?? "unknown",
        buildTimestamp:
          process.env.BUILD_TIMESTAMP ||
          process.env.VERCEL_GIT_COMMIT_DATE ||
          new Date().toISOString(),
        commitSha,
        branch,
      },
      github: {
        repositoryUrl,
        homepageUrl: normalizeRepoUrl(packageJson.homepage) || repositoryUrl,
        issuesUrl: bugsUrl,
      },
      storage: {
        documentStorageConfigured: storageConfigured,
        provider: "Cloudflare R2",
        applicationsPath: "Client/Applications/",
      },
      commits,
      githubMainCommits,
    });
  } catch (error) {
    console.error("[ADMIN_META_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
