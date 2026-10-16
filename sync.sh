#!/usr/bin/env bash
# [Unix-only] Sync canonical skill to local AI tool directories.
#
# v4 (SKILL-v4/) is the CURRENT CANONICAL version.
# It installs to the default path (tsinghua-literature-downloader).
# Legacy versions install with versioned suffixes.
#
# Usage:
#   ./sync.sh          # dry-run
#   ./sync.sh --apply  # actually copy

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

# --- Canonical (v3.4, parallel-batch) ---
CANONICAL_SRC="$REPO_ROOT/SKILL-v4"
CANONICAL_TARGETS=(
  "$HOME/.claude/skills/tsinghua-literature-downloader"
  "$HOME/.agents/skills/tsinghua-literature-downloader"
  "$HOME/.config/opencode/skills/tsinghua-literature-downloader"
  "$HOME/.codex/skills/tsinghua-literature-downloader"
)

# Include existing installations in other AI-tool/account skill roots.
shopt -s nullglob
for root in "$HOME"/.*/skills "$HOME"/.config/*/skills; do
  candidate="$root/tsinghua-literature-downloader"
  [[ -f "$candidate/SKILL.md" ]] || continue
  present=false
  for known in "${CANONICAL_TARGETS[@]}"; do [[ "$known" == "$candidate" ]] && present=true; done
  $present || CANONICAL_TARGETS+=("$candidate")
done

# --- Legacy versions (optional, versioned suffix) ---
declare -a LEGACY=()
if [[ -d "$REPO_ROOT/SKILL-v1" ]]; then
  LEGACY+=("$REPO_ROOT/SKILL-v1|-v1|v1.0 unified")
fi
if [[ -d "$REPO_ROOT/SKILL-v2" ]]; then
  LEGACY+=("$REPO_ROOT/SKILL-v2|-grouped|v2.0 grouped")
fi
if [[ -d "$REPO_ROOT/SKILL-v3" ]]; then
  LEGACY+=("$REPO_ROOT/SKILL-v3|-v3|v3.0 token-disciplined")
fi
if [[ -d "$REPO_ROOT/SKILL-v3.1" ]]; then
  LEGACY+=("$REPO_ROOT/SKILL-v3.1|-v3.1|v3.1 click-first")
fi
if [[ -d "$REPO_ROOT/SKILL-v3.2" ]]; then
  LEGACY+=("$REPO_ROOT/SKILL-v3.2|-v3.2|v3.2 network-safe")
fi
if [[ -d "$REPO_ROOT/SKILL-v3.4" ]]; then
  LEGACY+=("$REPO_ROOT/SKILL-v3.4|-v3.4|v3.4 parallel-batch")
fi
if [[ -d "$REPO_ROOT/SKILL-v3.3" ]]; then
  LEGACY+=("$REPO_ROOT/SKILL-v3.3|-v3.3|v3.3 strategy-hardcoded")
fi

APPLY=false
[[ "${1:-}" == "--apply" ]] && APPLY=true

EXCLUDES=("downloads" "download-log.tsv" ".DS_Store" "__pycache__" "*.pyc" "node_modules" ".git")

sync_dir() {
  local src="$1" dst="$2" label="$3"
  local args=(-a --stats)
  for ex in "${EXCLUDES[@]}"; do args+=(--exclude="$ex"); done
  if $APPLY; then
    # Preserve the installed v3.4 core before upgrading; never overwrite an archive.
    if [[ -f "$dst/SKILL.md" ]] && grep -q 'version: 3.4' "$dst/SKILL.md" && [[ ! -e "${dst}-v3.4" ]]; then
      mkdir -p "${dst}-v3.4"
      rsync -a --exclude=downloads --exclude=download-log.tsv --exclude=.DS_Store "$dst/" "${dst}-v3.4/"
    fi
    mkdir -p "$dst"
    rsync "${args[@]}" "$src/" "$dst/"
    echo "✅  $label → $dst"
  else
    echo "📋  $label → $dst"
    rsync "${args[@]}" --dry-run "$src/" "$dst/" 2>&1 | tail -3
    echo ""
  fi
}

echo "=========================================="
echo " tsinghua-literature-downloader sync"
echo " canonical: SKILL-v4 (bounded, fixed database strategies)"
echo " mode: $( $APPLY && echo 'APPLY' || echo 'DRY RUN (pass --apply to apply)' )"
echo "=========================================="
echo ""

echo "--- canonical (SKILL-v4) → default path ---"
for t in "${CANONICAL_TARGETS[@]}"; do
  sync_dir "$CANONICAL_SRC" "$t" "$(basename "$(dirname "$t")")/$(basename "$t")"
done

for entry in "${LEGACY[@]}"; do
  [[ "${2:-}" == "--include-legacy" ]] || continue
  IFS='|' read -r src suffix label <<< "$entry"
  echo ""
  echo "--- legacy ($label) → $suffix suffix ---"
  for t in "${CANONICAL_TARGETS[@]}"; do
    sync_dir "$src" "${t}${suffix}" "$(basename "$(dirname "$t")")/$(basename "$t")${suffix}"
  done
done

echo ""
if ! $APPLY; then
  echo "This was a dry run. To apply: ./sync.sh --apply"
fi
