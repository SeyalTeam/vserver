#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="kani-taxi"
ENVIRONMENT="Production"
STATUS="Ready"
DURATION=""
DEPLOYMENT_ID=""
REPO_PATH="$(pwd)"
LOG_PATH="/var/log/runcloud-clone/deployments.jsonl"
TRACKED_AT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)
      PROJECT_NAME="$2"
      shift 2
      ;;
    --environment)
      ENVIRONMENT="$2"
      shift 2
      ;;
    --status)
      STATUS="$2"
      shift 2
      ;;
    --duration)
      DURATION="$2"
      shift 2
      ;;
    --deployment-id)
      DEPLOYMENT_ID="$2"
      shift 2
      ;;
    --repo-path)
      REPO_PATH="$2"
      shift 2
      ;;
    --log-path)
      LOG_PATH="$2"
      shift 2
      ;;
    --tracked-at)
      TRACKED_AT="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if ! command -v git >/dev/null 2>&1; then
  echo "git is required" >&2
  exit 1
fi

if ! git -C "$REPO_PATH" rev-parse --git-dir >/dev/null 2>&1; then
  echo "Invalid git repository: $REPO_PATH" >&2
  exit 1
fi

ensure_writable_log() {
  local target="$1"
  mkdir -p "$(dirname "$target")" 2>/dev/null || return 1
  touch "$target" 2>/dev/null || return 1
  return 0
}

if ! ensure_writable_log "$LOG_PATH"; then
  LOG_PATH="$HOME/.runcloud-clone/deployments.jsonl"
  if ! ensure_writable_log "$LOG_PATH"; then
    echo "Cannot write tracker log file" >&2
    exit 1
  fi
fi

json_escape() {
  local s="$1"
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  s=${s//$'\r'/\\r}
  s=${s//$'\t'/\\t}
  printf '%s' "$s"
}

COMMIT_HASH="$(git -C "$REPO_PATH" rev-parse --short HEAD)"
BRANCH="$(git -C "$REPO_PATH" rev-parse --abbrev-ref HEAD)"
COMMIT_MESSAGE="$(git -C "$REPO_PATH" log -1 --pretty=%s)"
AUTHOR="$(git -C "$REPO_PATH" log -1 --pretty=%an)"
AUTHOR_EMAIL="$(git -C "$REPO_PATH" log -1 --pretty=%ae)"
COMMIT_AT="$(git -C "$REPO_PATH" log -1 --pretty=%cI)"

if [[ -z "$DEPLOYMENT_ID" ]]; then
  DEPLOYMENT_ID="$(date +%s)-${COMMIT_HASH}"
fi

if [[ -z "$DURATION" ]]; then
  DURATION="n/a"
fi

SERVER_HOST="$(hostname -f 2>/dev/null || hostname)"
SERVER_USER="${USER:-unknown}"
if [[ -z "$TRACKED_AT" ]]; then
  TRACKED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
fi

JSON_LINE="{\"trackedAt\":\"$(json_escape "$TRACKED_AT")\",\"deploymentId\":\"$(json_escape "$DEPLOYMENT_ID")\",\"projectName\":\"$(json_escape "$PROJECT_NAME")\",\"environment\":\"$(json_escape "$ENVIRONMENT")\",\"status\":\"$(json_escape "$STATUS")\",\"duration\":\"$(json_escape "$DURATION")\",\"branch\":\"$(json_escape "$BRANCH")\",\"commitHash\":\"$(json_escape "$COMMIT_HASH")\",\"commitMessage\":\"$(json_escape "$COMMIT_MESSAGE")\",\"author\":\"$(json_escape "$AUTHOR")\",\"authorEmail\":\"$(json_escape "$AUTHOR_EMAIL")\",\"commitAt\":\"$(json_escape "$COMMIT_AT")\",\"serverHost\":\"$(json_escape "$SERVER_HOST")\",\"serverUser\":\"$(json_escape "$SERVER_USER")\",\"repoPath\":\"$(json_escape "$REPO_PATH")\",\"source\":\"server-tracker\"}"

echo "$JSON_LINE" >> "$LOG_PATH"

echo "Tracked deployment ${DEPLOYMENT_ID} -> ${LOG_PATH}"
