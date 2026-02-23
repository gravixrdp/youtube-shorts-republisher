#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOCK_FILE="/tmp/youtube-shorts-republisher.lock"

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  exit 0
fi

while true; do
  cd "${REPO_DIR}"

  if [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then
    echo "Not on main branch, skipping"
  else
    git add -A

    if ! git diff --cached --quiet; then
      git commit -m "chore: auto-push $(date -u +'%Y-%m-%d %H:%M UTC')"
      git push origin main
    fi
  fi

  # wait 10 minutes
  sleep 600
done
