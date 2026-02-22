#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOCK_FILE="/tmp/youtube-shorts-republisher-hourly-push.lock"

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  exit 0
fi

cd "${REPO_DIR}"

if [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then
  exit 0
fi

git add -A

if git diff --cached --quiet; then
  exit 0
fi

git commit -m "chore: hourly auto-push $(date -u +'%Y-%m-%d %H:%M UTC')"
git push origin main
