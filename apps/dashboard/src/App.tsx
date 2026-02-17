import { useEffect, useMemo, useRef, useState } from "react";

type IconName =
  | "projects"
  | "deployments"
  | "logs"
  | "analytics"
  | "speed"
  | "observability"
  | "firewall"
  | "domains"
  | "integrations"
  | "storage"
  | "flags"
  | "agent"
  | "ai"
  | "sandboxes"
  | "usage"
  | "support"
  | "settings";

type MenuItem = {
  label: string;
  icon: IconName;
  chevron?: boolean;
  badge?: string;
};

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
  source?: string;
  serverHost?: string;
};

type DeploymentsResponse = {
  data: Deployment[];
  meta?: {
    source?: string;
    mode?: string;
    remoteHost?: string;
    logPath?: string;
  };
  error?: string;
};

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
  source?: string;
};

type RequestLogsResponse = {
  data?: RequestLogEntry[];
  meta?: {
    project?: string;
    source?: string;
    mode?: string;
    remoteHost?: string;
    logPath?: string;
    tailedLines?: number;
  };
  error?: string;
};

type LogSeverity = "warning" | "error" | "fatal";
type TimelinePresetId =
  | "last-30-minutes"
  | "last-hour"
  | "last-12-hours"
  | "last-day"
  | "last-3-days"
  | "last-week"
  | "last-2-weeks";
type TimelineFilterMode = TimelinePresetId | "custom";

type ConfiguredProject = {
  projectName: string;
  projectSlug: string;
  repository: string;
  branch: string;
  environment: string;
  repoPath: string;
  remoteHost?: string;
  category?: string;
  previewUrl?: string;
};

type ProjectsResponse = {
  data?: ConfiguredProject[];
  error?: string;
};

type ProjectView = "grid" | "list";
type ProjectPanel = "overview" | "project-detail" | "new-project-connect" | "new-project-import";

type ProjectStatusTone = "healthy" | "warning";

type ProjectRecord = {
  id: string;
  slug: string;
  name: string;
  shortCode: string;
  framework: string;
  frameworkBadge: string;
  primaryDomain: string;
  additionalDomains: string[];
  deploymentUrl: string;
  repository: string;
  commitMessage: string;
  commitHash: string;
  updatedAt: string;
  branch: string;
  status: string;
  statusTone: ProjectStatusTone;
  deploymentStatus: string;
  deploymentAge: string;
  author: string;
  previewImage: string;
};

type GitAccount = {
  id: string;
  accountId: string;
  name: string;
  provider: "github" | "gitlab" | "bitbucket";
};

type GitProvider = "github" | "gitlab" | "bitbucket";

type ImportRepository = {
  id: string;
  name: string;
  fullName: string;
  owner: string;
  updatedAt: string;
  visibility: "public" | "private";
};

type OAuthConnectionsResponse = {
  data?: Array<{
    provider?: string;
    accountId?: string;
    accountName?: string;
    avatarUrl?: string;
    connectedAt?: string;
  }>;
};

type GitHubReposResponse = {
  data?: Array<{
    id?: string;
    name?: string;
    fullName?: string;
    owner?: string;
    updatedAt?: string;
    visibility?: "public" | "private";
  }>;
  error?: string;
};

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3000";
const OAUTH_GITHUB_START_URL = `${API_BASE}/v1/oauth/github/start`;
const OAUTH_GITLAB_START_URL = `${API_BASE}/v1/oauth/gitlab/start`;
const OAUTH_BITBUCKET_START_URL = `${API_BASE}/v1/oauth/bitbucket/start`;
const OAUTH_CONNECTIONS_URL = `${API_BASE}/v1/oauth/connections`;
const OAUTH_GITHUB_REPOS_URL = `${API_BASE}/v1/oauth/github/repos`;
const MANAGE_LOGINS_URL = String(
  import.meta.env.VITE_MANAGE_LOGINS_URL ?? "https://github.com/settings/connections/applications"
);

const menuGroups: MenuItem[][] = [
  [
    { label: "Projects", icon: "projects" },
    { label: "Deployments", icon: "deployments" },
    { label: "Logs", icon: "logs" },
    { label: "Analytics", icon: "analytics" },
    { label: "Speed Insights", icon: "speed" },
    { label: "Observability", icon: "observability", chevron: true },
    { label: "Firewall", icon: "firewall" },
  ],
  [
    { label: "Domains", icon: "domains" },
    { label: "Integrations", icon: "integrations" },
    { label: "Storage", icon: "storage" },
    { label: "Flags", icon: "flags" },
    { label: "Agent", icon: "agent", chevron: true },
    { label: "AI Gateway", icon: "ai", chevron: true },
    { label: "Sandboxes", icon: "sandboxes", chevron: true },
  ],
  [
    { label: "Usage", icon: "usage" },
    { label: "Support", icon: "support" },
    { label: "Settings", icon: "settings", chevron: true },
  ],
];

const projectDetailMenuGroups: MenuItem[][] = [
  [
    { label: "Overview", icon: "projects", badge: "N" },
    { label: "Deployments", icon: "deployments" },
    { label: "Logs", icon: "logs" },
    { label: "Analytics", icon: "analytics" },
    { label: "Speed Insights", icon: "speed" },
    { label: "Observability", icon: "observability", chevron: true },
    { label: "Firewall", icon: "firewall", chevron: true },
  ],
  [
    { label: "Domains", icon: "domains" },
    { label: "Integrations", icon: "integrations" },
    { label: "Storage", icon: "storage" },
    { label: "Flags", icon: "flags", chevron: true },
    { label: "Agent", icon: "agent", chevron: true },
    { label: "AI Gateway", icon: "ai", chevron: true },
    { label: "Sandboxes", icon: "sandboxes" },
  ],
  [
    { label: "Usage", icon: "usage" },
    { label: "Support", icon: "support" },
    { label: "Settings", icon: "settings", chevron: true },
  ],
];

const initialProjects: ProjectRecord[] = [
  {
    id: "kani-taxi",
    slug: "call-taxi",
    name: "KANI TAXI",
    shortCode: "CT",
    framework: "Next.js",
    frameworkBadge: "N",
    primaryDomain: "kanitaxi.com",
    additionalDomains: ["www.kanitaxi.com"],
    deploymentUrl: "call-taxi-gkb83grp1-seyal.vercel.app",
    repository: "SeyalTeam/CallTAXI",
    commitMessage: "hero section background issues sorted",
    commitHash: "180ea65",
    updatedAt: "1d ago",
    branch: "main",
    status: "Healthy",
    statusTone: "healthy",
    deploymentStatus: "Ready",
    deploymentAge: "1d ago",
    author: "SeyalTeam",
    previewImage: "/project-preview.png",
  },
];

function normalizeProjectId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getProjectShortCode(projectName: string): string {
  const chunks = projectName
    .split(/[^a-z0-9]+/i)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
  if (chunks.length === 0) {
    return "PR";
  }
  if (chunks.length === 1) {
    return chunks[0].slice(0, 2).toUpperCase();
  }
  return `${chunks[0][0] ?? ""}${chunks[1][0] ?? ""}`.toUpperCase();
}

function parseHostname(rawUrl: string | undefined): string {
  const url = (rawUrl ?? "").trim();
  if (!url) {
    return "";
  }
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function mapConfiguredProject(project: ConfiguredProject, existing: ProjectRecord | undefined): ProjectRecord {
  const normalizedId = normalizeProjectId(project.projectSlug || project.projectName);
  const fallbackTech = detectProjectTech(project.projectName);
  const previewHost = parseHostname(project.previewUrl);
  const primaryDomain = existing?.primaryDomain || previewHost || `${normalizedId}.local`;

  return {
    id: normalizedId,
    slug: normalizedId,
    name: project.projectName,
    shortCode: existing?.shortCode || getProjectShortCode(project.projectName),
    framework: existing?.framework || fallbackTech.name,
    frameworkBadge: existing?.frameworkBadge || fallbackTech.badge,
    primaryDomain,
    additionalDomains: existing?.additionalDomains ?? [],
    deploymentUrl: existing?.deploymentUrl || previewHost || `${normalizedId}.vercel.app`,
    repository: project.repository || existing?.repository || "-",
    commitMessage: existing?.commitMessage || "No deployments yet",
    commitHash: existing?.commitHash || "-",
    updatedAt: existing?.updatedAt || "just now",
    branch: project.branch || existing?.branch || "main",
    status: existing?.status || "Healthy",
    statusTone: existing?.statusTone || "healthy",
    deploymentStatus: existing?.deploymentStatus || "Unknown",
    deploymentAge: existing?.deploymentAge || "-",
    author: existing?.author || "system",
    previewImage: existing?.previewImage || "/project-preview.png",
  };
}

function mergeConfiguredProjects(current: ProjectRecord[], configured: ConfiguredProject[]): ProjectRecord[] {
  if (configured.length === 0) {
    return current;
  }
  const currentById = new Map(current.map((project) => [project.id, project]));
  return configured.map((project) => {
    const normalizedId = normalizeProjectId(project.projectSlug || project.projectName);
    return mapConfiguredProject(project, currentById.get(normalizedId));
  });
}

function applyLatestDeployment(
  projects: ProjectRecord[],
  latest: Deployment | null,
  targetProjectId?: string
): ProjectRecord[] {
  if (!latest) return projects;
  const resolvedProjectId = normalizeProjectId(targetProjectId ?? latest.projectName);
  if (!resolvedProjectId) return projects;

  return projects.map((project) => {
    if (project.id !== resolvedProjectId) return project;

    const deploymentStatus = latest.status || project.deploymentStatus;
    const statusTone: ProjectStatusTone = deploymentStatus.toLowerCase().includes("fail")
      ? "warning"
      : project.statusTone;
    const status = statusTone === "warning" ? "Warning" : project.status;

    return {
      ...project,
      commitMessage: latest.commitMessage || project.commitMessage,
      commitHash: latest.commitHash || project.commitHash,
      updatedAt: latest.createdRelative || project.updatedAt,
      branch: latest.branch || project.branch,
      author: latest.author || project.author,
      deploymentStatus,
      deploymentAge: latest.createdRelative || project.deploymentAge,
      statusTone,
      status,
    };
  });
}

function deploymentTimestamp(deployment: Deployment): number {
  const rawTimestamp = deployment.trackedAt ?? deployment.commitAt;
  if (!rawTimestamp) {
    return 0;
  }
  const parsed = Date.parse(rawTimestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortDeploymentsByNewest(deployments: Deployment[]): Deployment[] {
  return [...deployments].sort((left, right) => deploymentTimestamp(right) - deploymentTimestamp(left));
}

const templateCards = [
  {
    id: "nextjs",
    title: "Next.js Boilerplate",
    description: "Get started with Next.js and React in seconds.",
  },
  {
    id: "ai-chatbot",
    title: "AI Chatbot",
    description: "A full-featured, hackable Next.js AI chatbot starter.",
  },
  {
    id: "express",
    title: "Express.js API",
    description: "Simple Express API starter for server workloads.",
  },
  {
    id: "vite-react",
    title: "Vite + React Starter",
    description: "Vite/React site template with production defaults.",
  },
];

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M12.5 12.5L17 17" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M8 5L13 10L8 15" />
    </svg>
  );
}

function MenuIcon({ name }: { name: IconName }) {
  switch (name) {
    case "projects":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <rect x="3" y="3" width="5" height="5" />
          <rect x="12" y="3" width="5" height="5" />
          <rect x="3" y="12" width="5" height="5" />
          <rect x="12" y="12" width="5" height="5" />
        </svg>
      );
    case "deployments":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 2L16 5.5V14.5L10 18L4 14.5V5.5L10 2Z" />
          <path d="M4 5.5L10 9L16 5.5" />
          <path d="M10 9V18" />
        </svg>
      );
    case "logs":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M4 5H7" />
          <path d="M9 5H16" />
          <path d="M4 10H7" />
          <path d="M9 10H16" />
          <path d="M4 15H7" />
          <path d="M9 15H16" />
        </svg>
      );
    case "analytics":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M4 16V10" />
          <path d="M10 16V6" />
          <path d="M16 16V3" />
          <path d="M2 16H18" />
        </svg>
      );
    case "speed":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3 14A7 7 0 0 1 17 14" />
          <path d="M10 10L14 6" />
          <circle cx="10" cy="14" r="1.4" />
        </svg>
      );
    case "observability":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M2.5 10S5.5 5 10 5s7.5 5 7.5 5-3 5-7.5 5-7.5-5-7.5-5Z" />
          <circle cx="10" cy="10" r="2.3" />
        </svg>
      );
    case "firewall":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 2L16 4.5V9.5C16 13.5 13.6 16.5 10 18C6.4 16.5 4 13.5 4 9.5V4.5L10 2Z" />
        </svg>
      );
    case "domains":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="7" />
          <path d="M3 10H17" />
          <path d="M10 3C11.8 4.8 12.8 7.3 12.8 10S11.8 15.2 10 17" />
          <path d="M10 3C8.2 4.8 7.2 7.3 7.2 10S8.2 15.2 10 17" />
        </svg>
      );
    case "integrations":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M7.5 12.5L10 10" />
          <path d="M10 10L12.5 7.5" />
          <path d="M5.5 14.5A2.8 2.8 0 0 1 5.5 10.5L7.5 8.5" />
          <path d="M14.5 5.5A2.8 2.8 0 0 1 14.5 9.5L12.5 11.5" />
          <path d="M8.5 12.5L6.5 14.5A2.8 2.8 0 0 1 2.5 14.5" />
          <path d="M11.5 7.5L13.5 5.5A2.8 2.8 0 0 1 17.5 5.5" />
        </svg>
      );
    case "storage":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <ellipse cx="10" cy="5" rx="6.5" ry="2.5" />
          <path d="M3.5 5V10C3.5 11.4 6.4 12.5 10 12.5C13.6 12.5 16.5 11.4 16.5 10V5" />
          <path d="M3.5 10V15C3.5 16.4 6.4 17.5 10 17.5C13.6 17.5 16.5 16.4 16.5 15V10" />
        </svg>
      );
    case "flags":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M5 3V17" />
          <path d="M5 4H15L13 7L15 10H5" />
        </svg>
      );
    case "agent":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <rect x="4" y="5" width="12" height="10" rx="2" />
          <circle cx="8" cy="10" r="1" />
          <circle cx="12" cy="10" r="1" />
          <path d="M8 13H12" />
        </svg>
      );
    case "ai":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 3L11.6 7.2L16 8.8L11.6 10.4L10 14.6L8.4 10.4L4 8.8L8.4 7.2L10 3Z" />
        </svg>
      );
    case "sandboxes":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <rect x="3.5" y="3.5" width="13" height="13" rx="2.5" />
          <path d="M7 7H13" />
          <path d="M7 10H13" />
          <path d="M7 13H10.5" />
        </svg>
      );
    case "usage":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 3A7 7 0 1 0 17 10H10V3Z" />
          <path d="M10 3A7 7 0 0 1 17 10" />
        </svg>
      );
    case "support":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="6.5" />
          <circle cx="10" cy="10" r="2.5" />
          <path d="M10 3.5V5.7" />
          <path d="M10 14.3V16.5" />
          <path d="M3.5 10H5.7" />
          <path d="M14.3 10H16.5" />
        </svg>
      );
    case "settings":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="2.5" />
          <path d="M10 3V5" />
          <path d="M10 15V17" />
          <path d="M3 10H5" />
          <path d="M15 10H17" />
          <path d="M5.2 5.2L6.6 6.6" />
          <path d="M13.4 13.4L14.8 14.8" />
          <path d="M14.8 5.2L13.4 6.6" />
          <path d="M6.6 13.4L5.2 14.8" />
        </svg>
      );
    default:
      return null;
  }
}

function DeployStateIcon() {
  return (
    <span className="deploy-dot" aria-hidden="true">
      <svg viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="9" />
      </svg>
    </span>
  );
}

function BranchIcon() {
  return (
    <span className="meta-icon" aria-hidden="true">
      <svg viewBox="0 0 20 20">
        <circle cx="5" cy="4.5" r="2" />
        <circle cx="15" cy="15.5" r="2" />
        <circle cx="5" cy="15.5" r="2" />
        <path d="M5 6.5V13.5" />
        <path d="M7 8.5H11.5A3.5 3.5 0 0 0 15 5V2.5" />
      </svg>
    </span>
  );
}

function CommitIcon() {
  return (
    <span className="meta-icon" aria-hidden="true">
      <svg viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="2.5" />
        <path d="M2.5 10H7.5" />
        <path d="M12.5 10H17.5" />
      </svg>
    </span>
  );
}

function HealthIcon() {
  return (
    <span className="health-icon" aria-hidden="true">
      <svg viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="9" />
        <path d="M5 13.5V9.5" />
        <path d="M10 13.5V6.5" />
        <path d="M15 13.5V4.5" />
      </svg>
    </span>
  );
}

function FilterBarsIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 5H16" />
      <path d="M6 10H14" />
      <path d="M8 15H12" />
    </svg>
  );
}

function GridViewIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3.2" y="3.2" width="5" height="5" />
      <rect x="11.8" y="3.2" width="5" height="5" />
      <rect x="3.2" y="11.8" width="5" height="5" />
      <rect x="11.8" y="11.8" width="5" height="5" />
    </svg>
  );
}

function ListViewIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 5H16" />
      <path d="M4 10H16" />
      <path d="M4 15H16" />
    </svg>
  );
}

function DownChevronIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M6 8L10 12L14 8" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.2A10 10 0 0 0 8.8 21.7c.5.1.7-.2.7-.5v-1.9c-2.8.6-3.4-1.2-3.4-1.2-.4-1-.9-1.3-.9-1.3-.7-.5.1-.5.1-.5.8.1 1.3.8 1.3.8.7 1.2 1.8.9 2.3.7.1-.5.3-.9.5-1.1-2.2-.3-4.5-1.1-4.5-4.8 0-1 .4-1.9 1-2.6-.1-.2-.4-1.2.1-2.4 0 0 .9-.3 2.8 1a9.8 9.8 0 0 1 5.1 0c1.9-1.3 2.8-1 2.8-1 .5 1.2.2 2.2.1 2.4.7.7 1 1.6 1 2.6 0 3.7-2.3 4.5-4.5 4.8.3.3.6.9.6 1.8v2.7c0 .3.2.6.7.5A10 10 0 0 0 12 2.2Z" />
    </svg>
  );
}

function GitLabIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20.5L15.5 9.6H8.5L12 20.5Z" />
      <path d="M12 20.5L5.2 9.6H8.5L12 20.5Z" />
      <path d="M12 20.5L18.8 9.6H15.5L12 20.5Z" />
      <path d="M5.2 9.6L7.3 3.7L8.5 9.6H5.2Z" />
      <path d="M18.8 9.6L16.7 3.7L15.5 9.6H18.8Z" />
    </svg>
  );
}

function BitbucketIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 4H20L17.2 20H6.8L4 4Z" />
      <path d="M8.5 9.2H15.5L14.6 14.8H9.4L8.5 9.2Z" />
    </svg>
  );
}

function ProviderIconMark({ provider }: { provider: GitProvider }) {
  if (provider === "gitlab") {
    return <GitLabIcon />;
  }
  if (provider === "bitbucket") {
    return <BitbucketIcon />;
  }
  return <GitHubIcon />;
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M11 4H16V9" />
      <path d="M16 4L9 11" />
      <path d="M8 5H5A2 2 0 0 0 3 7V15A2 2 0 0 0 5 17H13A2 2 0 0 0 15 15V12" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4.5 10.5L8.3 14L15.5 6.8" />
    </svg>
  );
}

function RollbackIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M7.5 5.5H3.5V9.5" />
      <path d="M3.5 5.5L7.2 9.2" />
      <path d="M7.5 14.5A5.5 5.5 0 1 0 7.5 5.5" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M16.5 4.5V8.8H12.2" />
      <path d="M3.5 15.5V11.2H7.8" />
      <path d="M15.3 9.1A5.9 5.9 0 0 0 5.5 6.3" />
      <path d="M4.7 10.9A5.9 5.9 0 0 0 14.5 13.7" />
    </svg>
  );
}

function LiveIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7.2" />
      {active ? <rect x="8" y="8" width="4" height="4" rx="0.8" /> : <path d="M8.6 7.6L12.6 10L8.6 12.4Z" />}
    </svg>
  );
}

function KebabIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="4" r="1.5" />
      <circle cx="10" cy="10" r="1.5" />
      <circle cx="10" cy="16" r="1.5" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M12 5L7 10L12 15" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
      <path d="M6 3V6" />
      <path d="M14 3V6" />
      <path d="M3 8H17" />
    </svg>
  );
}

function RightChevronIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M8 5L13 10L8 15" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5 5L15 15" />
      <path d="M15 5L5 15" />
    </svg>
  );
}

function normalizeFetchError(error: unknown): string {
  if (error instanceof TypeError) {
    return `Cannot reach API at ${API_BASE}. Start control-plane with npm run dev:api`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error while loading deployments";
}

function pluralize(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

function formatElapsedWithSeconds(isoTime: string, nowMs: number): string {
  const targetMs = new Date(isoTime).getTime();
  if (Number.isNaN(targetMs)) return "Unknown time";

  let totalSeconds = Math.max(0, Math.floor((nowMs - targetMs) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  totalSeconds %= 86400;
  const hours = Math.floor(totalSeconds / 3600);
  totalSeconds %= 3600;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) {
    parts.push(pluralize(days, "day"));
  }
  if (hours > 0 || parts.length > 0) {
    parts.push(pluralize(hours, "hour"));
  }
  if (minutes > 0 || parts.length > 0) {
    parts.push(pluralize(minutes, "minute"));
  }
  parts.push(pluralize(seconds, "second"));
  return `${parts.join(", ")} ago`;
}

function formatDateInZone(isoTime: string, timeZone?: string): string {
  const target = new Date(isoTime);
  if (Number.isNaN(target.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    ...(timeZone ? { timeZone } : {}),
  }).format(target);
}

function formatTimeInZone(isoTime: string, timeZone?: string): string {
  const target = new Date(isoTime);
  if (Number.isNaN(target.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    ...(timeZone ? { timeZone } : {}),
  }).format(target);
}

function formatLocalGmtOffset(isoTime: string): string {
  const target = new Date(isoTime);
  if (Number.isNaN(target.getTime())) return "Local";
  const offsetMinutes = -target.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  return `GMT${sign}${hours}:${String(minutes).padStart(2, "0")}`;
}

function detectProjectTech(projectName: string): { name: string; badge: string } {
  const normalized = projectName.toLowerCase();
  if (normalized.includes("kani taxi")) {
    return { name: "Next.js", badge: "N" };
  }
  return { name: "Node.js", badge: "JS" };
}

function canonicalLabel(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function displayRepositoryName(repoName: string): string {
  if (canonicalLabel(repoName) === "calltaxi") {
    return "KANI TAXI";
  }
  return repoName;
}

function formatRepoUpdatedLabel(isoTime: string): string {
  const targetMs = new Date(isoTime).getTime();
  if (Number.isNaN(targetMs)) return "-";

  const diffSeconds = Math.max(0, Math.floor((Date.now() - targetMs) / 1000));
  if (diffSeconds < 60) return "just now";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(isoTime));
}

function formatLogTimestamp(isoTime: string | undefined): string {
  if (!isoTime) return "-";
  const target = new Date(isoTime);
  if (Number.isNaN(target.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(target);
}

function formatLogDetailTimestamp(isoTime: string | undefined): string {
  if (!isoTime) return "-";
  const target = new Date(isoTime);
  if (Number.isNaN(target.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(target);
}

function parseLogPathDetails(pathValue: string | undefined): { pathname: string; searchParams: Array<[string, string]> } {
  const normalized = pathValue && pathValue.trim().length > 0 ? pathValue.trim() : "/";
  const candidate =
    normalized.startsWith("http://") || normalized.startsWith("https://")
      ? normalized
      : `https://request.local${normalized.startsWith("/") ? normalized : `/${normalized}`}`;
  try {
    const parsed = new URL(candidate);
    return {
      pathname: parsed.pathname || "/",
      searchParams: [...parsed.searchParams.entries()],
    };
  } catch {
    return {
      pathname: normalized,
      searchParams: [],
    };
  }
}

function toLogStatusTone(statusCode: number | null): "ok" | "error" | "neutral" {
  if (statusCode === null) return "neutral";
  if (statusCode >= 200 && statusCode < 400) return "ok";
  if (statusCode >= 400) return "error";
  return "neutral";
}

function classifyLogSeverity(statusCode: number | null): LogSeverity | null {
  if (statusCode === null) return "fatal";
  if (statusCode >= 500) return "error";
  if (statusCode >= 400) return "warning";
  return null;
}

const timelinePresetConfig: Record<TimelinePresetId, { label: string; minutes: number }> = {
  "last-30-minutes": { label: "Last 30 minutes", minutes: 30 },
  "last-hour": { label: "Last hour", minutes: 60 },
  "last-12-hours": { label: "Last 12 hours", minutes: 12 * 60 },
  "last-day": { label: "Last day", minutes: 24 * 60 },
  "last-3-days": { label: "Last 3 days", minutes: 3 * 24 * 60 },
  "last-week": { label: "Last week", minutes: 7 * 24 * 60 },
  "last-2-weeks": { label: "Last 2 weeks", minutes: 14 * 24 * 60 },
};

const timelinePresetMenuItems: Array<
  { kind: "option"; id: TimelinePresetId; label: string } | { kind: "label"; label: string }
> = [
  { kind: "option", id: "last-30-minutes", label: "Last 30 minutes" },
  { kind: "option", id: "last-hour", label: "Last hour" },
  { kind: "option", id: "last-12-hours", label: "Last 12 hours" },
  { kind: "option", id: "last-day", label: "Last day" },
  { kind: "label", label: "Observability Plus" },
  { kind: "option", id: "last-3-days", label: "Last 3 days" },
  { kind: "option", id: "last-week", label: "Last week" },
  { kind: "option", id: "last-2-weeks", label: "Last 2 weeks" },
];

function timelinePresetLabel(mode: TimelineFilterMode): string {
  if (mode === "custom") return "Custom range";
  return timelinePresetConfig[mode].label;
}

function toDateInputValue(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toTimeInputValue(value: Date): string {
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function parseLocalDateTime(dateInput: string, timeInput: string): Date | null {
  if (!dateInput || !timeInput) return null;
  const parsed = new Date(`${dateInput}T${timeInput}:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatMonthLabel(value: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(value);
}

function currentLocalTimeZoneLabel(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return `Local (${zone})`;
}

function escapeCsvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function toLogsCsv(entries: RequestLogEntry[]): string {
  const header = [
    "timestamp",
    "project",
    "method",
    "statusCode",
    "host",
    "path",
    "message",
    "remoteAddr",
  ];
  const lines = entries.map((entry) =>
    [
      entry.timestamp,
      entry.projectName,
      entry.method,
      entry.statusCode === null ? "" : String(entry.statusCode),
      entry.host,
      entry.path,
      entry.message,
      entry.remoteAddr ?? "",
    ]
      .map((value) => escapeCsvCell(value))
      .join(",")
  );
  return [header.join(","), ...lines].join("\n");
}

function downloadTextFile(filename: string, content: string, contentType: string): void {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [activeMenu, setActiveMenu] = useState("Projects");
  const [projects, setProjects] = useState<ProjectRecord[]>(() => initialProjects);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [deploymentsLoading, setDeploymentsLoading] = useState(false);
  const [deploymentsError, setDeploymentsError] = useState<string | null>(null);
  const [requestLogs, setRequestLogs] = useState<RequestLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [hoveredDeploymentId, setHoveredDeploymentId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [projectView, setProjectView] = useState<ProjectView>("grid");
  const [projectPanel, setProjectPanel] = useState<ProjectPanel>("overview");
  const [activeProjectMenu, setActiveProjectMenu] = useState("Overview");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [previewFallback, setPreviewFallback] = useState(false);
  const [projectConnectError, setProjectConnectError] = useState<string | null>(null);
  const [connectedGitAccounts, setConnectedGitAccounts] = useState<GitAccount[]>([]);
  const [importRepositories, setImportRepositories] = useState<ImportRepository[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [gitAccountMenuOpen, setGitAccountMenuOpen] = useState(false);
  const [selectedGitAccountId, setSelectedGitAccountId] = useState<string | null>(null);
  const [repoSearch, setRepoSearch] = useState("");
  const [logSearch, setLogSearch] = useState("");
  const [logsMenuOpen, setLogsMenuOpen] = useState(false);
  const [logsSidebarOpen, setLogsSidebarOpen] = useState(false);
  const [logsRefreshTick, setLogsRefreshTick] = useState(0);
  const [logsLiveEnabled, setLogsLiveEnabled] = useState(false);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [timelineFilterMode, setTimelineFilterMode] = useState<TimelineFilterMode>("last-30-minutes");
  const [timelinePresetMenuOpen, setTimelinePresetMenuOpen] = useState(false);
  const [timelineCalendarOpen, setTimelineCalendarOpen] = useState(false);
  const [timelineCalendarMonth, setTimelineCalendarMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [customStartDate, setCustomStartDate] = useState(() => {
    const now = new Date();
    const start = new Date(now.getTime() - 30 * 60 * 1000);
    return toDateInputValue(start);
  });
  const [customStartTime, setCustomStartTime] = useState(() => {
    const now = new Date();
    const start = new Date(now.getTime() - 30 * 60 * 1000);
    return toTimeInputValue(start);
  });
  const [customEndDate, setCustomEndDate] = useState(() => toDateInputValue(new Date()));
  const [customEndTime, setCustomEndTime] = useState(() => toTimeInputValue(new Date()));
  const [logSeverityFilters, setLogSeverityFilters] = useState<Record<LogSeverity, boolean>>({
    warning: false,
    error: false,
    fatal: false,
  });
  const [pendingImportRepoId, setPendingImportRepoId] = useState<string | null>(null);
  const [approvedImports, setApprovedImports] = useState<string[]>([]);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const gitAccountMenuRef = useRef<HTMLDivElement | null>(null);
  const logsMenuRef = useRef<HTMLDivElement | null>(null);
  const timelineFilterRef = useRef<HTMLDivElement | null>(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const deploymentsProjectId = useMemo(
    () => selectedProjectId ?? projects[0]?.id ?? "kani-taxi",
    [projects, selectedProjectId]
  );
  const configuredProjectIds = useMemo(() => projects.map((project) => project.id), [projects]);

  const isProjectDetail = projectPanel === "project-detail" && Boolean(selectedProject);
  const isProjectScopedDeployments = isProjectDetail && activeProjectMenu === "Deployments";
  const isGlobalDeploymentsView = activeMenu === "Deployments";
  const isDeploymentsView = isGlobalDeploymentsView || isProjectScopedDeployments;
  const isProjectScopedLogs = isProjectDetail && activeProjectMenu === "Logs";
  const isGlobalLogsView = activeMenu === "Logs";
  const isLogsView = isGlobalLogsView || isProjectScopedLogs;
  const isLogsSidebar = isLogsView && logsSidebarOpen;
  const timelineWindow = useMemo(() => {
    if (timelineFilterMode === "custom") {
      const start = parseLocalDateTime(customStartDate, customStartTime);
      const end = parseLocalDateTime(customEndDate, customEndTime);
      if (!start || !end) {
        return { startIso: undefined as string | undefined, endIso: undefined as string | undefined };
      }
      return { startIso: start.toISOString(), endIso: end.toISOString() };
    }
    const now = new Date();
    const start = new Date(now.getTime() - timelinePresetConfig[timelineFilterMode].minutes * 60 * 1000);
    return { startIso: start.toISOString(), endIso: now.toISOString() };
  }, [customEndDate, customEndTime, customStartDate, customStartTime, logsRefreshTick, timelineFilterMode]);
  const timelineButtonLabel = useMemo(() => timelinePresetLabel(timelineFilterMode), [timelineFilterMode]);
  const timelineCalendarDays = useMemo(() => {
    const year = timelineCalendarMonth.getFullYear();
    const month = timelineCalendarMonth.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leadingEmptyCells = firstDayOfMonth.getDay();
    const cells: Array<Date | null> = [];

    for (let index = 0; index < leadingEmptyCells; index += 1) {
      cells.push(null);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(new Date(year, month, day));
    }

    const trailingCells = (7 - (cells.length % 7)) % 7;
    for (let index = 0; index < trailingCells; index += 1) {
      cells.push(null);
    }

    return cells;
  }, [timelineCalendarMonth]);

  const logSeverityCounts = useMemo(() => {
    const counts: Record<LogSeverity, number> = {
      warning: 0,
      error: 0,
      fatal: 0,
    };
    for (const logEntry of requestLogs) {
      const severity = classifyLogSeverity(logEntry.statusCode);
      if (!severity) continue;
      counts[severity] += 1;
    }
    return counts;
  }, [requestLogs]);

  const filteredLogs = useMemo(() => {
    const search = logSearch.trim().toLowerCase();
    const selectedSeverities = (Object.keys(logSeverityFilters) as LogSeverity[]).filter(
      (severity) => logSeverityFilters[severity]
    );
    const hasSeverityFilter = selectedSeverities.length > 0;
    const source = requestLogs;
    return source.filter((logEntry) => {
      if (hasSeverityFilter) {
        const severity = classifyLogSeverity(logEntry.statusCode);
        if (!severity || !selectedSeverities.includes(severity)) {
          return false;
        }
      }
      if (!search) {
        return true;
      }
      const haystack = [
        logEntry.projectName,
        logEntry.projectSlug,
        logEntry.method,
        logEntry.path,
        logEntry.host,
        logEntry.message,
        logEntry.statusCode === null ? "---" : String(logEntry.statusCode),
        logEntry.remoteAddr ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }, [logSeverityFilters, requestLogs, logSearch]);
  const selectedLogEntry = useMemo(() => {
    if (!selectedLogId) return null;
    return filteredLogs.find((logEntry) => logEntry.logId === selectedLogId) ?? null;
  }, [filteredLogs, selectedLogId]);
  const selectedLogPathDetails = useMemo(
    () => parseLogPathDetails(selectedLogEntry?.path),
    [selectedLogEntry?.path]
  );

  useEffect(() => {
    setPreviewFallback(false);
  }, [selectedProjectId, projectPanel]);

  const pageTitle = useMemo(() => {
    if (isDeploymentsView) return "Deployments";
    if (isLogsView) return "Logs";
    if (activeMenu === "Projects" && projectPanel === "project-detail" && selectedProject) {
      return "Overview";
    }
    if (activeMenu === "Projects" && projectPanel !== "overview") return "Projects";
    return "Overview";
  }, [activeMenu, isDeploymentsView, isLogsView, projectPanel, selectedProject]);

  const pageTag = useMemo(() => {
    if (activeMenu === "Projects" && projectPanel === "project-detail" && selectedProject) {
      return selectedProject.slug;
    }
    return "All Projects";
  }, [activeMenu, projectPanel, selectedProject]);

  const selectedGitAccount = useMemo(
    () => connectedGitAccounts.find((account) => account.id === selectedGitAccountId) ?? null,
    [connectedGitAccounts, selectedGitAccountId]
  );

  const pendingImportRepo = useMemo(
    () => importRepositories.find((repo) => repo.id === pendingImportRepoId) ?? null,
    [importRepositories, pendingImportRepoId]
  );

  const loadOAuthConnections = async () => {
    try {
      const response = await fetch(OAUTH_CONNECTIONS_URL);
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as OAuthConnectionsResponse;
      const mappedAccounts: GitAccount[] = (payload.data ?? [])
        .filter((item) => item.provider === "github" && item.accountId && item.accountName)
        .map((item) => ({
          id: `github:${item.accountId}`,
          accountId: item.accountId as string,
          name: item.accountName as string,
          provider: "github",
        }));

      setConnectedGitAccounts(mappedAccounts);
    } catch {
      // keep UI usable even if API is unreachable
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadConfiguredProjects = async () => {
      try {
        const response = await fetch(`${API_BASE}/v1/projects`);
        const payload = (await response.json()) as ProjectsResponse;
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load projects");
        }
        if (cancelled) return;
        const configuredProjects = payload.data ?? [];
        if (configuredProjects.length === 0) return;
        setProjects((current) => mergeConfiguredProjects(current, configuredProjects));
      } catch {
        // fallback to local defaults when API is not reachable
      }
    };

    void loadConfiguredProjects();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hoveredDeploymentId) return;
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [hoveredDeploymentId]);

  useEffect(() => {
    if (!isDeploymentsView) return;

    let cancelled = false;
    let isFirstLoad = true;
    const perProjectLimit = 6;
    const mergedLimit = 30;

    const loadDeployments = async () => {
      if (isFirstLoad) {
        setDeploymentsLoading(true);
        setDeploymentsError(null);
      }

      try {
        if (isProjectScopedDeployments) {
          const response = await fetch(
            `${API_BASE}/v1/deployments?project=${encodeURIComponent(deploymentsProjectId)}&limit=${perProjectLimit}`
          );
          const payload = (await response.json()) as DeploymentsResponse;
          if (!response.ok) {
            throw new Error(payload.error ?? "Failed to load deployments");
          }
          if (cancelled) return;
          const data = payload.data ?? [];
          setDeployments(data);
          setProjects((current) => applyLatestDeployment(current, data[0] ?? null, deploymentsProjectId));
          return;
        }

        const targetProjectIds = configuredProjectIds.length > 0 ? configuredProjectIds : [deploymentsProjectId];
        const responses = await Promise.all(
          targetProjectIds.map(async (projectId) => {
            const response = await fetch(
              `${API_BASE}/v1/deployments?project=${encodeURIComponent(projectId)}&limit=${perProjectLimit}`
            );
            const payload = (await response.json()) as DeploymentsResponse;
            if (!response.ok) {
              throw new Error(payload.error ?? `Failed to load deployments for ${projectId}`);
            }
            return { projectId, data: payload.data ?? [] };
          })
        );
        if (cancelled) return;
        const merged = sortDeploymentsByNewest(responses.flatMap((item) => item.data)).slice(0, mergedLimit);
        setDeployments(merged);
        setProjects((current) => {
          let next = current;
          for (const item of responses) {
            next = applyLatestDeployment(next, item.data[0] ?? null, item.projectId);
          }
          return next;
        });
      } catch (error: unknown) {
        if (cancelled) return;
        setDeploymentsError(normalizeFetchError(error));
      } finally {
        if (isFirstLoad && !cancelled) {
          setDeploymentsLoading(false);
        }
        isFirstLoad = false;
      }
    };

    void loadDeployments();
    const timer = window.setInterval(() => {
      void loadDeployments();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [configuredProjectIds.join("|"), deploymentsProjectId, isDeploymentsView, isProjectScopedDeployments]);

  useEffect(() => {
    if (!isLogsView) return;

    let cancelled = false;
    const logLimit = isProjectScopedLogs ? 80 : 180;

    const loadRequestLogs = async () => {
      setLogsLoading(true);
      setLogsError(null);

      try {
        const params = new URLSearchParams();
        params.set("limit", String(logLimit));
        if (isProjectScopedLogs) {
          params.set("project", deploymentsProjectId);
        }
        if (timelineWindow.startIso) {
          params.set("start", timelineWindow.startIso);
        }
        if (timelineWindow.endIso) {
          params.set("end", timelineWindow.endIso);
        }

        const response = await fetch(`${API_BASE}/v1/logs?${params.toString()}`);
        const payload = (await response.json()) as RequestLogsResponse;
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load request logs");
        }
        if (cancelled) return;
        setRequestLogs(payload.data ?? []);
      } catch (error: unknown) {
        if (cancelled) return;
        setLogsError(normalizeFetchError(error));
      } finally {
        if (!cancelled) {
          setLogsLoading(false);
        }
      }
    };

    void loadRequestLogs();

    return () => {
      cancelled = true;
    };
  }, [
    deploymentsProjectId,
    isLogsView,
    isProjectScopedLogs,
    logsRefreshTick,
    timelineWindow.endIso,
    timelineWindow.startIso,
  ]);

  useEffect(() => {
    if (!isLogsView || !logsLiveEnabled) return;

    const timer = window.setInterval(() => {
      setLogsRefreshTick((current) => current + 1);
    }, 4000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isLogsView, logsLiveEnabled]);

  useEffect(() => {
    let cancelled = false;

    const loadLatestDeployments = async () => {
      try {
        const responses = await Promise.all(
          configuredProjectIds.map(async (projectId) => {
            const response = await fetch(`${API_BASE}/v1/deployments/latest?project=${encodeURIComponent(projectId)}`);
            const payload = (await response.json()) as { data?: Deployment | null; error?: string };
            if (!response.ok) {
              throw new Error(payload.error ?? `Failed to load latest deployment for ${projectId}`);
            }
            return {
              projectId,
              latest: payload.data ?? null,
            };
          })
        );
        if (cancelled) return;
        setProjects((current) => {
          let next = current;
          for (const item of responses) {
            next = applyLatestDeployment(next, item.latest, item.projectId);
          }
          return next;
        });
      } catch {
        // ignore
      }
    };

    if (configuredProjectIds.length === 0) {
      return () => {
        cancelled = true;
      };
    }

    void loadLatestDeployments();
    const timer = window.setInterval(() => {
      void loadLatestDeployments();
    }, 8000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [configuredProjectIds.join("|")]);

  useEffect(() => {
    if (!addMenuOpen && !gitAccountMenuOpen && !logsMenuOpen && !timelinePresetMenuOpen && !timelineCalendarOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (addMenuOpen && !addMenuRef.current?.contains(target)) {
        setAddMenuOpen(false);
      }
      if (gitAccountMenuOpen && !gitAccountMenuRef.current?.contains(target)) {
        setGitAccountMenuOpen(false);
      }
      if (logsMenuOpen && !logsMenuRef.current?.contains(target)) {
        setLogsMenuOpen(false);
      }
      if ((timelinePresetMenuOpen || timelineCalendarOpen) && !timelineFilterRef.current?.contains(target)) {
        setTimelinePresetMenuOpen(false);
        setTimelineCalendarOpen(false);
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [addMenuOpen, gitAccountMenuOpen, logsMenuOpen, timelineCalendarOpen, timelinePresetMenuOpen]);

  useEffect(() => {
    if (!isLogsView) {
      setLogsMenuOpen(false);
      setLogsSidebarOpen(false);
      setTimelinePresetMenuOpen(false);
      setTimelineCalendarOpen(false);
      setSelectedLogId(null);
    }
  }, [isLogsView]);

  useEffect(() => {
    if (!selectedLogId) return;
    if (filteredLogs.some((entry) => entry.logId === selectedLogId)) return;
    setSelectedLogId(null);
  }, [filteredLogs, selectedLogId]);

  useEffect(() => {
    if (activeMenu !== "Projects") {
      setProjectPanel("overview");
      setSelectedProjectId(null);
      setActiveProjectMenu("Overview");
      setAddMenuOpen(false);
      setGitAccountMenuOpen(false);
      setLogsMenuOpen(false);
      setTimelinePresetMenuOpen(false);
      setTimelineCalendarOpen(false);
      setProjectConnectError(null);
    }
  }, [activeMenu]);

  useEffect(() => {
    if (connectedGitAccounts.length === 0) {
      setSelectedGitAccountId(null);
      setGitAccountMenuOpen(false);
      setRepoSearch("");
      setPendingImportRepoId(null);
      setImportRepositories([]);
      setImportError(null);
      setImportLoading(false);
      return;
    }
    setSelectedGitAccountId((current) => {
      if (current && connectedGitAccounts.some((account) => account.id === current)) {
        return current;
      }
      return connectedGitAccounts[0].id;
    });
  }, [connectedGitAccounts]);

  useEffect(() => {
    if (projectPanel !== "new-project-import") {
      return;
    }

    if (!selectedGitAccount) {
      setImportRepositories([]);
      setImportLoading(false);
      setImportError(null);
      return;
    }

    if (selectedGitAccount.provider !== "github") {
      setImportRepositories([]);
      setImportLoading(false);
      setImportError("Repository listing is currently available only for GitHub.");
      return;
    }

    const controller = new AbortController();
    setImportLoading(true);
    setImportError(null);

    const fetchRepos = async (query: string): Promise<ImportRepository[]> => {
      const params = new URLSearchParams();
      params.set("accountId", selectedGitAccount.accountId);
      params.set("limit", "40");
      if (query) {
        params.set("q", query);
      }

      const response = await fetch(`${OAUTH_GITHUB_REPOS_URL}?${params.toString()}`, { signal: controller.signal });
      const payload = (await response.json()) as GitHubReposResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load repositories");
      }

      return (payload.data ?? [])
        .filter((repo) => repo.id && repo.name)
        .map((repo) => ({
          id: String(repo.id),
          name: repo.name as string,
          fullName: repo.fullName ?? repo.name ?? "unknown",
          owner: repo.owner ?? selectedGitAccount.name,
          updatedAt: repo.updatedAt ?? new Date().toISOString(),
          visibility: repo.visibility === "private" ? "private" : "public",
        }));
    };

    const searchQuery = repoSearch.trim();
    void (async () => {
      try {
        const searchedRepos = await fetchRepos(searchQuery);
        if (searchQuery && searchedRepos.length === 0) {
          const fallbackRepos = await fetchRepos("");
          setImportRepositories(fallbackRepos);
        } else {
          setImportRepositories(searchedRepos);
        }
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setImportRepositories([]);
        if (error instanceof Error) {
          setImportError(error.message);
          return;
        }
        setImportError("Failed to load repositories");
      } finally {
        setImportLoading(false);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [projectPanel, repoSearch, selectedGitAccount]);

  useEffect(() => {
    if (importRepositories.length === 0) {
      setApprovedImports([]);
      setPendingImportRepoId(null);
      return;
    }

    setApprovedImports((current) =>
      current.filter((repoId) => importRepositories.some((repo) => repo.id === repoId))
    );
    setPendingImportRepoId((current) =>
      current && importRepositories.some((repo) => repo.id === current) ? current : null
    );
  }, [importRepositories]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthStatus = params.get("oauth");
    const oauthMessage = params.get("message");

    if (oauthStatus) {
      setActiveMenu("Projects");
      setAddMenuOpen(false);
      setSelectedProjectId(null);
      setActiveProjectMenu("Overview");

      if (oauthStatus.endsWith("-success")) {
        setProjectPanel("new-project-import");
        setProjectConnectError(null);
      } else {
        setProjectPanel("new-project-connect");
        setProjectConnectError(oauthMessage ?? "OAuth sign-in failed. Please try again.");
      }

      params.delete("oauth");
      params.delete("provider");
      params.delete("account");
      params.delete("message");
      const nextQuery = params.toString();
      const nextPath = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
      window.history.replaceState({}, "", nextPath);
    }

    void loadOAuthConnections();
  }, []);

  useEffect(() => {
    if (projectPanel !== "new-project-connect" && projectPanel !== "new-project-import") {
      return;
    }
    void loadOAuthConnections();
  }, [projectPanel]);

  const redirectToProviderSignIn = (provider: GitProvider) => {
    const returnTo = `${window.location.origin}${window.location.pathname}`;
    const startUrl =
      provider === "github"
        ? OAUTH_GITHUB_START_URL
        : provider === "gitlab"
          ? OAUTH_GITLAB_START_URL
          : OAUTH_BITBUCKET_START_URL;

    window.location.assign(`${startUrl}?returnTo=${encodeURIComponent(returnTo)}`);
  };

  const redirectToManageLogins = () => {
    window.location.assign(MANAGE_LOGINS_URL);
  };

  const openProjectDetail = (projectId: string) => {
    setActiveMenu("Projects");
    setSelectedProjectId(projectId);
    setProjectPanel("project-detail");
    setActiveProjectMenu("Overview");
    setAddMenuOpen(false);
    setLogsSidebarOpen(false);
    setSelectedLogId(null);
  };

  const closeProjectDetail = () => {
    setProjectPanel("overview");
    setSelectedProjectId(null);
    setActiveProjectMenu("Overview");
    setLogsMenuOpen(false);
    setLogsSidebarOpen(false);
    setTimelinePresetMenuOpen(false);
    setTimelineCalendarOpen(false);
    setSelectedLogId(null);
  };

  const applyCustomTimeline = () => {
    const start = parseLocalDateTime(customStartDate, customStartTime);
    const end = parseLocalDateTime(customEndDate, customEndTime);
    if (!start || !end) {
      return;
    }

    if (end.getTime() < start.getTime()) {
      const adjustedEnd = new Date(start.getTime() + 30 * 60 * 1000);
      setCustomEndDate(toDateInputValue(adjustedEnd));
      setCustomEndTime(toTimeInputValue(adjustedEnd));
    }

    setTimelineFilterMode("custom");
    setTimelineCalendarOpen(false);
    setTimelinePresetMenuOpen(false);
    setLogsRefreshTick((current) => current + 1);
  };

  const selectTimelinePreset = (preset: TimelinePresetId) => {
    setTimelineFilterMode(preset);
    setTimelinePresetMenuOpen(false);
    setTimelineCalendarOpen(false);
    setLogsRefreshTick((current) => current + 1);
  };

  const toggleLogsLive = () => {
    setLogsLiveEnabled((current) => {
      const next = !current;
      if (next) {
        setLogsRefreshTick((tick) => tick + 1);
      }
      return next;
    });
  };

  const exportLogsAsCsv = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const scope = isProjectScopedLogs && selectedProject ? selectedProject.id : "all-projects";
    downloadTextFile(`${scope}-logs-${timestamp}.csv`, toLogsCsv(filteredLogs), "text/csv;charset=utf-8");
  };

  const exportLogsAsJson = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const scope = isProjectScopedLogs && selectedProject ? selectedProject.id : "all-projects";
    downloadTextFile(
      `${scope}-logs-${timestamp}.json`,
      JSON.stringify(filteredLogs, null, 2),
      "application/json;charset=utf-8"
    );
  };

  return (
    <div
      className={`app-shell ${isProjectDetail ? "app-shell-project-detail" : ""} ${
        isLogsSidebar ? "app-shell-logs-sidebar" : ""
      }`}
    >
      <aside className={`sidebar ${isProjectDetail ? "sidebar-project-detail" : ""}`}>
        <div className={`sidebar-header ${isProjectDetail ? "sidebar-header-project" : ""}`}>
          <div className="workspace-mark">S</div>
          <div>
            <p className="workspace-label">{isProjectDetail ? "Seyal" : "Workspace"}</p>
            <div className="workspace-title-row">
              <h1>Seyal</h1>
              {isProjectDetail && <span className="workspace-pill-warning">Overdue</span>}
            </div>
          </div>
        </div>

        <div className="sidebar-search">
          <div className="sidebar-search-text">
            <SearchIcon />
            <span>Find...</span>
          </div>
          <kbd>F</kbd>
        </div>

        {isLogsSidebar ? (
          <section className="logs-sidebar-panel">
            <div className="logs-sidebar-top">
              <button
                type="button"
                className="logs-sidebar-back-btn"
                aria-label="Back to sidebar menu"
                onClick={() => setLogsSidebarOpen(false)}
              >
                <ArrowLeftIcon />
              </button>
              <h3>Logs</h3>
            </div>

            <div className="logs-sidebar-filter-head">
              <h4>Filters</h4>
              <button
                type="button"
                className="logs-sidebar-reset-btn"
                onClick={() => {
                  const now = new Date();
                  const start = new Date(now.getTime() - 30 * 60 * 1000);
                  setLogSearch("");
                  setLogSeverityFilters({ warning: false, error: false, fatal: false });
                  setTimelineFilterMode("last-30-minutes");
                  setCustomStartDate(toDateInputValue(start));
                  setCustomStartTime(toTimeInputValue(start));
                  setCustomEndDate(toDateInputValue(now));
                  setCustomEndTime(toTimeInputValue(now));
                  setTimelinePresetMenuOpen(false);
                  setTimelineCalendarOpen(false);
                  setLogsRefreshTick((current) => current + 1);
                }}
              >
                Reset
              </button>
            </div>

            <div className="logs-sidebar-group">
              <button type="button" className="logs-sidebar-group-title">
                <DownChevronIcon />
                <span>Timeline</span>
              </button>

              <div className="logs-sidebar-timeline-wrap" ref={timelineFilterRef}>
                <button
                  type="button"
                  className="logs-sidebar-calendar-trigger"
                  aria-label="Open custom date and time filter"
                  onClick={() => {
                    const selectedStart = new Date(`${customStartDate}T00:00:00`);
                    if (!Number.isNaN(selectedStart.getTime())) {
                      setTimelineCalendarMonth(
                        new Date(selectedStart.getFullYear(), selectedStart.getMonth(), 1)
                      );
                    }
                    setTimelineCalendarOpen((current) => !current);
                    setTimelinePresetMenuOpen(false);
                  }}
                >
                  <CalendarIcon />
                </button>
                <button
                  type="button"
                  className="logs-sidebar-timeline-btn"
                  aria-haspopup="menu"
                  aria-expanded={timelinePresetMenuOpen}
                  onClick={() => {
                    setTimelinePresetMenuOpen((current) => !current);
                    setTimelineCalendarOpen(false);
                  }}
                >
                  <span className="logs-sidebar-timeline-btn-label">{timelineButtonLabel}</span>
                  <DownChevronIcon />
                </button>

                {timelinePresetMenuOpen && (
                  <div className="logs-sidebar-timeline-menu" role="menu">
                    {timelinePresetMenuItems.map((item, index) =>
                      item.kind === "label" ? (
                        <p key={`${item.label}-${index}`} className="logs-sidebar-timeline-menu-label">
                          {item.label}
                        </p>
                      ) : (
                        <button
                          key={item.id}
                          type="button"
                          role="menuitem"
                          className={`logs-sidebar-timeline-menu-item ${
                            timelineFilterMode === item.id ? "active" : ""
                          }`}
                          onClick={() => selectTimelinePreset(item.id)}
                        >
                          {item.label}
                        </button>
                      )
                    )}
                  </div>
                )}

                {timelineCalendarOpen && (
                  <div className="logs-sidebar-calendar-popover">
                    <div className="logs-sidebar-calendar-header">
                      <h5>{formatMonthLabel(timelineCalendarMonth)}</h5>
                      <div className="logs-sidebar-calendar-nav">
                        <button
                          type="button"
                          aria-label="Previous month"
                          onClick={() =>
                            setTimelineCalendarMonth(
                              (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1)
                            )
                          }
                        >
                          <ArrowLeftIcon />
                        </button>
                        <button
                          type="button"
                          aria-label="Next month"
                          onClick={() =>
                            setTimelineCalendarMonth(
                              (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1)
                            )
                          }
                        >
                          <RightChevronIcon />
                        </button>
                      </div>
                    </div>

                    <div className="logs-sidebar-calendar-weekdays">
                      {["S", "M", "T", "W", "T", "F", "S"].map((day) => (
                        <span key={day}>{day}</span>
                      ))}
                    </div>

                    <div className="logs-sidebar-calendar-grid">
                      {timelineCalendarDays.map((day, index) => {
                        if (!day) {
                          return <span key={`empty-day-${index}`} className="logs-sidebar-calendar-empty" aria-hidden />;
                        }
                        const dayInputValue = toDateInputValue(day);
                        const isSelected = dayInputValue === customStartDate;
                        return (
                          <button
                            key={`${dayInputValue}-${day.getDate()}`}
                            type="button"
                            className={`logs-sidebar-calendar-day ${isSelected ? "selected" : ""}`}
                            onClick={() => {
                              setCustomStartDate(dayInputValue);
                              setCustomEndDate(dayInputValue);
                            }}
                          >
                            {day.getDate()}
                          </button>
                        );
                      })}
                    </div>

                    <div className="logs-sidebar-calendar-fields">
                      <p className="logs-sidebar-calendar-label">Start</p>
                      <div className="logs-sidebar-calendar-field-row">
                        <input
                          type="date"
                          value={customStartDate}
                          onChange={(event) => setCustomStartDate(event.target.value)}
                        />
                        <input
                          type="time"
                          value={customStartTime}
                          onChange={(event) => setCustomStartTime(event.target.value)}
                        />
                      </div>
                      <p className="logs-sidebar-calendar-label">End</p>
                      <div className="logs-sidebar-calendar-field-row">
                        <input
                          type="date"
                          value={customEndDate}
                          onChange={(event) => setCustomEndDate(event.target.value)}
                        />
                        <input
                          type="time"
                          value={customEndTime}
                          onChange={(event) => setCustomEndTime(event.target.value)}
                        />
                      </div>
                      <button type="button" className="logs-sidebar-calendar-apply" onClick={applyCustomTimeline}>
                        Apply ↵
                      </button>
                      <p className="logs-sidebar-calendar-tz">
                        <span>{currentLocalTimeZoneLabel()}</span>
                        <DownChevronIcon />
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="logs-sidebar-group">
              <button type="button" className="logs-sidebar-group-title">
                <DownChevronIcon />
                <span>Contains Console Level</span>
              </button>

              <div className="logs-sidebar-level-list">
                {(["warning", "error", "fatal"] as LogSeverity[]).map((severity) => (
                  <button
                    key={severity}
                    type="button"
                    className="logs-sidebar-level-item"
                    onClick={() =>
                      setLogSeverityFilters((current) => ({
                        ...current,
                        [severity]: !current[severity],
                      }))
                    }
                  >
                    <span className={`logs-sidebar-check ${logSeverityFilters[severity] ? "active" : ""}`}>
                      {logSeverityFilters[severity] ? "✓" : ""}
                    </span>
                    <span className="logs-sidebar-level-label">
                      {severity === "warning" ? "Warning" : severity === "error" ? "Error" : "Fatal"}
                    </span>
                    <span className="logs-sidebar-level-count">{logSeverityCounts[severity]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="logs-sidebar-collapsed-list">
              {[
                "Resource",
                "Environment",
                "Route",
                "Request Path",
                "Status Code",
                "Request Type",
                "Host",
                "Request Method",
              ].map((label) => (
                <button key={label} type="button" className="logs-sidebar-collapsed-item">
                  <RightChevronIcon />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <nav className={`sidebar-nav ${isProjectDetail ? "sidebar-nav-project" : ""}`}>
            {(isProjectDetail ? projectDetailMenuGroups : menuGroups).map((group, groupIndex) => (
              <div key={`group-${groupIndex}`} className="menu-group">
                {groupIndex > 0 && <div className="menu-divider" />}
                {group.map((item) => (
                  <button
                    key={item.label}
                    className={`nav-item ${
                      isProjectDetail ? (activeProjectMenu === item.label ? "active" : "") : activeMenu === item.label ? "active" : ""
                    }`}
                    onClick={() => {
                      if (isProjectDetail) {
                        setActiveProjectMenu(item.label);
                        setLogsMenuOpen(false);
                        setLogsSidebarOpen(item.label === "Logs");
                        setTimelinePresetMenuOpen(false);
                        setTimelineCalendarOpen(false);
                        return;
                      }
                      setActiveMenu(item.label);
                      setAddMenuOpen(false);
                      setGitAccountMenuOpen(false);
                      setLogsMenuOpen(false);
                      setLogsSidebarOpen(item.label === "Logs");
                      setTimelinePresetMenuOpen(false);
                      setTimelineCalendarOpen(false);
                      if (item.label === "Projects") {
                        setProjectPanel("overview");
                        setSelectedProjectId(null);
                        setActiveProjectMenu("Overview");
                      }
                    }}
                  >
                    <div className="nav-main">
                      {item.badge ? (
                        <span className="nav-badge-icon">{item.badge}</span>
                      ) : (
                        <span className="nav-icon">
                          <MenuIcon name={item.icon} />
                        </span>
                      )}
                      <span>{item.label}</span>
                    </div>
                    {item.chevron && (
                      <span className="nav-chevron">
                        <ChevronIcon />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        )}
      </aside>

      <main className={`main ${isProjectDetail ? "main-project-detail" : ""}`}>
        {isProjectDetail && selectedProject ? (
          <header className="main-header project-main-header">
            <button type="button" className="project-switcher-btn" onClick={closeProjectDetail}>
              <span className="project-switcher-badge">{selectedProject.frameworkBadge}</span>
              <span className="project-switcher-name">{selectedProject.slug}</span>
              <DownChevronIcon />
            </button>
            <h2 className="project-main-title">{activeProjectMenu}</h2>
            <button className="button button-ghost project-main-more">...</button>
          </header>
        ) : (
          <header className="main-header">
            <div>
              <p className="page-tag">{pageTag}</p>
              <h2>{pageTitle}</h2>
            </div>
            <button className="button button-ghost">...</button>
          </header>
        )}

        {isDeploymentsView ? (
          <>
            <section className="deploy-controls">
              <button className="button button-ghost">Select Date Range</button>
              <div className="deploy-filters">
                <button className="button button-ghost">All Authors</button>
                <button className="button button-ghost">All Environments</button>
                <button className="button button-ghost">Status 5/6</button>
              </div>
            </section>

            <section className="deployments-table">
              {deploymentsLoading && <p className="muted">Loading deployments...</p>}
              {deploymentsError && <p className="error-text">{deploymentsError}</p>}
              {!deploymentsLoading && !deploymentsError && deployments.length === 0 && (
                <p className="muted">
                  No server deployments found yet. Run tracked deploy on live server:
                  <code> ./deploy-with-track.sh &lt;deploy-command&gt;</code>
                </p>
              )}

              {!deploymentsLoading &&
                !deploymentsError &&
                deployments.map((deployment, index) => {
                  const rowId = `${deployment.deploymentId}-${deployment.commitHash}`;
                  const trackedAt = deployment.trackedAt ?? deployment.commitAt;
                  const showTimeTooltip = hoveredDeploymentId === rowId && Boolean(trackedAt);
                  const projectTech = detectProjectTech(deployment.projectName);

                  return (
                    <article key={rowId} className="deploy-row">
                    <div className="deploy-col deploy-id-col">
                      <p className="deploy-id">{deployment.deploymentId}</p>
                      <p className="muted inline-item">
                        {deployment.environment}
                        {index === 0 && <span className="current-badge">Current</span>}
                      </p>
                    </div>

                    <div className="deploy-col deploy-status-col">
                      <p className="inline-item">
                        <DeployStateIcon />
                        {deployment.status}
                      </p>
                      <p className="muted">{deployment.duration}</p>
                    </div>

                    <div className="deploy-col deploy-project-col">
                      <p className="project-line">
                        <span className="project-avatar">{projectTech.badge}</span>
                        <span className="project-details">
                          <span className="deploy-project">{deployment.projectName}</span>
                          <span className="deploy-tech">{projectTech.name}</span>
                        </span>
                      </p>
                    </div>

                    <div className="deploy-col deploy-commit-col">
                      <p className="deploy-branch inline-item">
                        <BranchIcon />
                        {deployment.branch}
                      </p>
                      <p className="deploy-message inline-item">
                        <CommitIcon />
                        {deployment.commitHash} {deployment.commitMessage}
                      </p>
                    </div>

                    <div className="deploy-col deploy-time-col">
                      <div
                        className="time-cell"
                        onMouseEnter={() => {
                          if (!trackedAt) return;
                          setHoveredDeploymentId(rowId);
                          setNowMs(Date.now());
                        }}
                        onMouseLeave={() => {
                          setHoveredDeploymentId((current) => (current === rowId ? null : current));
                        }}
                      >
                        <button
                          type="button"
                          className="time-trigger"
                          onFocus={() => {
                            if (!trackedAt) return;
                            setHoveredDeploymentId(rowId);
                            setNowMs(Date.now());
                          }}
                          onBlur={() => {
                            setHoveredDeploymentId((current) => (current === rowId ? null : current));
                          }}
                        >
                          {deployment.createdRelative}
                        </button>
                        {showTimeTooltip && trackedAt && (
                          <div className="time-tooltip" role="tooltip">
                            <p className="time-tooltip-elapsed">{formatElapsedWithSeconds(trackedAt, nowMs)}</p>

                            <div className="time-tooltip-row">
                              <span className="time-tooltip-zone">UTC</span>
                              <span className="time-tooltip-date">{formatDateInZone(trackedAt, "UTC")}</span>
                              <span className="time-tooltip-clock">{formatTimeInZone(trackedAt, "UTC")}</span>
                            </div>

                            <div className="time-tooltip-row">
                              <span className="time-tooltip-zone">{formatLocalGmtOffset(trackedAt)}</span>
                              <span className="time-tooltip-date">{formatDateInZone(trackedAt)}</span>
                              <span className="time-tooltip-clock">{formatTimeInZone(trackedAt)}</span>
                            </div>
                          </div>
                        )}
                        <p className="muted time-right">by {deployment.author}</p>
                      </div>
                    </div>

                    <div className="deploy-col deploy-health-col">
                      <HealthIcon />
                    </div>
                  </article>
                  );
                })}
            </section>
          </>
        ) : isLogsView ? (
          <>
            <section className="logs-controls">
              <label className="logs-search-field" aria-label="Search logs">
                <SearchIcon />
                <input
                  type="text"
                  placeholder="Search logs..."
                  value={logSearch}
                  onChange={(event) => setLogSearch(event.target.value)}
                />
              </label>
              <div className="logs-toolbar-actions" ref={logsMenuRef}>
                <button
                  type="button"
                  className={`logs-action-btn logs-live-btn ${logsLiveEnabled ? "active" : ""}`}
                  aria-pressed={logsLiveEnabled}
                  onClick={toggleLogsLive}
                >
                  <LiveIcon active={logsLiveEnabled} />
                  <span>Live</span>
                </button>
                <button
                  type="button"
                  className={`logs-action-btn logs-icon-btn ${logsLoading ? "loading" : ""}`}
                  aria-label={logsLoading ? "Loading logs" : "Refresh logs"}
                  onClick={() => setLogsRefreshTick((current) => current + 1)}
                >
                  <RefreshIcon />
                </button>
                <button
                  type="button"
                  className="logs-action-btn logs-icon-btn"
                  aria-label="More logs actions"
                  aria-haspopup="menu"
                  aria-expanded={logsMenuOpen}
                  onClick={() => setLogsMenuOpen((current) => !current)}
                >
                  <KebabIcon />
                </button>
                {logsMenuOpen && (
                  <div className="logs-actions-menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      className="logs-menu-item"
                      onClick={() => setLogsMenuOpen(false)}
                    >
                      Add Drain
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="logs-menu-item"
                      onClick={() => {
                        exportLogsAsCsv();
                        setLogsMenuOpen(false);
                      }}
                    >
                      Export to CSV
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="logs-menu-item logs-menu-item-highlight"
                      onClick={() => {
                        exportLogsAsJson();
                        setLogsMenuOpen(false);
                      }}
                    >
                      Export to JSON
                    </button>
                  </div>
                )}
              </div>
            </section>

            <section className="logs-table">
              {logsError && <p className="error-text">{logsError}</p>}
              {!logsError && !logsLoading && filteredLogs.length === 0 && (
                <p className="muted logs-empty">
                  {logSearch.trim().length > 0
                    ? "No logs match your search."
                    : "No API request logs found for this view yet."}
                </p>
              )}

              {!logsError && filteredLogs.length > 0 && (
                <div className={`logs-workspace ${selectedLogEntry ? "has-detail" : ""}`}>
                  <div className="logs-list-pane">
                    <div className="log-header-row">
                      <span>Time</span>
                      <span>Status</span>
                      <span>Host</span>
                      <span>Request</span>
                      <span>Messages</span>
                    </div>

                    {filteredLogs.map((logEntry) => {
                      const isSelected = selectedLogId === logEntry.logId;
                      const statusCodeLabel = logEntry.statusCode === null ? "---" : String(logEntry.statusCode);
                      const statusTone = toLogStatusTone(logEntry.statusCode);
                      const message =
                        isProjectScopedLogs || !logEntry.projectName
                          ? logEntry.message
                          : `[${logEntry.projectName}] ${logEntry.message}`;
                      const methodLabel = (logEntry.method || "GET").toUpperCase();
                      const requestPath = logEntry.path || "/";
                      const host = logEntry.host || "-";

                      return (
                        <article
                          key={logEntry.logId}
                          className={`log-row ${isSelected ? "selected" : ""}`}
                          role="button"
                          tabIndex={0}
                          aria-pressed={isSelected}
                          onClick={() => setSelectedLogId(logEntry.logId)}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            setSelectedLogId(logEntry.logId);
                          }}
                        >
                          <p className="log-time">{formatLogTimestamp(logEntry.timestamp)}</p>
                          <p className="log-status">
                            <span className={`log-status-pill ${statusTone}`}>{statusCodeLabel}</span>
                          </p>
                          <p className="log-host" title={host}>
                            {host}
                          </p>
                          <p className="log-request" title={requestPath}>
                            <span className="log-method">{methodLabel}</span>
                            <span>{requestPath}</span>
                          </p>
                          <p className="log-message" title={message}>
                            {message}
                          </p>
                        </article>
                      );
                    })}
                  </div>

                  {selectedLogEntry && (
                    <aside className="log-detail-pane">
                      <div className="log-detail-head">
                        <p className="log-detail-title">
                          <span className="log-detail-method">{selectedLogEntry.method.toUpperCase()}</span>
                          <span className="log-detail-path" title={selectedLogPathDetails.pathname}>
                            {selectedLogPathDetails.pathname}
                          </span>
                        </p>
                        <div className="log-detail-head-actions">
                          <span className={`log-status-pill ${toLogStatusTone(selectedLogEntry.statusCode)}`}>
                            {selectedLogEntry.statusCode === null ? "---" : String(selectedLogEntry.statusCode)}
                          </span>
                          <button
                            type="button"
                            className="log-detail-close"
                            aria-label="Close log details"
                            onClick={() => setSelectedLogId(null)}
                          >
                            <CloseIcon />
                          </button>
                        </div>
                      </div>

                      <p className="log-detail-subtitle">
                        Request started {formatLogDetailTimestamp(selectedLogEntry.timestamp)}
                      </p>

                      <section className="log-detail-card">
                        <div className="log-detail-row">
                          <span>Request ID</span>
                          <code title={selectedLogEntry.logId}>{selectedLogEntry.logId}</code>
                        </div>
                        <div className="log-detail-row">
                          <span>Path</span>
                          <code title={selectedLogEntry.path}>{selectedLogEntry.path || "/"}</code>
                        </div>
                        <div className="log-detail-row">
                          <span>Host</span>
                          <code title={selectedLogEntry.host}>{selectedLogEntry.host || "-"}</code>
                        </div>
                        <div className="log-detail-row">
                          <span>Project</span>
                          <code>{selectedLogEntry.projectName}</code>
                        </div>
                        <div className="log-detail-row">
                          <span>Remote IP</span>
                          <code>{selectedLogEntry.remoteAddr || "-"}</code>
                        </div>
                      </section>

                      {selectedLogPathDetails.searchParams.length > 0 && (
                        <section className="log-detail-card">
                          <p className="log-detail-card-title">Search Params</p>
                          <div className="log-detail-params">
                            {selectedLogPathDetails.searchParams.map(([key, value], index) => (
                              <div key={`${key}-${index}`} className="log-detail-row">
                                <span>{key}</span>
                                <code title={value}>{value || "(empty)"}</code>
                              </div>
                            ))}
                          </div>
                        </section>
                      )}

                      <section className="log-detail-card">
                        <p className="log-detail-card-title">Message</p>
                        <pre className="log-detail-message">{selectedLogEntry.message}</pre>
                      </section>
                    </aside>
                  )}
                </div>
              )}
            </section>
          </>
        ) : projectPanel === "new-project-connect" ? (
          <section className="new-project-page project-connect-page">
            <h4 className="connected-git-title">Import Git Repository</h4>
            <div className="project-connect-card">
              <p className="project-connect-copy">
                Select a Git provider to import an existing project from a Git Repository.
              </p>

              <div className="project-provider-actions">
                <button
                  type="button"
                  className="provider-btn provider-github"
                  onClick={() => redirectToProviderSignIn("github")}
                >
                  <GitHubIcon />
                  <span>Continue with GitHub</span>
                </button>
                <button
                  type="button"
                  className="provider-btn provider-gitlab"
                  onClick={() => redirectToProviderSignIn("gitlab")}
                >
                  <GitLabIcon />
                  <span>Continue with GitLab</span>
                </button>
                <button
                  type="button"
                  className="provider-btn provider-bitbucket"
                  onClick={() => redirectToProviderSignIn("bitbucket")}
                >
                  <BitbucketIcon />
                  <span>Continue with Bitbucket</span>
                </button>
              </div>

              {projectConnectError && <p className="project-connect-error">{projectConnectError}</p>}

              <button type="button" className="manage-logins-btn" onClick={redirectToManageLogins}>
                <span>Manage Login Connections</span>
                <ExternalIcon />
              </button>
            </div>
          </section>
        ) : projectPanel === "new-project-import" ? (
          <section className="new-project-page connected-git-page">
            <div className="new-project-grid">
              <section className="new-project-col import-col">
                <h4 className="connected-git-title">Import Git Repository</h4>
                <div className="import-controls">
                  <div className="git-account-wrap" ref={gitAccountMenuRef}>
                    <button
                      className="git-account-trigger"
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={gitAccountMenuOpen}
                      disabled={connectedGitAccounts.length === 0}
                      onClick={() => {
                        if (connectedGitAccounts.length === 0) return;
                        setGitAccountMenuOpen((value) => !value);
                      }}
                    >
                      <span className="git-account-label">
                        <ProviderIconMark provider={selectedGitAccount?.provider ?? "github"} />
                        <span>{selectedGitAccount?.name ?? "No Git account connected"}</span>
                      </span>
                      <DownChevronIcon />
                    </button>

                    {gitAccountMenuOpen && connectedGitAccounts.length > 0 && (
                      <div className="git-account-menu" role="menu">
                        {connectedGitAccounts.map((account) => {
                          const selected = account.id === selectedGitAccountId;
                          return (
                            <button
                              key={account.id}
                              className={`git-account-item ${selected ? "active" : ""}`}
                              role="menuitem"
                              onClick={() => {
                                setSelectedGitAccountId(account.id);
                                setGitAccountMenuOpen(false);
                                setRepoSearch("");
                                setPendingImportRepoId(null);
                              }}
                            >
                              <span className="git-account-item-main">
                                <ProviderIconMark provider={account.provider} />
                                <span>{account.name}</span>
                              </span>
                              {selected && <CheckIcon />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className={`import-repo-search ${selectedGitAccount ? "" : "disabled"}`}>
                    <SearchIcon />
                    <input
                      type="text"
                      placeholder={selectedGitAccount ? "Search..." : "Connect Git account first"}
                      aria-label="Search repository"
                      value={repoSearch}
                      onChange={(event) => setRepoSearch(event.target.value)}
                      disabled={!selectedGitAccount}
                    />
                    {selectedGitAccount && repoSearch && (
                      <button className="import-search-clear" type="button" onClick={() => setRepoSearch("")}>
                        Esc
                      </button>
                    )}
                  </div>
                </div>

                {pendingImportRepo && (
                  <div className="import-approval-banner" role="status">
                    <p>
                      Approve import for <strong>{pendingImportRepo.name}</strong>?
                    </p>
                    <div className="import-approval-actions">
                      <button
                        type="button"
                        className="import-approve-btn"
                        onClick={() => {
                          setApprovedImports((current) =>
                            current.includes(pendingImportRepo.id) ? current : [...current, pendingImportRepo.id]
                          );
                          setPendingImportRepoId(null);
                        }}
                      >
                        Approve
                      </button>
                      <button type="button" className="import-cancel-btn" onClick={() => setPendingImportRepoId(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div className="import-repo-list">
                  {importLoading && <p className="muted import-empty">Loading repositories...</p>}
                  {!importLoading && importError && <p className="error-text import-empty">{importError}</p>}

                  {!importLoading &&
                    !importError &&
                    importRepositories.map((repo) => {
                      const badge = repo.name.slice(0, 1).toUpperCase();
                      const visibilityPrefix = repo.visibility === "private" ? "Private" : "Public";
                      return (
                        <article key={repo.id} className="import-repo-row">
                          <p className="import-repo-meta">
                            <span className="import-repo-badge">{badge}</span>
                            <span className="import-repo-name">{displayRepositoryName(repo.name)}</span>
                            <span className="import-repo-updated">
                              {formatRepoUpdatedLabel(repo.updatedAt)}
                              <span className="import-repo-divider">·</span>
                              {visibilityPrefix}
                            </span>
                          </p>
                          <button
                            className="import-repo-action"
                            type="button"
                            disabled={approvedImports.includes(repo.id)}
                            onClick={() => setPendingImportRepoId(repo.id)}
                          >
                            {approvedImports.includes(repo.id) ? "Imported" : "Import"}
                          </button>
                        </article>
                      );
                    })}

                  {!importLoading && !importError && importRepositories.length === 0 && (
                    <p className="muted import-empty">
                      {!selectedGitAccount
                        ? "No connected Git account. Connect GitHub to load repositories."
                        : repoSearch
                          ? "No repositories match this search."
                          : "No repositories found for this account."}
                    </p>
                  )}
                </div>
              </section>

              <section className="new-project-col templates-col">
                <div className="templates-head">
                  <h4>Clone Template</h4>
                  <div className="templates-head-actions">
                    <button type="button" className="template-filter-btn">
                      <span>Filter</span>
                      <DownChevronIcon />
                    </button>
                    <button type="button" className="template-link-btn">
                      <span>Browse All</span>
                      <ExternalIcon />
                    </button>
                  </div>
                </div>

                <div className="template-grid">
                  {templateCards.map((card) => (
                    <article key={card.id} className="template-card">
                      <h5>{card.title}</h5>
                      <p>{card.description}</p>
                      <div className="template-preview" />
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </section>
        ) : isProjectDetail && selectedProject ? (
          <>
            <section className="project-detail-card">
              <header className="project-detail-card-header">
                <h3>Production Deployment</h3>
                <div className="project-detail-actions">
                  <button type="button" className="button button-ghost">
                    Build Logs
                  </button>
                  <button type="button" className="button button-ghost">
                    Runtime Logs
                  </button>
                  <button type="button" className="button button-ghost rollback-btn">
                    <RollbackIcon />
                    <span>Instant Rollback</span>
                  </button>
                  <button type="button" className="project-visit-btn">
                    <span>Visit</span>
                    <DownChevronIcon />
                  </button>
                </div>
              </header>

              <div className="project-detail-card-body">
                <article className="project-preview-frame">
                  <div className="preview-topbar">
                    <span className="preview-dot" />
                    <span className="preview-dot" />
                    <span className="preview-dot" />
                  </div>
                  <img
                    src={
                      previewFallback
                        ? selectedProject.previewImage
                        : `${API_BASE}/v1/deployments/latest/screenshot?project=${encodeURIComponent(selectedProject.id)}`
                    }
                    alt={`${selectedProject.name} preview`}
                    className="preview-image"
                    onError={() => setPreviewFallback(true)}
                  />
                </article>

                <div className="project-deployment-meta">
                  <div className="meta-block">
                    <p className="meta-label">Deployment</p>
                    <p className="meta-value">{selectedProject.deploymentUrl}</p>
                  </div>
                  <div className="meta-block">
                    <p className="meta-label">Domains</p>
                    <p className="meta-value domain-value">
                      <a href={`https://${selectedProject.primaryDomain}`} target="_blank" rel="noreferrer">
                        {selectedProject.primaryDomain}
                      </a>
                      {selectedProject.additionalDomains.map((domain) => (
                        <span key={domain}>
                          <span className="meta-domain-separator">·</span>
                          <a href={`https://${domain}`} target="_blank" rel="noreferrer">
                            {domain}
                          </a>
                        </span>
                      ))}
                    </p>
                  </div>
                  <div className="meta-split">
                    <div className="meta-block">
                      <p className="meta-label">Status</p>
                      <p className="meta-value inline-status">
                        <span className="status-led" />
                        {selectedProject.deploymentStatus}
                      </p>
                    </div>
                    <div className="meta-block">
                      <p className="meta-label">Created</p>
                      <p className="meta-value">
                        {selectedProject.deploymentAge} by {selectedProject.author}
                      </p>
                    </div>
                  </div>
                  <div className="meta-block">
                    <p className="meta-label">Source</p>
                    <p className="meta-value source-line">
                      <span>{selectedProject.branch}</span>
                      <span>{selectedProject.commitHash}</span>
                      <span>{selectedProject.commitMessage}</span>
                    </p>
                  </div>
                </div>
              </div>

              <button type="button" className="deployment-settings-row">
                <span>Deployment Settings</span>
                <span className="recommend-pill">2 Recommendations</span>
              </button>
              <p className="deployment-note">
                To update your Production Deployment, push to the <strong>{selectedProject.branch}</strong> branch.
              </p>
              <div className="project-detail-footer-tools">
                <button type="button" className="button button-ghost">
                  Deployments
                </button>
                <button type="button" className="button button-ghost icon-only-btn" aria-label="Toggle deployment view">
                  <GridViewIcon />
                </button>
              </div>
            </section>

            <section className="project-overview-grid">
              <article className="overview-card">
                <header className="overview-card-head">
                  <h4>
                    Firewall <span>24h</span>
                  </h4>
                </header>
                <p className="overview-link">Active · All systems normal</p>
                <div className="overview-empty">No recent events</div>
              </article>

              <article className="overview-card">
                <header className="overview-card-head">
                  <h4>
                    Observability <span>6h</span>
                  </h4>
                </header>
                <dl className="overview-stats">
                  <div>
                    <dt>Edge Requests</dt>
                    <dd>0</dd>
                  </div>
                  <div>
                    <dt>Function Invocations</dt>
                    <dd>0</dd>
                  </div>
                  <div>
                    <dt>Error Rate</dt>
                    <dd>0%</dd>
                  </div>
                </dl>
              </article>

              <article className="overview-card">
                <header className="overview-card-head">
                  <h4>Analytics</h4>
                </header>
                <p className="overview-muted">Track visitors and page views</p>
                <button type="button" className="overview-enable-btn">
                  Enable
                </button>
              </article>
            </section>

            <section className="section">
              <div className="section-head">
                <h3>Active Branches</h3>
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="notice">
              <p>Dashboard ready for live deploy tracking and realtime project updates.</p>
            </section>

            <section className="project-handle-header">
              <label className="project-search-field" aria-label="Search projects">
                <SearchIcon />
                <input type="text" placeholder="Search Projects..." />
              </label>
              <button className="project-icon-btn" aria-label="Filter projects">
                <FilterBarsIcon />
              </button>
              <div className="project-view-toggle" role="group" aria-label="Project view">
                <button
                  className={`project-icon-btn ${projectView === "grid" ? "active" : ""}`}
                  aria-label="Grid view"
                  aria-pressed={projectView === "grid"}
                  onClick={() => setProjectView("grid")}
                >
                  <GridViewIcon />
                </button>
                <button
                  className={`project-icon-btn ${projectView === "list" ? "active" : ""}`}
                  aria-label="List view"
                  aria-pressed={projectView === "list"}
                  onClick={() => setProjectView("list")}
                >
                  <ListViewIcon />
                </button>
              </div>
              <div className="project-add-wrap" ref={addMenuRef}>
                <button
                  className="project-add-btn"
                  aria-label="Add new project"
                  aria-haspopup="menu"
                  aria-expanded={addMenuOpen}
                  onClick={() => setAddMenuOpen((value) => !value)}
                >
                  <span>Add New...</span>
                  <DownChevronIcon />
                </button>
                {addMenuOpen && (
                  <div className="project-add-menu" role="menu">
                    <button
                      role="menuitem"
                      className="project-add-item"
                      onClick={() => {
                        setProjectPanel(connectedGitAccounts.length > 0 ? "new-project-import" : "new-project-connect");
                        setRepoSearch("");
                        setPendingImportRepoId(null);
                        setAddMenuOpen(false);
                      }}
                    >
                      Project
                    </button>
                    <button role="menuitem" className="project-add-item" onClick={() => setAddMenuOpen(false)}>
                      Domain
                    </button>
                    <button role="menuitem" className="project-add-item" onClick={() => setAddMenuOpen(false)}>
                      Store
                    </button>
                    <button role="menuitem" className="project-add-item" onClick={() => setAddMenuOpen(false)}>
                      Integration
                    </button>
                    <button role="menuitem" className="project-add-item" onClick={() => setAddMenuOpen(false)}>
                      Team Member
                    </button>
                  </div>
                )}
              </div>
            </section>

            <section className="section">
              <div className="section-head">
                <h3>Projects</h3>
              </div>

              <div className={`project-list project-list-${projectView}`}>
                {projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    className={`project-card project-card-button ${projectView === "list" ? "project-card-list" : ""}`}
                    onClick={() => openProjectDetail(project.id)}
                  >
                    <div className="project-top">
                      <div className="project-logo">{project.shortCode}</div>
                      <div>
                        <h4>{project.name}</h4>
                        <p className="muted">{project.primaryDomain}</p>
                      </div>
                      <span className={`status ${project.statusTone === "warning" ? "status-warning" : ""}`}>
                        {project.status}
                      </span>
                    </div>

                    <p className="repo-pill">{project.repository}</p>
                    <p className="commit">{project.commitMessage}</p>
                    <p className="meta">
                      Updated {project.updatedAt} on <strong>{project.branch}</strong>
                    </p>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
