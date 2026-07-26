#!/usr/bin/env bash
# [Unix-only] 此脚本为 bash 脚本，仅适用于 macOS / Linux。
# Windows 用户请用 Git Bash / WSL 运行，或手动复制对应 SKILL-vX/ 目录到各目标位置。
#
# Sync tsinghua-literature-downloader skill to all AI tool directories.
# Run from the repo root after committing changes.
#
# Directory layout (three versions, clearly isolated):
#   SKILL-v1/  → 统一版（unified, per-paper）           — legacy, default install target
#   SKILL-v2/  → 分组版（grouped, per-publisher batch）  — legacy
#   SKILL-v3/  → token-disciplined（probe library）      — CANONICAL, under live validation
#
# Current install mapping (non-destructive until you cut over):
#   SKILL-v1 → default path (tsinghua-literature-downloader)        ← still the active skill
#   SKILL-v2 → -grouped suffix
#   SKILL-v3 → -v3 suffix                                            ← available, not yet active
#
# To make v3 the active skill: in V3_TARGETS below, drop the "-v3" suffix so v3
# installs to the default path, AND move v1 onto a "-v1-legacy" suffix (or just
# stop syncing V1_TARGETS). Do this only after v3 passes the canary live-tests.
#
# Usage:
#   ./sync.sh          # dry-run preview
#   ./sync.sh --apply  # actually copy files

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
V1_SRC="$REPO_ROOT/SKILL-v1"
V2_SRC="$REPO_ROOT/SKILL-v2"
V3_SRC="$REPO_ROOT/SKILL-v3"

APPLY=false
[[ "${1:-}" == "--apply" ]] && APPLY=true

# --- targets ---
# 统一版（SKILL-v1）：当前默认安装路径（仍是触发时的 active skill）
V1_TARGETS=(
  "$HOME/.claude/skills/tsinghua-literature-downloader"
  "$HOME/.agents/skills/tsinghua-literature-downloader"
  "$HOME/.config/opencode/skills/tsinghua-literature-downloader"
  "$HOME/.codex/skills/tsinghua-literature-downloader"
)

# 分组版（SKILL-v2）：-grouped 后缀
V2_TARGETS=(
  "$HOME/.claude/skills/tsinghua-literature-downloader-grouped"
  "$HOME/.agents/skills/tsinghua-literature-downloader-grouped"
  "$HOME/.config/opencode/skills/tsinghua-literature-downloader-grouped"
  "$HOME/.codex/skills/tsinghua-literature-downloader-grouped"
)

# token-disciplined（SKILL-v3）：-v3 后缀，非破坏性。cutover 见文件头注释。
V3_TARGETS=(
  "$HOME/.claude/skills/tsinghua-literature-downloader-v3"
  "$HOME/.agents/skills/tsinghua-literature-downloader-v3"
  "$HOME/.config/opencode/skills/tsinghua-literature-downloader-v3"
  "$HOME/.codex/skills/tsinghua-literature-downloader-v3"
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
echo " 统一版 (SKILL-v1, legacy/default): $V1_SRC"
echo " 分组版 (SKILL-v2, legacy):          $V2_SRC"
echo " v3 token-disciplined (canonical):   $V3_SRC"
echo " mode: $( $APPLY && echo 'APPLY' || echo 'DRY RUN (pass --apply to apply)' )"
echo "=========================================="
echo ""

echo "--- 统一版（SKILL-v1）→ default path ---"
for t in "${V1_TARGETS[@]}"; do
  if [[ -d "$V1_SRC" ]]; then
    sync_dir "$V1_SRC" "$t" "$(basename "$(dirname "$t")")/$(basename "$t")"
  else
    echo "⚠️  统一版源目录不存在: $V1_SRC"
  fi
done

echo ""
echo "--- 分组版（SKILL-v2）→ -grouped ---"
for t in "${V2_TARGETS[@]}"; do
  if [[ -d "$V2_SRC" ]]; then
    sync_dir "$V2_SRC" "$t" "$(basename "$(dirname "$t")")/$(basename "$t")"
  else
    echo "⚠️  分组版源目录不存在: $V2_SRC"
  fi
done

echo ""
echo "--- v3 token-disciplined（SKILL-v3）→ -v3 ---"
for t in "${V3_TARGETS[@]}"; do
  if [[ -d "$V3_SRC" ]]; then
    sync_dir "$V3_SRC" "$t" "$(basename "$(dirname "$t")")/$(basename "$t")"
  else
    echo "⚠️  v3 源目录不存在: $V3_SRC"
  fi
done

echo ""
if ! $APPLY; then
  echo "This was a dry run. To apply: ./sync.sh --apply"
fi
