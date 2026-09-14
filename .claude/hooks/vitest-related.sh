#!/usr/bin/env bash
# PostToolUse hook — runs only the Vitest tests related to the edited file.
#
# Scoped to src/lib/services/, the hot spot behind Risk #1 in
# context/foundation/test-plan.md §2 (the only High x High risk: a malformed,
# truncated or refused LLM payload killing the whole Analyze run). Every module
# named in that risk's response guidance lives here — justify.ts,
# justification-merge.ts, scoring.ts, video-selection.ts, youtube.ts.
#
# Exits 2 on red so the failure is fed back to the model rather than buried in
# the transcript. Everything else exits 0 and stays silent.
#
# Parsing is done with node, not jq: jq is not installed on this machine, and a
# missing jq fails open — an empty file path, a no-op run, a green hook that
# never tested anything.

set -uo pipefail

parsed=$(node -e '
  let s = "";
  process.stdin.on("data", (d) => (s += d)).on("end", () => {
    let j = {};
    try { j = JSON.parse(s); } catch {}
    const f = j.tool_input?.file_path ?? j.tool_response?.filePath ?? "";
    process.stdout.write(f + "\n" + (j.cwd ?? "") + "\n");
  });
') || exit 0

file=$(printf '%s' "$parsed" | sed -n 1p)
root=$(printf '%s' "$parsed" | sed -n 2p)
root=${root:-${CLAUDE_PROJECT_DIR:-$PWD}}

[ -n "$file" ] || exit 0

# The gate. Anything outside the Risk #1 hot spot is not this hook's business:
# the full suite is a CI gate, not a per-edit one.
case "$file" in
  */src/lib/services/*.ts) ;;
  *) exit 0 ;;
esac

cd "$root" 2>/dev/null || exit 0

out=$(npx vitest related "$file" --run 2>&1)
status=$?

[ "$status" -eq 0 ] && exit 0

printf '%s\n' "$out" >&2
printf '\nRelated tests are red for %s (test-plan.md §2, Risk #1 hot spot).\n' "${file##*/}" >&2
exit 2
