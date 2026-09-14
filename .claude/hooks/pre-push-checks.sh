#!/usr/bin/env bash
# Pre-push gate. Mirrors the `ci` job order in .github/workflows/ci.yml:
# format:check (cheapest) -> astro sync -> lint -> typecheck -> build.
# `astro sync` must precede typecheck; `astro check` reads the types it generates.
# Wired as a PreToolUse hook on `git push` in .claude/settings.json.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0

fail() {
  printf 'Pre-push gate failed at `%s`. Fix this before pushing:\n\n%s\n' \
    "$1" "$(tail -n 40 <<<"$2")" >&2
  exit 2
}

if ! out=$(npm run format:check 2>&1); then
  fail "npm run format:check" "$out"
fi

if ! out=$(npx astro sync 2>&1); then
  fail "npx astro sync" "$out"
fi

for step in lint typecheck build; do
  if ! out=$(npm run "$step" 2>&1); then
    fail "npm run $step" "$out"
  fi
done

echo '{"suppressOutput": true}'
