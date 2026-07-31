#!/usr/bin/env bash
# [Unix-only] Sync canonical skill to local AI tool directories.
#
# v3.3 (SKILL-v3.3/) is the CURRENT CANONICAL version (strategy-hardcoded).
# It installs to the default path (tsinghua-literature-downloader).
# Legacy versions install with versioned suffixes.
#
# Usage:
#   ./sync.sh          # dry-run
#   ./sync.sh --apply  # actually copy

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

# --- Canonical (v3.3, strategy-hardcoded) ---
CANONICAL_SRC="$REPO_ROOT/SKILL-v3.3"
CANONICAL_TARGETS=(
  "$HOME/.claude/skills/tsinghua-literature-downloader"
  "$HOME/.agents/skills/tsinghua-literature-downloader"
  "$HOME/.config/opencode/skills/tsinghua-literature-downloader"
  "$HOME/.codex/skills/tsinghua-literature-downloader"
)

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

APPLY=false
[[ "${1:-}" == "--apply" ]] && APPLY=true

EXCLUDES=("downloads" "download-log.tsv" ".DS_Store")

sync_dir() {
  local src="$1" dst="$2" label="$3"
  local args=(-a --delete --stats)
  for ex in "${EXCLUDES[@]}"; do args+=(--exclude="$ex"); done
  if $APPLY; then
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
echo " canonical: SKILL-v3.3 (strategy-hardcoded)"
echo " mode: $( $APPLY && echo 'APPLY' || echo 'DRY RUN (pass --apply to apply)' )"
echo "=========================================="
echo ""

echo "--- canonical (SKILL-v3.3) → default path ---"
for t in "${CANONICAL_TARGETS[@]}"; do
  sync_dir "$CANONICAL_SRC" "$t" "$(basename "$(dirname "$t")")/$(basename "$t")"
done

for entry in "${LEGACY[@]}"; do
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
