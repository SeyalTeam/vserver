import { execFile } from "node:child_process";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { access, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import Fastify from "fastify";
import cors from "@fastify/cors";
import { config as loadEnv } from "dotenv";

type DeploymentSource = "server-tracker";

type Deployment = {
  deploymentId: string;
  environment: string;
  status: string;
  duration: string;
  projectName: string;
  branch: string;
  commitHash: string;
  commitMessage: string;
  trackedAt?: string;
  commitAt?: string;
  createdRelative: string;
  author: string;
  serverHost?: string;
  source: DeploymentSource;
};

type TrackerEntry = {
  trackedAt?: string;
  commitAt?: string;
  deploymentId?: string;
  projectName?: string;
  environment?: string;
  status?: string;
  duration?: string;
  branch?: string;
  commitHash?: string;
  commitMessage?: string;
  author?: string;
  serverHost?: string;
  source?: string;
};

type DeploymentsMeta = {
  project: string;
  source: DeploymentSource;
  mode?: "remote" | "local";
  remoteHost?: string;
  logPath?: string;
  repositoryPath?: string;
};

type RequestLogSource = "server-access-log";

type RequestLogEntry = {
  logId: string;
  timestamp: string;
  method: string;
  statusCode: number | null;
  host: string;
  path: string;
  message: string;
  projectSlug: string;
  projectName: string;
  remoteAddr?: string;
  source: RequestLogSource;
};

type RequestLogsMeta = {
  project: string;
  source: RequestLogSource;
  mode: "remote" | "local";
  remoteHost?: string;
  logPath: string;
  tailedLines: number;
};

type ParsedRequestLogLine = {
  timestamp?: string;
  method: string;
  statusCode: number | null;
  host: string;
  path: string;
  message: string;
  remoteAddr?: string;
  projectHint?: string;
};

type OAuthProvider = "github" | "gitlab" | "bitbucket";

type OAuthState = {
  provider: OAuthProvider;
  returnTo: string;
  createdAt: number;
};

type OAuthConnection = {
  provider: OAuthProvider;
  accountId: string;
  accountName: string;
  avatarUrl?: string;
  connectedAt: string;
};

type OAuthAccessToken = {
  provider: OAuthProvider;
  accountId: string;
  token: string;
  updatedAt: string;
};

type GitHubTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GitHubUserResponse = {
  id: number;
  login: string;
  avatar_url?: string;
};

type GitHubRepoOwner = {
  login?: string;
};

type GitHubRepoResponse = {
  id?: number;
  name?: string;
  full_name?: string;
  updated_at?: string;
  private?: boolean;
  owner?: GitHubRepoOwner;
};

type GitHubErrorResponse = {
  message?: string;
};

type ConnectedRepoTarget = {
  owner: string;
  repo: string;
};

type GitHubPushWebhookPayload = {
  ref?: string;
  after?: string;
  deleted?: boolean;
  repository?: {
    name?: string;
    full_name?: string;
  };
  head_commit?: {
    id?: string;
    message?: string;
  };
  pusher?: {
    name?: string;
  };
  sender?: {
    login?: string;
  };
};

type AutoDeployProjectConfig = {
  projectName: string;
  projectSlug: string;
  repository: string;
  repositoryCanonical: string;
  branch: string;
  repoPath: string;
  deployCommand: string;
  environment: string;
  remoteHost?: string;
  domains?: string[];
};

type AutoDeployContext = {
  repositoryName: string;
  repositoryFullName: string;
  branch: string;
  commitHash: string;
  commitMessage: string;
  pusher: string;
};

const app = Fastify({ logger: true });
const execFileAsync = promisify(execFile);
const fallbackProjectSlug = "kani-taxi";
const fallbackProjectName = "KANI TAXI";

const filePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(filePath);
loadEnv();
loadEnv({ path: path.resolve(currentDir, "../../../.env"), override: true });
const localTrackerLogPath =
  process.env.DEPLOY_TRACKER_LOG_PATH ?? path.resolve(currentDir, "../../../.local/deployments.jsonl");
const remoteTrackerHost = process.env.DEPLOY_TRACKER_REMOTE_HOST;
const remoteTrackerLogPath =
  process.env.DEPLOY_TRACKER_REMOTE_LOG_PATH ?? "~/.runcloud-clone/deployments.jsonl";
const localServerHost = process.env.CONTROL_PLANE_SERVER_HOST ?? os.hostname();
const controlPlanePublicUrl =
  process.env.CONTROL_PLANE_PUBLIC_URL ?? `http://${hostFromEnv(process.env.CONTROL_PLANE_HOST)}:${Number(process.env.CONTROL_PLANE_PORT ?? 3000)}`;
const dashboardPublicUrl = process.env.DASHBOARD_PUBLIC_URL ?? "http://localhost:5173";
const controlPlanePublicHost = hostFromMaybeUrl(controlPlanePublicUrl);
const dashboardPublicHost = hostFromMaybeUrl(dashboardPublicUrl);
const dashboardKnownHosts = new Set(
  [normalizeHost(localServerHost), controlPlanePublicHost, dashboardPublicHost].filter((value) => value.length > 0),
);
const screenshotCacheDir =
  process.env.SCREENSHOT_CACHE_DIR ?? path.resolve(currentDir, "../../../.local/screenshots");
const defaultScreenshotTargetUrl = (process.env.KANI_TAXI_PREVIEW_URL ?? "https://kanitaxi.com").trim();
const screenshotViewport = (process.env.SCREENSHOT_VIEWPORT ?? "1500,700").trim() || "1500,700";
const screenshotWaitMs = toPositiveInteger(process.env.SCREENSHOT_WAIT_MS, 5000);
const screenshotWaitSelector = (process.env.SCREENSHOT_WAIT_SELECTOR ?? "").trim();
const screenshotTimeoutMs = toPositiveInteger(process.env.SCREENSHOT_TIMEOUT_SEC, 60) * 1000;
const githubClientId = process.env.GITHUB_CLIENT_ID ?? "";
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET ?? "";
const gitLabSigninUrl = process.env.GITLAB_SIGNIN_URL ?? "https://gitlab.com/users/sign_in";
const bitbucketSigninUrl = process.env.BITBUCKET_SIGNIN_URL ?? "https://bitbucket.org/account/signin/";
const connectedGitRepos = (process.env.CONNECTED_GITHUB_REPOS ?? "")
  .split(",")
  .map((repo) => repo.trim())
  .filter((repo) => repo.length > 0);
const connectedRepoPathCandidates = [
  process.env.KANI_TAXI_REPO_PATH,
  process.env.CALL_TAXI_REPO_PATH,
  path.resolve(currentDir, "../../../projects/cab-services/kani-taxi"),
  path.resolve(currentDir, "../../../CALL TAXI/KANI TAXI"),
]
  .map((candidate) => (candidate ?? "").trim())
  .filter((candidate) => candidate.length > 0);
const autoDeployEnabled = (process.env.AUTO_DEPLOY_ENABLED ?? "").trim().toLowerCase() === "true";
const autoDeployWebhookToken = (process.env.AUTO_DEPLOY_WEBHOOK_TOKEN ?? "").trim();
const githubWebhookSecret = (process.env.GITHUB_WEBHOOK_SECRET ?? "").trim();
const autoDeployTimeoutMs = toPositiveInteger(process.env.AUTO_DEPLOY_TIMEOUT_SEC, 900) * 1000;
const autoDeployDefaultRemoteHost = (process.env.AUTO_DEPLOY_REMOTE_HOST ?? remoteTrackerHost ?? "").trim();
const localRequestLogPath =
  process.env.REQUEST_LOG_LOCAL_PATH ?? path.resolve(currentDir, "../../../.local/access.log");
const requestLogRemoteHost =
  (process.env.REQUEST_LOG_REMOTE_HOST ?? autoDeployDefaultRemoteHost).trim() || undefined;
const requestLogRemotePath = (process.env.REQUEST_LOG_REMOTE_PATH ?? "/var/log/nginx/access.log").trim() || "/var/log/nginx/access.log";
const requestLogTailLines = toPositiveInteger(process.env.REQUEST_LOG_TAIL_LINES, 600);
const requestLogTailMultiplier = toPositiveInteger(process.env.REQUEST_LOG_TAIL_MULTIPLIER, 25);
const autoDeployProjects = parseAutoDeployProjects(
  process.env.AUTO_DEPLOY_PROJECTS,
  autoDeployDefaultRemoteHost,
);
const autoDeployProjectsBySlug = new Map<string, AutoDeployProjectConfig>(
  autoDeployProjects.map((project) => [project.projectSlug, project]),
);
const defaultProjectSlug = autoDeployProjects[0]?.projectSlug ?? fallbackProjectSlug;
const defaultProjectName = autoDeployProjects[0]?.projectName ?? fallbackProjectName;
const autoDeployQueues = new Map<string, Promise<void>>();
const screenshotQueues = new Map<string, Promise<void>>();

await app.register(cors, { origin: true });

const oauthStates = new Map<string, OAuthState>();
const oauthConnections = new Map<string, OAuthConnection>();
const oauthAccessTokens = new Map<string, OAuthAccessToken>();

const mapAuthor = (author: string): string => {
  if (author.toLowerCase().includes("hello-cms-ai")) {
    return "vserver";
  }
  return author;
};

function normalizeProject(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveProjectSlug(input: string | undefined): string {
  if (!input) {
    return defaultProjectSlug;
  }
  const normalized = normalizeProject(input);
  if (!normalized) {
    return defaultProjectSlug;
  }
  return normalized;
}

function resolveProjectName(projectSlug: string): string {
  return autoDeployProjectsBySlug.get(projectSlug)?.projectName ?? defaultProjectName;
}

function resolveProjectPreviewUrl(projectSlug: string): string {
  const envKey = `${projectSlug.replace(/-/g, "_").toUpperCase()}_PREVIEW_URL`;
  const perProjectUrl = (process.env[envKey] ?? "").trim();
  if (perProjectUrl) {
    return perProjectUrl;
  }
  if (projectSlug === defaultProjectSlug) {
    return defaultScreenshotTargetUrl;
  }
  return "";
}

function deriveProjectCategory(repoPath: string): string {
  const normalizedPath = repoPath.trim().replace(/\\/g, "/");
  const marker = "/var/www/projects/";
  if (!normalizedPath.startsWith(marker)) {
    return "uncategorized";
  }
  const relative = normalizedPath.slice(marker.length);
  const [category] = relative.split("/");
  return category?.trim() || "uncategorized";
}

function hostFromEnv(hostInput: string | undefined): string {
  const value = (hostInput ?? "").trim();
  if (value === "" || value === "0.0.0.0" || value === "::") {
    return "localhost";
  }
  return value;
}

function hostFromMaybeUrl(rawValue: string): string {
  const value = rawValue.trim();
  if (!value) return "";
  try {
    return normalizeHost(new URL(value).hostname);
  } catch {
    return normalizeHost(value);
  }
}

function parseReturnTo(rawReturnTo: string | undefined): string {
  if (!rawReturnTo) {
    return dashboardPublicUrl;
  }

  try {
    const parsed = new URL(rawReturnTo);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return dashboardPublicUrl;
    }
    return parsed.toString();
  } catch {
    return dashboardPublicUrl;
  }
}

function oauthStateKey(provider: OAuthProvider, accountId: string): string {
  return `${provider}:${accountId}`;
}

function appendQuery(url: string, key: string, value: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set(key, value);
  return parsed.toString();
}

function clearExpiredOAuthStates(): void {
  const ttlMs = 10 * 60 * 1000;
  const now = Date.now();
  for (const [state, payload] of oauthStates.entries()) {
    if (now - payload.createdAt > ttlMs) {
      oauthStates.delete(state);
    }
  }
}

function buildOAuthReturnUrl(
  baseUrl: string,
  provider: OAuthProvider,
  status: "success" | "error",
  extra?: { account?: string; message?: string },
): string {
  let next = appendQuery(baseUrl, "oauth", `${provider}-${status}`);
  if (extra?.account) {
    next = appendQuery(next, "account", extra.account);
  }
  if (extra?.message) {
    next = appendQuery(next, "message", extra.message);
  }
  return next;
}

function toSafeLimit(rawLimit: string | undefined, fallback: number): number {
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(Math.trunc(parsed), 1), 100);
}

function canonicalRepoName(input: string): string {
  const trimmed = input.trim().replace(/\.git$/i, "");
  const lastSegment = trimmed.split("/").filter((segment) => segment.length > 0).at(-1) ?? trimmed;
  return lastSegment.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseGitHubRepoFromRemote(remoteUrl: string): ConnectedRepoTarget | null {
  const trimmed = remoteUrl.trim().replace(/\.git$/i, "");
  const sshLike = trimmed.match(/github\.com:([^/\s]+)\/([^/\s]+)$/i);
  if (sshLike) {
    return { owner: sshLike[1], repo: sshLike[2] };
  }

  const httpsLike = trimmed.match(/github\.com\/([^/\s]+)\/([^/\s]+)$/i);
  if (httpsLike) {
    return { owner: httpsLike[1], repo: httpsLike[2] };
  }

  return null;
}

function toPositiveInteger(rawValue: string | undefined, fallback: number): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.trunc(parsed);
}

function asNonEmptyString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function asDomainList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((entry) => (typeof entry === "string" ? entry.split(",") : []))
    .map((entry) => normalizeHost(entry))
    .filter((entry) => entry.length > 0);
}

function parseAutoDeployProjects(
  rawProjects: string | undefined,
  defaultRemoteHost: string,
): AutoDeployProjectConfig[] {
  const raw = (rawProjects ?? "").trim();
  if (!raw) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    app.log.error({ error }, "AUTO_DEPLOY_PROJECTS is not valid JSON");
    return [];
  }

  if (!Array.isArray(parsed)) {
    app.log.error("AUTO_DEPLOY_PROJECTS must be a JSON array");
    return [];
  }

  const projects: AutoDeployProjectConfig[] = [];
  for (const [index, entry] of parsed.entries()) {
    if (!entry || typeof entry !== "object") {
      app.log.warn({ index }, "Skipping auto deploy entry: value is not an object");
      continue;
    }

    const record = entry as Record<string, unknown>;
    const projectNameValue = asNonEmptyString(record.projectName);
    const repositoryValue = asNonEmptyString(record.repository);
    const branchValue = asNonEmptyString(record.branch) || "main";
    const repoPathValue = asNonEmptyString(record.repoPath);
    const deployCommandValue = asNonEmptyString(record.deployCommand);
    const environmentValue = asNonEmptyString(record.environment) || "Production";
    const remoteHostValue = asNonEmptyString(record.remoteHost) || defaultRemoteHost;
    const domainValues = [
      ...asDomainList(record.domains),
      ...asDomainList(record.domain),
      ...asDomainList(record.liveDomains),
      ...asDomainList(record.liveDomain),
      ...asDomainList(record.primaryDomain),
    ];

    if (!projectNameValue || !repositoryValue || !repoPathValue || !deployCommandValue) {
      app.log.warn(
        {
          index,
          projectName: projectNameValue,
          repository: repositoryValue,
          repoPath: repoPathValue,
        },
        "Skipping auto deploy entry: missing projectName/repository/repoPath/deployCommand",
      );
      continue;
    }

    const repositoryCanonical = canonicalRepoName(repositoryValue);
    if (!repositoryCanonical) {
      app.log.warn({ index, repository: repositoryValue }, "Skipping auto deploy entry: invalid repository");
      continue;
    }

    projects.push({
      projectName: projectNameValue,
      projectSlug: normalizeProject(projectNameValue),
      repository: repositoryValue,
      repositoryCanonical,
      branch: branchValue,
      repoPath: repoPathValue,
      deployCommand: deployCommandValue,
      environment: environmentValue,
      remoteHost: remoteHostValue || undefined,
      domains: [...new Set(domainValues)],
    });
  }

  return projects;
}

function extractHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return (value[0] ?? "").trim();
  }
  return (value ?? "").trim();
}

function branchFromRef(ref: string | undefined): string {
  const rawRef = (ref ?? "").trim();
  const prefix = "refs/heads/";
  if (!rawRef.startsWith(prefix)) {
    return "";
  }
  return rawRef.slice(prefix.length);
}

function findAutoDeployProject(
  repositoryName: string,
  repositoryFullName: string,
  branch: string,
): AutoDeployProjectConfig | null {
  const incomingFullName = repositoryFullName.trim().toLowerCase();
  const incomingRepoCanonical = canonicalRepoName(repositoryName || repositoryFullName);

  for (const project of autoDeployProjects) {
    const configuredRepo = project.repository.toLowerCase();
    const repoMatches = configuredRepo.includes("/")
      ? configuredRepo === incomingFullName
      : project.repositoryCanonical === incomingRepoCanonical;
    if (!repoMatches) {
      continue;
    }

    if (project.branch !== "*" && project.branch !== branch) {
      continue;
    }

    return project;
  }

  return null;
}

function verifyGitHubSignature(
  signatureHeader: string,
  payload: GitHubPushWebhookPayload,
  secret: string,
): boolean {
  const trimmedSignature = signatureHeader.trim();
  if (!trimmedSignature.startsWith("sha256=")) {
    return false;
  }

  const signatureHex = trimmedSignature.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(signatureHex)) {
    return false;
  }

  const expectedSignature = createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");
  const received = Buffer.from(signatureHex, "hex");
  const expected = Buffer.from(expectedSignature, "hex");
  if (received.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(received, expected);
}

function buildAutoDeployScript(project: AutoDeployProjectConfig, branch: string): string {
  const escapedRepoPath = shellQuote(project.repoPath);
  const escapedBranch = shellQuote(branch);
  const escapedOriginRef = shellQuote(`origin/${branch}`);
  const escapedDeployCommand = shellQuote(project.deployCommand);

  return [
    "set -euo pipefail",
    `cd ${escapedRepoPath}`,
    `git fetch origin ${escapedBranch}`,
    `git checkout ${escapedBranch} || git checkout -b ${escapedBranch} ${escapedOriginRef}`,
    `git reset --hard ${escapedOriginRef}`,
    "if [[ -x ./deploy-with-track.sh ]]; then",
    `  ./deploy-with-track.sh bash -lc ${escapedDeployCommand}`,
    "else",
    `  bash -lc ${escapedDeployCommand}`,
    "fi",
  ].join("\n");
}

async function runAutoDeploy(project: AutoDeployProjectConfig, context: AutoDeployContext, jobId: string): Promise<void> {
  const script = buildAutoDeployScript(project, context.branch);
  const startedAt = Date.now();
  const maxBuffer = 20 * 1024 * 1024;
  const targetHost = project.remoteHost?.trim();

  if (targetHost) {
    await execFileAsync(
      "ssh",
      [
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=10",
        targetHost,
        `bash -lc ${shellQuote(script)}`,
      ],
      { maxBuffer, timeout: autoDeployTimeoutMs },
    );
  } else {
    await execFileAsync("bash", ["-lc", script], {
      maxBuffer,
      timeout: autoDeployTimeoutMs,
    });
  }

  app.log.info(
    {
      jobId,
      projectName: project.projectName,
      repository: context.repositoryFullName,
      branch: context.branch,
      durationMs: Date.now() - startedAt,
    },
    "auto deploy completed",
  );
}

function queueAutoDeploy(project: AutoDeployProjectConfig, context: AutoDeployContext): string {
  const queueKey = `${project.projectSlug}:${project.branch}`;
  const jobId = randomUUID();
  const previous = autoDeployQueues.get(queueKey) ?? Promise.resolve();

  const next = previous
    .catch(() => undefined)
    .then(async () => {
      app.log.info(
        {
          jobId,
          projectName: project.projectName,
          repository: context.repositoryFullName,
          branch: context.branch,
          commitHash: context.commitHash,
          pusher: context.pusher,
        },
        "auto deploy started",
      );
      await runAutoDeploy(project, context, jobId);
    });

  autoDeployQueues.set(queueKey, next);
  void next
    .catch((error) => {
      app.log.error(
        {
          error,
          jobId,
          projectName: project.projectName,
          repository: context.repositoryFullName,
          branch: context.branch,
          commitHash: context.commitHash,
          commitMessage: context.commitMessage,
          pusher: context.pusher,
        },
        "auto deploy failed",
      );
    })
    .finally(() => {
      if (autoDeployQueues.get(queueKey) === next) {
        autoDeployQueues.delete(queueKey);
      }
    });

  return jobId;
}

async function resolveConnectedRepoFilter(): Promise<{ names: Set<string>; targets: ConnectedRepoTarget[] }> {
  const connected = new Set<string>();
  const targetsByFullName = new Map<string, ConnectedRepoTarget>();

  for (const configuredRepo of connectedGitRepos) {
    const canonical = canonicalRepoName(configuredRepo);
    if (canonical) {
      connected.add(canonical);
    }
  }

  for (const repoPath of connectedRepoPathCandidates) {
    try {
      await access(repoPath);
      const { stdout } = await execFileAsync("git", ["-C", repoPath, "config", "--get", "remote.origin.url"]);
      const parsed = parseGitHubRepoFromRemote(stdout);
      if (!parsed) {
        continue;
      }
      const canonical = canonicalRepoName(parsed.repo);
      if (canonical) {
        connected.add(canonical);
      }
      const key = `${parsed.owner}/${parsed.repo}`.toLowerCase();
      targetsByFullName.set(key, parsed);
    } catch {
      // ignore non-git or missing paths
    }
  }

  if (connected.size === 0) {
    const fallback = canonicalRepoName(defaultProjectSlug);
    if (fallback) {
      connected.add(fallback);
    }
  }

  return {
    names: connected,
    targets: [...targetsByFullName.values()],
  };
}

function isConnectedGitRepo(repoName: string, fullName: string, connectedFilter: Set<string>): boolean {
  if (connectedFilter.size === 0) {
    return true;
  }

  const repoCanonical = canonicalRepoName(repoName);
  const fullCanonical = canonicalRepoName(fullName);
  return connectedFilter.has(repoCanonical) || connectedFilter.has(fullCanonical);
}

function findOAuthConnection(provider: OAuthProvider, accountId?: string): OAuthConnection | undefined {
  const key = accountId ? oauthStateKey(provider, accountId) : undefined;
  if (key) {
    return oauthConnections.get(key);
  }
  return [...oauthConnections.values()].find((connection) => connection.provider === provider);
}

function toRelativeTime(isoTime: string): string {
  const target = new Date(isoTime).getTime();
  if (Number.isNaN(target)) return "just now";

  const diffSec = Math.floor((Date.now() - target) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function normalizeHost(rawHost: string): string {
  return rawHost
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
}

function resolveProjectPreviewHost(projectSlug: string): string {
  const previewUrl = resolveProjectPreviewUrl(projectSlug);
  if (!previewUrl) return "";

  try {
    return normalizeHost(new URL(previewUrl).hostname);
  } catch {
    return normalizeHost(previewUrl);
  }
}

function resolveProjectConfiguredHosts(projectSlug: string): string[] {
  const project = autoDeployProjectsBySlug.get(projectSlug);
  const envPrefix = projectSlug.replace(/-/g, "_").toUpperCase();
  const envDomains = [
    ...asDomainList(process.env[`${envPrefix}_DOMAINS`]),
    ...asDomainList(process.env[`${envPrefix}_DOMAIN`]),
    ...asDomainList(process.env[`${envPrefix}_LIVE_DOMAINS`]),
    ...asDomainList(process.env[`${envPrefix}_LIVE_DOMAIN`]),
  ];
  const hosts = [
    ...(project?.domains ?? []),
    ...envDomains,
  ].map((entry) => normalizeHost(entry));
  return [...new Set(hosts.filter((entry) => entry.length > 0))];
}

function projectSlugCanonicalValue(projectSlug: string): string {
  return projectSlug.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function extractHostFromQuotedFields(quotedFields: string[]): string {
  for (const field of quotedFields) {
    const value = (field ?? "").trim();
    if (!value || value === "-") continue;
    if (value.includes(" ")) continue;
    const normalized = normalizeHost(value);
    const looksLikeHost =
      normalized === "localhost" ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(normalized) ||
      normalized.includes(".");
    if (normalized && looksLikeHost) {
      return normalized;
    }
  }
  return "";
}

function isControlPlaneRequestPath(pathValue: string): boolean {
  const normalizedPath = pathValue.trim().toLowerCase().split("?")[0] ?? "";
  if (!normalizedPath) return false;
  const match = normalizedPath.match(/^\/(?:api\/)?v1\/([^/]+)/);
  if (!match) {
    return normalizedPath === "/v1" || normalizedPath === "/api/v1";
  }
  const root = match[1] ?? "";
  return root === "projects" || root === "logs" || root === "webhooks" || root === "deployments" || root === "oauth";
}

function isDashboardUsageRequest(host: string, pathValue: string): boolean {
  const normalizedHost = normalizeHost(host);
  if (isControlPlaneRequestPath(pathValue)) {
    return true;
  }
  if (normalizedHost && dashboardKnownHosts.has(normalizedHost)) {
    return true;
  }
  return false;
}

function parseNginxTimestamp(rawValue: string): string | undefined {
  const normalized = rawValue.trim().replace(/^(\d{1,2}\/[A-Za-z]{3}\/\d{4}):/, "$1 ");
  const parsed = Date.parse(normalized);
  if (Number.isNaN(parsed)) {
    return undefined;
  }
  return new Date(parsed).toISOString();
}

function toIsoTimestamp(rawValue: unknown): string | undefined {
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    const asMs = rawValue > 1_000_000_000_000 ? rawValue : rawValue * 1000;
    const timestamp = new Date(asMs);
    if (Number.isNaN(timestamp.getTime())) {
      return undefined;
    }
    return timestamp.toISOString();
  }

  if (typeof rawValue !== "string") {
    return undefined;
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsedNginx = parseNginxTimestamp(trimmed);
  if (parsedNginx) {
    return parsedNginx;
  }

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    return undefined;
  }
  return new Date(parsed).toISOString();
}

function coerceStatusCode(rawValue: unknown): number | null {
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    const rounded = Math.trunc(rawValue);
    return rounded >= 100 && rounded <= 599 ? rounded : null;
  }
  if (typeof rawValue === "string") {
    const parsed = Number(rawValue.trim());
    if (!Number.isFinite(parsed)) {
      return null;
    }
    const rounded = Math.trunc(parsed);
    return rounded >= 100 && rounded <= 599 ? rounded : null;
  }
  return null;
}

function parseRequestLine(rawValue: string): { method: string; path: string } {
  const match = rawValue.trim().match(/^([A-Z]+)\s+(\S+)/i);
  if (!match) {
    return { method: "GET", path: "/" };
  }
  return {
    method: (match[1] ?? "GET").toUpperCase(),
    path: match[2] ?? "/",
  };
}

function parseJsonRequestLogLine(line: string): ParsedRequestLogLine | null {
  if (!line.startsWith("{") || !line.endsWith("}")) {
    return null;
  }

  try {
    const value = JSON.parse(line) as Record<string, unknown>;
    const rawRequest =
      typeof value.request === "string"
        ? value.request
        : typeof value.httpRequest === "string"
          ? value.httpRequest
          : "";
    const requestLine = parseRequestLine(rawRequest);
    const method =
      typeof value.method === "string"
        ? value.method.trim().toUpperCase() || requestLine.method
        : requestLine.method;
    const pathValue =
      typeof value.path === "string"
        ? value.path.trim() || requestLine.path
        : typeof value.url === "string"
          ? value.url.trim() || requestLine.path
          : typeof value.requestPath === "string"
            ? value.requestPath.trim() || requestLine.path
            : requestLine.path;
    const statusCode = coerceStatusCode(value.statusCode ?? value.status);
    const host =
      typeof value.host === "string"
        ? value.host
        : typeof value.hostname === "string"
          ? value.hostname
          : typeof value.domain === "string"
            ? value.domain
            : "";
    const remoteAddr =
      typeof value.remoteAddr === "string"
        ? value.remoteAddr
        : typeof value.ip === "string"
          ? value.ip
          : typeof value.clientIp === "string"
            ? value.clientIp
            : undefined;
    const projectHint =
      typeof value.projectSlug === "string"
        ? value.projectSlug
        : typeof value.project === "string"
          ? value.project
          : typeof value.projectName === "string"
            ? value.projectName
            : undefined;
    const timestamp = toIsoTimestamp(
      value.timestamp ?? value.time ?? value.loggedAt ?? value.createdAt ?? value.date
    );
    const message =
      typeof value.message === "string"
        ? value.message
        : typeof value.msg === "string"
          ? value.msg
          : `${method} ${pathValue}`;

    return {
      timestamp,
      method: method || "GET",
      statusCode,
      host,
      path: pathValue || "/",
      message: message.trim() || `${method} ${pathValue || "/"}`,
      remoteAddr,
      projectHint,
    };
  } catch {
    return null;
  }
}

function parseNginxRequestLogLine(line: string): ParsedRequestLogLine | null {
  const match = line.match(
    /^(?<remote>\S+)\s+\S+\s+\S+\s+\[(?<time>[^\]]+)\]\s+"(?<request>[^"]*)"\s+(?<status>\d{3}|-)\s+\S+(?<rest>.*)$/
  );
  if (!match?.groups) {
    return null;
  }

  const requestLine = parseRequestLine(match.groups.request ?? "");
  const statusCode = coerceStatusCode(match.groups.status);
  const rest = match.groups.rest ?? "";
  const quotedFields = [...rest.matchAll(/"([^"]*)"/g)].map((item) => item[1] ?? "");
  const hostCandidate = extractHostFromQuotedFields(quotedFields);

  return {
    timestamp: parseNginxTimestamp(match.groups.time ?? ""),
    method: requestLine.method,
    statusCode,
    host: hostCandidate,
    path: requestLine.path,
    message: `${requestLine.method} ${requestLine.path}`,
    remoteAddr: (match.groups.remote ?? "").trim() || undefined,
  };
}

function parseRequestLogLine(line: string): ParsedRequestLogLine | null {
  return parseJsonRequestLogLine(line) ?? parseNginxRequestLogLine(line);
}

function resolveProjectSlugFromRequestLog(entry: ParsedRequestLogLine): string {
  const hint = normalizeProject(entry.projectHint ?? "");
  if (hint) {
    if (autoDeployProjectsBySlug.has(hint)) {
      return hint;
    }
    if (autoDeployProjects.length === 0 && hint === fallbackProjectSlug) {
      return hint;
    }
  }

  const normalizedHost = normalizeHost(entry.host);
  if (normalizedHost) {
    const hostLabels = normalizedHost
      .split(".")
      .map((label) => label.toLowerCase().replace(/[^a-z0-9]/g, ""))
      .filter((label) => label.length > 0);
    for (const project of autoDeployProjects) {
      const previewHost = resolveProjectPreviewHost(project.projectSlug);
      if (previewHost && previewHost === normalizedHost) {
        return project.projectSlug;
      }
      const configuredHosts = resolveProjectConfiguredHosts(project.projectSlug);
      if (configuredHosts.includes(normalizedHost)) {
        return project.projectSlug;
      }
      const slugCanonical = projectSlugCanonicalValue(project.projectSlug);
      if (slugCanonical && hostLabels.some((label) => label === slugCanonical)) {
        return project.projectSlug;
      }
    }
    if (autoDeployProjects.length === 0) {
      const fallbackHost = resolveProjectPreviewHost(fallbackProjectSlug);
      if (fallbackHost && fallbackHost === normalizedHost) {
        return fallbackProjectSlug;
      }
    }
  }

  const haystack = `${entry.path} ${entry.message} ${normalizedHost}`.toLowerCase();
  const canonicalHaystack = haystack.replace(/[^a-z0-9]/g, "");
  for (const project of autoDeployProjects) {
    const slugCanonical = projectSlugCanonicalValue(project.projectSlug);
    if (
      haystack.includes(project.projectSlug) ||
      (slugCanonical && canonicalHaystack.includes(slugCanonical))
    ) {
      return project.projectSlug;
    }
  }

  if (autoDeployProjects.length === 1) {
    return autoDeployProjects[0]?.projectSlug ?? "";
  }
  if (autoDeployProjects.length === 0) {
    return fallbackProjectSlug;
  }
  return "";
}

function requestLogTimestamp(entry: RequestLogEntry): number {
  const parsed = Date.parse(entry.timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseRequestLogEntries(
  raw: string,
  requestedProjectSlug: string | undefined,
  limit: number,
  startMs?: number,
  endMs?: number,
): RequestLogEntry[] {
  const normalizedRequestedProject = requestedProjectSlug
    ? resolveProjectSlug(requestedProjectSlug)
    : undefined;
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const parsedEntries: RequestLogEntry[] = [];

  for (const [index, line] of lines.entries()) {
    const parsedLine = parseRequestLogLine(line);
    if (!parsedLine) {
      continue;
    }
    const normalizedParsedHost = normalizeHost(parsedLine.host);
    const normalizedParsedPath = parsedLine.path.trim() || "/";
    if (isDashboardUsageRequest(normalizedParsedHost, normalizedParsedPath)) {
      continue;
    }

    const inferredProjectSlug = resolveProjectSlugFromRequestLog(parsedLine);
    if (!inferredProjectSlug) {
      continue;
    }
    if (normalizedRequestedProject && inferredProjectSlug !== normalizedRequestedProject) {
      continue;
    }
    const resolvedProjectSlug = inferredProjectSlug;

    const timestamp = parsedLine.timestamp ?? new Date().toISOString();
    const method = parsedLine.method.trim().toUpperCase() || "GET";
    const pathValue = normalizedParsedPath;
    const host =
      normalizedParsedHost ||
      resolveProjectPreviewHost(resolvedProjectSlug) ||
      localServerHost;
    const message = parsedLine.message.trim() || `${method} ${pathValue}`;
    const statusCode = parsedLine.statusCode;
    const epoch = Date.parse(timestamp);
    const stableEpoch = Number.isNaN(epoch) ? 0 : epoch;
    if (typeof startMs === "number" && stableEpoch < startMs) {
      continue;
    }
    if (typeof endMs === "number" && stableEpoch > endMs) {
      continue;
    }

    parsedEntries.push({
      logId: `${resolvedProjectSlug}-${stableEpoch}-${index}`,
      timestamp,
      method,
      statusCode,
      host,
      path: pathValue,
      message,
      projectSlug: resolvedProjectSlug,
      projectName: resolveProjectName(resolvedProjectSlug),
      remoteAddr: parsedLine.remoteAddr,
      source: "server-access-log",
    });
  }

  return parsedEntries
    .sort((left, right) => requestLogTimestamp(right) - requestLogTimestamp(left))
    .slice(0, limit);
}

function parseTrackerEntries(raw: string, expectedProjectSlug: string, expectedProjectName: string): Deployment[] {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const parsed: Deployment[] = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as TrackerEntry;
      const entryProject = normalizeProject(entry.projectName ?? "");
      if (!entryProject || entryProject !== expectedProjectSlug) {
        continue;
      }

      const trackedAt = entry.trackedAt ?? new Date().toISOString();
      parsed.push({
        deploymentId: (entry.deploymentId ?? "unknown").toUpperCase(),
        environment: entry.environment ?? "Production",
        status: entry.status ?? "Ready",
        duration: entry.duration ?? "n/a",
        projectName: expectedProjectName,
        branch: entry.branch ?? "main",
        commitHash: entry.commitHash ?? "unknown",
        commitMessage: entry.commitMessage ?? "",
        trackedAt,
        commitAt: entry.commitAt,
        createdRelative: toRelativeTime(trackedAt),
        author: mapAuthor(entry.author ?? "unknown"),
        serverHost: entry.serverHost ?? localServerHost,
        source: "server-tracker",
      });
    } catch {
      // skip malformed lines
    }
  }

  return parsed.reverse();
}

async function readLocalTracker(expectedProjectSlug: string, limit: number): Promise<Deployment[]> {
  await access(localTrackerLogPath);
  const content = await readFile(localTrackerLogPath, "utf8");
  const expectedProjectName = resolveProjectName(expectedProjectSlug);
  return parseTrackerEntries(content, expectedProjectSlug, expectedProjectName).slice(0, limit);
}

function shellQuote(input: string): string {
  return `'${input.replace(/'/g, `'"'"'`)}'`;
}

async function readLocalRequestLogs(
  requestedProjectSlug: string | undefined,
  limit: number,
  startMs?: number,
  endMs?: number,
): Promise<RequestLogEntry[]> {
  await access(localRequestLogPath);
  const content = await readFile(localRequestLogPath, "utf8");
  return parseRequestLogEntries(content, requestedProjectSlug, limit, startMs, endMs);
}

async function readRemoteRequestLogs(
  requestedProjectSlug: string | undefined,
  limit: number,
  startMs?: number,
  endMs?: number,
): Promise<{
  data: RequestLogEntry[];
  tailedLines: number;
}> {
  if (!requestLogRemoteHost) {
    return {
      data: [],
      tailedLines: 0,
    };
  }

  const tailedLines = Math.max(requestLogTailLines, limit * requestLogTailMultiplier);
  const remoteCmd = `tail -n ${tailedLines} ${shellQuote(requestLogRemotePath)} || true`;
  const { stdout } = await execFileAsync("ssh", [
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=5",
    requestLogRemoteHost,
    remoteCmd,
  ]);
  return {
    data: parseRequestLogEntries(stdout, requestedProjectSlug, limit, startMs, endMs),
    tailedLines,
  };
}

async function readRemoteTracker(expectedProjectSlug: string, limit: number): Promise<Deployment[]> {
  if (!remoteTrackerHost) {
    return [];
  }

  const remoteCmd = `tail -n ${Math.max(limit * 5, 100)} ${shellQuote(remoteTrackerLogPath)} || true`;
  const { stdout } = await execFileAsync("ssh", [
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=5",
    remoteTrackerHost,
    remoteCmd,
  ]);
  const expectedProjectName = resolveProjectName(expectedProjectSlug);
  return parseTrackerEntries(stdout, expectedProjectSlug, expectedProjectName).slice(0, limit);
}

async function getDeployments(limit: number, requestedProjectSlug: string | undefined): Promise<{ data: Deployment[]; meta: DeploymentsMeta }> {
  const targetProjectSlug = resolveProjectSlug(requestedProjectSlug);
  if (remoteTrackerHost) {
    let remoteTrackerData: Deployment[] = [];
    try {
      remoteTrackerData = await readRemoteTracker(targetProjectSlug, limit);
    } catch {
      throw new Error(
        `Remote tracker unreachable at ${remoteTrackerHost}. Verify SSH access and DEPLOY_TRACKER_REMOTE_LOG_PATH.`,
      );
    }
    return {
      data: remoteTrackerData,
      meta: {
        project: targetProjectSlug,
        source: "server-tracker",
        mode: "remote",
        remoteHost: remoteTrackerHost,
        logPath: remoteTrackerLogPath,
      },
    };
  }

  const localTrackerData = await readLocalTracker(targetProjectSlug, limit).catch(() => []);
  return {
    data: localTrackerData,
    meta: {
      project: targetProjectSlug,
      source: "server-tracker",
      mode: "local",
      logPath: localTrackerLogPath,
    },
  };
}

async function getRequestLogs(
  limit: number,
  requestedProjectSlug: string | undefined,
  startMs?: number,
  endMs?: number,
): Promise<{
  data: RequestLogEntry[];
  meta: RequestLogsMeta;
}> {
  const targetProjectSlug = requestedProjectSlug ? resolveProjectSlug(requestedProjectSlug) : undefined;
  const projectMeta = targetProjectSlug ?? "all";

  if (requestLogRemoteHost) {
    try {
      const remoteResult = await readRemoteRequestLogs(targetProjectSlug, limit, startMs, endMs);
      return {
        data: remoteResult.data,
        meta: {
          project: projectMeta,
          source: "server-access-log",
          mode: "remote",
          remoteHost: requestLogRemoteHost,
          logPath: requestLogRemotePath,
          tailedLines: remoteResult.tailedLines,
        },
      };
    } catch {
      throw new Error(
        `Remote request log unreachable at ${requestLogRemoteHost}. Verify SSH access and REQUEST_LOG_REMOTE_PATH.`,
      );
    }
  }

  const localData = await readLocalRequestLogs(targetProjectSlug, limit, startMs, endMs).catch(() => []);
  return {
    data: localData,
    meta: {
      project: projectMeta,
      source: "server-access-log",
      mode: "local",
      logPath: localRequestLogPath,
      tailedLines: Math.max(requestLogTailLines, limit * requestLogTailMultiplier),
    },
  };
}

function validateProjectInput(input: string | undefined): string | null {
  if (!input) return null;
  const normalized = normalizeProject(input);
  if (autoDeployProjectsBySlug.size === 0) {
    if (normalized === fallbackProjectSlug) {
      return null;
    }
    return `Only ${fallbackProjectName} (${fallbackProjectSlug}) is configured right now`;
  }
  if (autoDeployProjectsBySlug.has(normalized)) {
    return null;
  }
  const available = [...autoDeployProjectsBySlug.keys()].join(", ");
  return `Unknown project (${normalized}). Configured projects: ${available}`;
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function isValidScreenshotUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function captureScreenshot(url: string, outputPath: string): Promise<void> {
  const args = [
    "--yes",
    "playwright",
    "screenshot",
    "--browser",
    "chromium",
    "--viewport-size",
    screenshotViewport,
    "--wait-for-timeout",
    String(screenshotWaitMs),
  ];

  if (screenshotWaitSelector) {
    args.push("--wait-for-selector", screenshotWaitSelector);
  }

  args.push(url, outputPath);

  await execFileAsync("npx", args, {
    timeout: screenshotTimeoutMs,
    maxBuffer: 10 * 1024 * 1024,
  });
}

app.get("/health", async () => {
  return {
    status: "ok",
    service: "control-plane",
    timestamp: new Date().toISOString(),
  };
});

app.get("/v1", async () => {
  return {
    status: "ok",
    message: "vserver control-plane starter",
  };
});

app.get("/v1/projects", async () => {
  return {
    data: autoDeployProjects.map((project) => ({
      projectName: project.projectName,
      projectSlug: project.projectSlug,
      repository: project.repository,
      branch: project.branch,
      environment: project.environment,
      repoPath: project.repoPath,
      remoteHost: project.remoteHost,
      category: deriveProjectCategory(project.repoPath),
      previewUrl: resolveProjectPreviewUrl(project.projectSlug),
    })),
    meta: {
      defaultProjectSlug,
      count: autoDeployProjects.length,
    },
  };
});

app.get("/v1/logs", async (request, reply) => {
  const query = request.query as { project?: string; limit?: string; start?: string; end?: string };
  const safeLimit = toSafeLimit(query.limit, 120);
  const projectError = validateProjectInput(query.project);
  if (projectError) {
    return reply.code(400).send({ error: projectError });
  }
  const startMs = query.start ? Date.parse(query.start) : undefined;
  if (query.start && (startMs === undefined || Number.isNaN(startMs))) {
    return reply.code(400).send({ error: "Invalid start timestamp. Use ISO date-time." });
  }
  const endMs = query.end ? Date.parse(query.end) : undefined;
  if (query.end && (endMs === undefined || Number.isNaN(endMs))) {
    return reply.code(400).send({ error: "Invalid end timestamp. Use ISO date-time." });
  }
  if (typeof startMs === "number" && typeof endMs === "number" && endMs < startMs) {
    return reply.code(400).send({ error: "Invalid time range. End must be after start." });
  }

  try {
    const payload = await getRequestLogs(safeLimit, query.project, startMs, endMs);
    return payload;
  } catch (error) {
    request.log.error(error, "failed to load request logs");
    const message = error instanceof Error ? error.message : "Unable to load request logs from server";
    return reply.code(500).send({ error: message });
  }
});

app.post("/v1/webhooks/github", async (request, reply) => {
  const query = request.query as { token?: string };
  const event = extractHeaderValue(request.headers["x-github-event"]).toLowerCase();
  const payloadValue = request.body;
  if (!payloadValue || typeof payloadValue !== "object") {
    return reply.code(400).send({
      error: "Invalid webhook payload.",
    });
  }
  const payload = payloadValue as GitHubPushWebhookPayload;

  if (!autoDeployEnabled) {
    return reply.code(503).send({
      error: "Auto deploy is disabled. Set AUTO_DEPLOY_ENABLED=true.",
    });
  }

  if (!autoDeployWebhookToken && !githubWebhookSecret) {
    request.log.error("auto deploy webhook auth is missing");
    return reply.code(500).send({
      error: "Webhook auth missing. Set AUTO_DEPLOY_WEBHOOK_TOKEN or GITHUB_WEBHOOK_SECRET.",
    });
  }

  if (autoDeployWebhookToken) {
    if ((query.token ?? "").trim() !== autoDeployWebhookToken) {
      return reply.code(401).send({
        error: "Invalid webhook token.",
      });
    }
  } else {
    const signatureHeader = extractHeaderValue(request.headers["x-hub-signature-256"]);
    if (!verifyGitHubSignature(signatureHeader, payload, githubWebhookSecret)) {
      return reply.code(401).send({
        error: "Invalid webhook signature.",
      });
    }
  }

  if (event === "ping") {
    return {
      status: "ok",
      message: "GitHub webhook verified.",
    };
  }

  if (event !== "push") {
    return reply.code(202).send({
      status: "ignored",
      reason: `Unsupported event ${event || "unknown"}.`,
    });
  }

  if (autoDeployProjects.length === 0) {
    return reply.code(500).send({
      error: "AUTO_DEPLOY_PROJECTS is empty or invalid.",
    });
  }

  const branch = branchFromRef(payload.ref);
  if (!branch) {
    return reply.code(202).send({
      status: "ignored",
      reason: "Push event is not targeting a branch.",
    });
  }

  if (payload.deleted) {
    return reply.code(202).send({
      status: "ignored",
      reason: `Branch ${branch} was deleted.`,
    });
  }

  const repositoryName = (payload.repository?.name ?? "").trim();
  const repositoryFullName = (payload.repository?.full_name ?? repositoryName).trim();
  if (!repositoryFullName) {
    return reply.code(400).send({
      error: "Repository information is missing in webhook payload.",
    });
  }

  const project = findAutoDeployProject(repositoryName, repositoryFullName, branch);
  if (!project) {
    return reply.code(202).send({
      status: "ignored",
      reason: `No matching auto deploy project for ${repositoryFullName}:${branch}.`,
    });
  }

  const commitHash = (payload.after ?? payload.head_commit?.id ?? "").slice(0, 12) || "unknown";
  const context: AutoDeployContext = {
    repositoryName,
    repositoryFullName,
    branch,
    commitHash,
    commitMessage: (payload.head_commit?.message ?? "").trim(),
    pusher: (payload.pusher?.name ?? payload.sender?.login ?? "unknown").trim() || "unknown",
  };

  const jobId = queueAutoDeploy(project, context);
  return reply.code(202).send({
    status: "queued",
    jobId,
    projectName: project.projectName,
    branch,
    repository: repositoryFullName,
  });
});

app.get("/v1/deployments", async (request, reply) => {
  const query = request.query as { project?: string; limit?: string };
  const safeLimit = toSafeLimit(query.limit, 20);
  const projectError = validateProjectInput(query.project);
  if (projectError) {
    return reply.code(400).send({ error: projectError });
  }

  try {
    const payload = await getDeployments(safeLimit, query.project);
    return payload;
  } catch (error) {
    request.log.error(error, "failed to load deployment history");
    const message =
      error instanceof Error ? error.message : "Unable to load deployments from server tracker";
    return reply.code(500).send({
      error: message,
    });
  }
});

app.get("/v1/deployments/latest", async (request, reply) => {
  const query = request.query as { project?: string };
  const projectError = validateProjectInput(query.project);
  if (projectError) {
    return reply.code(400).send({ error: projectError });
  }

  try {
    const payload = await getDeployments(1, query.project);
    return {
      data: payload.data[0] ?? null,
      meta: payload.meta,
    };
  } catch (error) {
    request.log.error(error, "failed to load latest deployment");
    const message =
      error instanceof Error ? error.message : "Unable to load latest deployment from server tracker";
    return reply.code(500).send({
      error: message,
    });
  }
});

app.get("/v1/deployments/latest/screenshot", async (request, reply) => {
  const query = request.query as { project?: string; refresh?: string };
  const projectError = validateProjectInput(query.project);
  if (projectError) {
    return reply.code(400).send({ error: projectError });
  }

  const targetProjectSlug = resolveProjectSlug(query.project);
  const screenshotTargetUrl = resolveProjectPreviewUrl(targetProjectSlug);
  const projectPreviewEnvKey = `${targetProjectSlug.replace(/-/g, "_").toUpperCase()}_PREVIEW_URL`;

  if (!screenshotTargetUrl) {
    return reply.code(500).send({
      error: `Screenshot URL missing. Set ${projectPreviewEnvKey} in .env.`,
    });
  }

  if (!isValidScreenshotUrl(screenshotTargetUrl)) {
    return reply.code(500).send({
      error: `Invalid ${projectPreviewEnvKey} (${screenshotTargetUrl}). Must be http(s).`,
    });
  }

  let latest: Deployment | null = null;
  try {
    const payload = await getDeployments(1, targetProjectSlug);
    latest = payload.data[0] ?? null;
  } catch (error) {
    request.log.error(error, "failed to resolve latest deployment for screenshot");
    return reply.code(500).send({ error: "Unable to load latest deployment." });
  }

  if (!latest) {
    return reply.code(404).send({ error: "No deployments recorded yet." });
  }

  const deploymentId = latest.deploymentId || "unknown";
  const cacheKey = `${targetProjectSlug}:${deploymentId}`;
  const projectCacheDir = path.resolve(screenshotCacheDir, targetProjectSlug);
  const screenshotPath = path.join(projectCacheDir, `${deploymentId}.png`);
  await mkdir(projectCacheDir, { recursive: true });

  const alreadyCaptured = await fileExists(screenshotPath);
  if (alreadyCaptured && query.refresh !== "1") {
    const buffer = await readFile(screenshotPath);
    reply.header("Cache-Control", "no-store");
    return reply.type("image/png").send(buffer);
  }

  if (latest.status !== "Ready") {
    if (alreadyCaptured) {
      const buffer = await readFile(screenshotPath);
      reply.header("Cache-Control", "no-store");
      return reply.type("image/png").send(buffer);
    }
    return reply.code(425).send({
      error: `Latest deployment is ${latest.status}. Screenshot is available only when status is Ready.`,
      status: latest.status,
      deploymentId,
    });
  }

  const existingJob = screenshotQueues.get(cacheKey);
  if (existingJob) {
    await existingJob;
  } else {
    const job = captureScreenshot(screenshotTargetUrl, screenshotPath)
      .catch((error: unknown) => {
        request.log.error({ error, screenshotPath }, "screenshot capture failed");
        throw error;
      })
      .finally(() => {
        screenshotQueues.delete(cacheKey);
      });
    screenshotQueues.set(cacheKey, job);
    await job;
  }

  if (!(await fileExists(screenshotPath))) {
    return reply.code(500).send({
      error: "Screenshot capture failed. Ensure Playwright browsers are installed: npx playwright install chromium",
    });
  }

  const buffer = await readFile(screenshotPath);
  reply.header("Cache-Control", "no-store");
  return reply.type("image/png").send(buffer);
});

app.get("/v1/oauth/connections", async () => {
  return {
    data: [...oauthConnections.values()],
  };
});

app.get("/v1/oauth/github/repos", async (request, reply) => {
  const query = request.query as {
    accountId?: string;
    q?: string;
    limit?: string;
  };

  const connection = findOAuthConnection("github", query.accountId);
  if (!connection) {
    return reply.code(404).send({
      error: "No connected GitHub account found. Connect GitHub first.",
    });
  }

  const tokenKey = oauthStateKey("github", connection.accountId);
  const token = oauthAccessTokens.get(tokenKey)?.token;
  if (!token) {
    return reply.code(400).send({
      error: "GitHub token missing for this account. Reconnect GitHub and try again.",
    });
  }

  const safeLimit = toSafeLimit(query.limit, 20);
  const search = (query.q ?? "").trim().toLowerCase();
  const perPage = 100;
  const maxPages = 10;
  const connectedRepoFilter = await resolveConnectedRepoFilter();

  try {
    const collected = new Map<string, {
      id: string;
      name: string;
      fullName: string;
      owner: string;
      updatedAt: string;
      visibility: "public" | "private";
    }>();

    for (let page = 1; page <= maxPages; page += 1) {
      const listUrl = new URL("https://api.github.com/user/repos");
      listUrl.searchParams.set("per_page", String(perPage));
      listUrl.searchParams.set("page", String(page));
      listUrl.searchParams.set("sort", "updated");
      listUrl.searchParams.set("direction", "desc");

      const response = await fetch(listUrl.toString(), {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "vserver-control-plane",
        },
      });

      if (!response.ok) {
        const detail = (await response.json().catch(() => ({}))) as GitHubErrorResponse;
        const message = detail.message ?? `GitHub request failed with status ${response.status}`;
        request.log.error(
          { status: response.status, statusText: response.statusText, message },
          "github repo list failed",
        );
        return reply.code(502).send({
          error: `Unable to list GitHub repositories for this account. ${message}`,
        });
      }

      const payload = (await response.json()) as GitHubRepoResponse[];
      const pageRepos = Array.isArray(payload) ? payload : [];

      for (const repo of pageRepos) {
        if (!repo.id || !repo.name) {
          continue;
        }

        const name = repo.name ?? "";
        const fullName = repo.full_name ?? repo.name ?? "";
        if (!isConnectedGitRepo(name, fullName, connectedRepoFilter.names)) {
          continue;
        }
        if (
          search &&
          !name.toLowerCase().includes(search) &&
          !fullName.toLowerCase().includes(search)
        ) {
          continue;
        }

        const id = String(repo.id);
        if (!collected.has(id)) {
          collected.set(id, {
            id,
            name: repo.name ?? "unknown",
            fullName: repo.full_name ?? repo.name ?? "unknown",
            owner: repo.owner?.login ?? connection.accountName,
            updatedAt: repo.updated_at ?? new Date().toISOString(),
            visibility: repo.private ? "private" : "public",
          });
        }

        if (collected.size >= safeLimit) {
          break;
        }
      }

      if (collected.size >= safeLimit || pageRepos.length < perPage) {
        break;
      }
    }

    if (collected.size < safeLimit) {
      for (const target of connectedRepoFilter.targets) {
        const fullNameKey = `${target.owner}/${target.repo}`.toLowerCase();
        const alreadyIncluded = [...collected.values()].some(
          (repo) => repo.fullName.toLowerCase() === fullNameKey,
        );
        if (alreadyIncluded) {
          continue;
        }

        const showForSearch =
          !search ||
          target.repo.toLowerCase().includes(search) ||
          fullNameKey.includes(search) ||
          canonicalRepoName(target.repo).includes(canonicalRepoName(search));
        if (!showForSearch) {
          continue;
        }

        const byNameUrl = new URL(`https://api.github.com/repos/${target.owner}/${target.repo}`);
        const byNameResponse = await fetch(byNameUrl.toString(), {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "User-Agent": "vserver-control-plane",
          },
        });
        if (!byNameResponse.ok) {
          continue;
        }

        const repo = (await byNameResponse.json()) as GitHubRepoResponse;
        if (!repo.id || !repo.name) {
          continue;
        }

        collected.set(String(repo.id), {
          id: String(repo.id),
          name: repo.name ?? "unknown",
          fullName: repo.full_name ?? `${target.owner}/${target.repo}`,
          owner: repo.owner?.login ?? target.owner,
          updatedAt: repo.updated_at ?? new Date().toISOString(),
          visibility: repo.private ? "private" : "public",
        });

        if (collected.size >= safeLimit) {
          break;
        }
      }
    }

    const repos = [...collected.values()].slice(0, safeLimit);

    return {
      data: repos,
      meta: {
        provider: "github",
        accountId: connection.accountId,
        accountName: connection.accountName,
      },
    };
  } catch (error) {
    request.log.error(error, "failed to load github repositories");
    return reply.code(500).send({
      error: "Failed to load GitHub repositories.",
    });
  }
});

app.get("/v1/oauth/github/start", async (request, reply) => {
  const query = request.query as { returnTo?: string };
  const returnTo = parseReturnTo(query.returnTo);

  if (!githubClientId) {
    const next = buildOAuthReturnUrl(returnTo, "github", "error", {
      message: "GITHUB_CLIENT_ID missing in control-plane environment.",
    });
    return reply.redirect(next);
  }

  clearExpiredOAuthStates();
  const state = randomUUID();
  oauthStates.set(state, {
    provider: "github",
    returnTo,
    createdAt: Date.now(),
  });

  const callbackUrl = new URL("/v1/oauth/github/callback", controlPlanePublicUrl).toString();
  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", githubClientId);
  authorizeUrl.searchParams.set("redirect_uri", callbackUrl);
  authorizeUrl.searchParams.set("scope", "read:user user:email repo");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("allow_signup", "true");

  return reply.redirect(authorizeUrl.toString());
});

app.get("/v1/oauth/gitlab/start", async (_request, reply) => {
  return reply.redirect(gitLabSigninUrl);
});

app.get("/v1/oauth/bitbucket/start", async (_request, reply) => {
  return reply.redirect(bitbucketSigninUrl);
});

app.get("/v1/oauth/github/callback", async (request, reply) => {
  const query = request.query as {
    code?: string;
    state?: string;
    error?: string;
    error_description?: string;
  };

  const stateValue = query.state ?? "";
  const statePayload = oauthStates.get(stateValue);
  const returnTo = parseReturnTo(statePayload?.returnTo);

  if (stateValue) {
    oauthStates.delete(stateValue);
  }

  if (!statePayload || statePayload.provider !== "github") {
    const next = buildOAuthReturnUrl(returnTo, "github", "error", {
      message: "Invalid OAuth state. Retry sign-in.",
    });
    return reply.redirect(next);
  }

  if (query.error) {
    const next = buildOAuthReturnUrl(returnTo, "github", "error", {
      message: query.error_description ?? query.error,
    });
    return reply.redirect(next);
  }

  if (!query.code) {
    const next = buildOAuthReturnUrl(returnTo, "github", "error", {
      message: "Missing authorization code.",
    });
    return reply.redirect(next);
  }

  if (!githubClientId || !githubClientSecret) {
    const next = buildOAuthReturnUrl(returnTo, "github", "error", {
      message: "GitHub OAuth not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.",
    });
    return reply.redirect(next);
  }

  const callbackUrl = new URL("/v1/oauth/github/callback", controlPlanePublicUrl).toString();

  try {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: githubClientId,
        client_secret: githubClientSecret,
        code: query.code,
        state: stateValue,
        redirect_uri: callbackUrl,
      }),
    });

    const tokenPayload = (await tokenResponse.json()) as GitHubTokenResponse;
    if (!tokenResponse.ok || !tokenPayload.access_token) {
      throw new Error(tokenPayload.error_description ?? tokenPayload.error ?? "Token exchange failed");
    }

    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${tokenPayload.access_token}`,
        "User-Agent": "vserver-control-plane",
      },
    });

    const userPayload = (await userResponse.json()) as GitHubUserResponse;
    if (!userResponse.ok || !userPayload.login || !userPayload.id) {
      throw new Error("Unable to load GitHub profile");
    }

    const connectionKey = oauthStateKey("github", String(userPayload.id));
    oauthConnections.set(connectionKey, {
      provider: "github",
      accountId: String(userPayload.id),
      accountName: userPayload.login,
      avatarUrl: userPayload.avatar_url,
      connectedAt: new Date().toISOString(),
    });
    oauthAccessTokens.set(connectionKey, {
      provider: "github",
      accountId: String(userPayload.id),
      token: tokenPayload.access_token,
      updatedAt: new Date().toISOString(),
    });

    const next = buildOAuthReturnUrl(returnTo, "github", "success", {
      account: userPayload.login,
    });
    return reply.redirect(next);
  } catch (error) {
    request.log.error(error, "github oauth callback failed");
    const message = error instanceof Error ? error.message : "OAuth flow failed";
    const next = buildOAuthReturnUrl(returnTo, "github", "error", {
      message,
    });
    return reply.redirect(next);
  }
});

const host = process.env.CONTROL_PLANE_HOST ?? "0.0.0.0";
const port = Number(process.env.CONTROL_PLANE_PORT ?? 3000);

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
