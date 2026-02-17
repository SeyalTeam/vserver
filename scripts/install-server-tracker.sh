#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <user@host> <remote_repo_path> [project_name]" >&2
  exit 1
fi

REMOTE="$1"
REMOTE_REPO_PATH="$2"
PROJECT_NAME="${3:-kani-taxi}"

LOCAL_TRACKER_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/deploy-tracker.sh"
REMOTE_BIN_DIR="~/.runcloud-clone/bin"
REMOTE_TRACKER_SCRIPT="${REMOTE_BIN_DIR}/deploy-tracker.sh"
REMOTE_WRAPPER_SCRIPT="${REMOTE_REPO_PATH}/deploy-with-track.sh"
REMOTE_LOG_PATH="/root/.runcloud-clone/deployments.jsonl"

if ! command -v ssh >/dev/null 2>&1; then
  echo "ssh is required" >&2
  exit 1
fi

if ! command -v scp >/dev/null 2>&1; then
  echo "scp is required" >&2
  exit 1
fi

echo "Installing tracker on ${REMOTE}..."
ssh "$REMOTE" "mkdir -p ${REMOTE_BIN_DIR} ~/.runcloud-clone"
scp "$LOCAL_TRACKER_SCRIPT" "${REMOTE}:${REMOTE_TRACKER_SCRIPT}" >/dev/null
ssh "$REMOTE" "chmod +x ${REMOTE_TRACKER_SCRIPT}"

ssh "$REMOTE" "cat > \"${REMOTE_WRAPPER_SCRIPT}\" <<'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail

if [[ \$# -eq 0 ]]; then
  echo \"Usage: ./deploy-with-track.sh <deploy-command...>\" >&2
  exit 1
fi

START_TS=\"\$(date +%s)\"
DEPLOYMENT_ID=\"\${START_TS}-\${RANDOM}\"

# Record a "starting" entry immediately so the dashboard can show deploy in progress.
~/.runcloud-clone/bin/deploy-tracker.sh \\
  --project \"${PROJECT_NAME}\" \\
  --environment \"Production\" \\
  --status \"Pulling\" \\
  --duration \"n/a\" \\
  --deployment-id \"\${DEPLOYMENT_ID}\" \\
  --repo-path \"${REMOTE_REPO_PATH}\" \\
  --log-path \"${REMOTE_LOG_PATH}\" >/dev/null 2>&1 || true

STATUS=\"Ready\"

if ! \"\$@\"; then
  STATUS=\"Failed\"
fi

END_TS=\"\$(date +%s)\"
DURATION_SEC=\$((END_TS - START_TS))
DURATION=\"\${DURATION_SEC}s\"

~/.runcloud-clone/bin/deploy-tracker.sh \\
  --project \"${PROJECT_NAME}\" \\
  --environment \"Production\" \\
  --status \"\${STATUS}\" \\
  --duration \"\${DURATION}\" \\
  --deployment-id \"\${DEPLOYMENT_ID}\" \\
  --repo-path \"${REMOTE_REPO_PATH}\" \\
  --log-path \"${REMOTE_LOG_PATH}\" >/dev/null 2>&1 || true

if [[ \"\${STATUS}\" == \"Failed\" ]]; then
  exit 1
fi
WRAPPER"

ssh "$REMOTE" "chmod +x \"${REMOTE_WRAPPER_SCRIPT}\""

echo "Tracker installed."
echo "Remote tracker script: ${REMOTE_TRACKER_SCRIPT}"
echo "Tracked deploy wrapper: ${REMOTE_WRAPPER_SCRIPT}"
echo "Log file: ${REMOTE_LOG_PATH}"
echo
echo "Example usage on server:"
echo "  cd ${REMOTE_REPO_PATH}"
echo "  ./deploy-with-track.sh <your-deploy-command>"
