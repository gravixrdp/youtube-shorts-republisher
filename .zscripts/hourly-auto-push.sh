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
git reset -q .zscripts/hourly-auto-push.log >/dev/null 2>&1 || true

if git diff --cached --quiet; then
  # No new changes to publish, but keep local main synced.
  if ! git pull --rebase --autostash origin main >/dev/null 2>&1; then
    exit 1
  fi
  exit 0
fi

git commit -m "chore: hourly auto-push $(date -u +'%Y-%m-%d %H:%M UTC')"

if ! git pull --rebase --autostash origin main >/dev/null 2>&1; then
  exit 1
fi

git push origin main
