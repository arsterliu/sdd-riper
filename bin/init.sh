#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCAFFOLD_ROOT="$(dirname "$SCRIPT_DIR")"
source "$SCRIPT_DIR/_common.sh"

# Parse arguments
TARGET_DIR=""
MODE="standard"
FORCE=""
DOCS_DIR="mydocs"
DOCS_DIR_EXPLICIT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="$2"; shift 2 ;;
    --force) FORCE="--force"; shift ;;
    --docs-dir) DOCS_DIR="$2"; DOCS_DIR_EXPLICIT=true; shift 2 ;;
    -*) echo "[ERROR] Unknown option: $1" >&2; exit 3 ;;
    *) TARGET_DIR="$1"; shift ;;
  esac
done

if [[ -z "$TARGET_DIR" ]]; then
  echo "[ERROR] Usage: init.sh <target-dir> [--mode standard|lite|micro] [--force] [--docs-dir <name>]" >&2
  exit 3
fi

if [[ "$DOCS_DIR_EXPLICIT" == "false" ]] && [[ -f "$TARGET_DIR/.sdd-config" ]] && [[ -z "$FORCE" ]]; then
  DOCS_DIR="$(_sdd_get_docs_dir "$TARGET_DIR")"
fi

if ! _sdd_is_valid_docs_dir_name "$DOCS_DIR"; then
  echo "[ERROR] --docs-dir must be a plain directory name" >&2
  exit 3
fi

CREATED=0
SKIPPED=0

# Helper: copy_file <src> <dst>
copy_file() {
  local src="$1" dst="$2"
  if [[ -f "$dst" ]] && [[ -z "$FORCE" ]]; then
    echo "[SKIP] $dst already exists"
    SKIPPED=$((SKIPPED + 1))
  else
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    echo "[CREATE] $dst"
    CREATED=$((CREATED + 1))
  fi
}

# Helper: make_gitkeep <dir>
make_gitkeep() {
  local dir="$1"
  mkdir -p "$dir"
  local gk="$dir/.gitkeep"
  if [[ ! -f "$gk" ]]; then
    touch "$gk"
    CREATED=$((CREATED + 1))
  fi
}

SDD_PROTOCOL_VERSION="1.0"

write_project_config() {
  local dst="$1" docs_dir="$2" mode="$3"
  local content="DOCS_DIR=\"${docs_dir}\"
MODE=\"${mode}\"
SDD_VERSION=\"${SDD_PROTOCOL_VERSION}\""
  local existing_docs_dir=""

  if [[ -f "$dst" ]] && [[ -z "$FORCE" ]]; then
    existing_docs_dir="$(_sdd_get_docs_dir "$TARGET_DIR")"
    if [[ "$existing_docs_dir" == "$docs_dir" ]]; then
      echo "[SKIP] $dst already exists"
      SKIPPED=$((SKIPPED + 1))
      return
    fi
  fi

  printf '%s\n' "$content" > "$dst"
  echo "[CREATE] $dst"
  CREATED=$((CREATED + 1))
}

# 1. Create docs subdirectories
for subdir in specs codemap context archive; do
  make_gitkeep "$TARGET_DIR/$DOCS_DIR/$subdir"
done

# 2. Persist project config
write_project_config "$TARGET_DIR/.sdd-config" "$DOCS_DIR" "$MODE"

# 3. Generate AI configs
AI_CONFIG_OUTPUT=$("${BASH}" "$SCRIPT_DIR/_gen_ai_configs.sh" "$TARGET_DIR" "$MODE" "$FORCE")
printf '%s\n' "$AI_CONFIG_OUTPUT"
AI_CREATED=$(printf '%s\n' "$AI_CONFIG_OUTPUT" | grep -c '^\[CREATE\]' || true)
AI_SKIPPED=$(printf '%s\n' "$AI_CONFIG_OUTPUT" | grep -c '^\[SKIP\]' || true)
CREATED=$((CREATED + AI_CREATED))
SKIPPED=$((SKIPPED + AI_SKIPPED))

# Check if target project already has substantial source code and suggest CodeMap
# _sdd_should_suggest_codemap returns 1 (no suggestion) or 0 (suggestion printed).
# Use || true so set -e doesn't treat "no suggestion" as a script failure.
_sdd_should_suggest_codemap "$TARGET_DIR" "$DOCS_DIR" || true
echo "Use 'sdd discover <dir> --task-name <name> ...' to create your first spec."
echo "SDD initialized in $TARGET_DIR. Created: $CREATED files, Skipped: $SKIPPED files."
exit 0
