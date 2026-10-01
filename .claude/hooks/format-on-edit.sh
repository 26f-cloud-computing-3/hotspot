#!/usr/bin/env bash
# PostToolUse(Edit|Write): 수정된 파일을 프로젝트 포매터로 정리한다. 실패해도 작업은 막지 않는다.
f=$(jq -r '.tool_input.file_path // empty')
[ -z "$f" ] || [ ! -f "$f" ] && exit 0

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"

case "$f" in
  "$root"/backend/*.py)
    (cd "$root/backend" && uv run ruff check --fix --quiet "$f" && uv run ruff format --quiet "$f") >/dev/null 2>&1
    ;;
  "$root"/frontend/src/*.ts|"$root"/frontend/src/*.tsx|"$root"/frontend/src/*.css|"$root"/frontend/*.json)
    (cd "$root/frontend" && pnpm exec biome check --write --no-errors-on-unmatched "$f") >/dev/null 2>&1
    ;;
esac
exit 0
