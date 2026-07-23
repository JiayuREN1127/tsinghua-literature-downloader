#!/usr/bin/env bash
# Sync tsinghua-literature-downloader skill to all AI tool directories.
# Run from the repo root after committing changes.
#
# Usage:
#   ./sync.sh          # dry-run preview
#   ./sync.sh --apply  # actually copy files

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
V2_SRC="$REPO_ROOT/SKILL"
V1_SRC="$REPO_ROOT/SKILL-v1"

APPLY=false
[[ "${1:-}" == "--apply" ]] && APPLY=true

# --- targets ---
# v2.0: full copy to all tool skill directories
V2_TARGETS=(
  "$HOME/.claude/skills/tsinghua-literature-downloader"
  "$HOME/.agents/skills/tsinghua-literature-downloader"
  "$HOME/.config/opencode/skills/tsinghua-literature-downloader"
  "$HOME/.codex/skills/tsinghua-literature-downloader"
)

# v1.0: copy to claude -v1 path
V1_TARGETS=(
  "$HOME/.claude/skills/tsinghua-literature-downloader-v1"
)

# Files/dirs to exclude from sync
EXCLUDES=(
  "downloads"
  "download-log.tsv"
  ".DS_Store"
)

sync_dir() {
  local src="$1" dst="$2" label="$3"

  local rsync_args=(-a --delete --stats)
  for ex in "${EXCLUDES[@]}"; do
    rsync_args+=(--exclude="$ex")
  done

  if $APPLY; then
    mkdir -p "$dst"
    rsync "${rsync_args[@]}" "$src/" "$dst/"
    echo "✅  $label → $dst"
  else
    echo "📋  $label → $dst"
    rsync "${rsync_args[@]}" --dry-run "$src/" "$dst/" 2>&1 | tail -5
    echo ""
  fi
}

echo "=========================================="
echo " tsinghua-literature-downloader sync"
echo " source (v2.0): $V2_SRC"
echo " source (v1.0): $V1_SRC"
echo " mode: $( $APPLY && echo 'APPLY' || echo 'DRY RUN (pass --apply to apply)' )"
echo "=========================================="
echo ""

echo "--- v2.0 ---"
for t in "${V2_TARGETS[@]}"; do
  sync_dir "$V2_SRC" "$t" "$(basename "$(dirname "$t")")/$(basename "$t")"
done

echo ""
echo "--- v1.0 ---"
for t in "${V1_TARGETS[@]}"; do
  if [[ -d "$V1_SRC" ]]; then
    sync_dir "$V1_SRC" "$t" "$(basename "$(dirname "$t")")/$(basename "$t")"
  else
    echo "⚠️  v1.0 source not found: $V1_SRC"
  fi
done

echo ""
if ! $APPLY; then
  echo "This was a dry run. To apply: ./sync.sh --apply"
fi
