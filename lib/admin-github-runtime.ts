import packageJson from "../package.json";

type PackageJsonShape = {
  repository?: string | { type?: string; url?: string };
};

export type AdminGitHubRepository = {
  owner: string;
  repo: string;
  repositoryUrl: string;
};

export type AdminGitHubBranchHead = {
  branch: string;
  sha: string;
  shortSha: string;
  commitUrl: string;
  repositoryUrl: string;
};

const DEFAULT_GITHUB_REPO_URL = "https://github.com/GARD-Realms-LLC/In-Accord";

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

  return {
    owner,
    repo,
    repositoryUrl: normalized,
  } satisfies AdminGitHubRepository;
};

const getConfiguredRepositoryUrl = () => {
  const packageJsonValue = packageJson as PackageJsonShape;
  const repoField = packageJsonValue.repository;

  return (
    normalizeRepoUrl(process.env.INACCORD_GITHUB_REPO_URL) ||
    normalizeRepoUrl(typeof repoField === "string" ? repoField : repoField?.url) ||
    DEFAULT_GITHUB_REPO_URL
  );
};

const getRequestHeaders = (token?: string | null) => ({
  Accept: "application/vnd.github+json",
  "User-Agent": "In-Accord-AdminRuntime",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

export const resolveAdminGitHubRepository = () => parseGitHubOwnerRepo(getConfiguredRepositoryUrl());

export const resolveAdminGitHubToken = () => {
  const token =
    String(process.env.INACCORD_GITHUB_TOKEN ?? "").trim() ||
    String(process.env.GITHUB_TOKEN ?? "").trim() ||
    null;

  return token;
};

export const getAdminGitHubBranchHead = async (
  branch: string,
): Promise<AdminGitHubBranchHead | null> => {
  const repository = resolveAdminGitHubRepository();
  if (!repository) {
    return null;
  }

  const normalizedBranch = String(branch ?? "").trim() || "main";
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/commits/${encodeURIComponent(normalizedBranch)}`,
    {
      method: "GET",
      headers: getRequestHeaders(resolveAdminGitHubToken()),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const detail = String(await response.text().catch(() => "")).trim();
    throw new Error(
      `GitHub commit lookup failed for ${repository.owner}/${repository.repo}@${normalizedBranch} (${response.status})${detail ? `: ${detail}` : "."}`,
    );
  }

  const payload = (await response.json()) as {
    sha?: string;
    html_url?: string;
  };

  const sha = String(payload.sha ?? "").trim();
  if (!sha) {
    throw new Error(`GitHub did not return a commit SHA for ${normalizedBranch}.`);
  }

  return {
    branch: normalizedBranch,
    sha,
    shortSha: sha.slice(0, 7),
    commitUrl:
      String(payload.html_url ?? "").trim() || `${repository.repositoryUrl}/commit/${sha}`,
    repositoryUrl: repository.repositoryUrl,
  };
};

export const dispatchAdminGitHubWorkflow = async (options: {
  workflowId: string;
  ref: string;
  inputs?: Record<string, string>;
}) => {
  const repository = resolveAdminGitHubRepository();
  if (!repository) {
    throw new Error(
      "GitHub workflow dispatch is not configured because no repository URL is available.",
    );
  }

  const token = resolveAdminGitHubToken();
  if (!token) {
    throw new Error(
      "GitHub workflow dispatch is unavailable because INACCORD_GITHUB_TOKEN (or GITHUB_TOKEN) is not configured in this runtime.",
    );
  }

  const workflowId = String(options.workflowId ?? "").trim();
  const ref = String(options.ref ?? "").trim() || "main";
  if (!workflowId) {
    throw new Error("GitHub workflow dispatch requires a workflow file name or ID.");
  }

  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/actions/workflows/${encodeURIComponent(workflowId)}/dispatches`,
    {
      method: "POST",
      headers: {
        ...getRequestHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref,
        inputs: options.inputs ?? {},
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const detail = String(await response.text().catch(() => "")).trim();
    throw new Error(
      `GitHub workflow dispatch failed for ${workflowId} (${response.status})${detail ? `: ${detail}` : "."}`,
    );
  }

  return {
    ...repository,
    workflowId,
    ref,
  };
};