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
  echo "[ERROR] Usage: init.sh <target-dir> [--mode standard|lite] [--force] [--docs-dir <name>]" >&2
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

write_project_config() {
  local dst="$1" docs_dir="$2"
  local content="DOCS_DIR=\"${docs_dir}\""
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
for subdir in specs codemap context archive evidence; do
  make_gitkeep "$TARGET_DIR/$DOCS_DIR/$subdir"
done

# 2. Persist project config
write_project_config "$TARGET_DIR/.sdd-config" "$DOCS_DIR"

# 3. Generate AI configs
AI_CONFIG_OUTPUT=$(bash "$SCRIPT_DIR/_gen_ai_configs.sh" "$TARGET_DIR" "$MODE" "$FORCE")
printf '%s\n' "$AI_CONFIG_OUTPUT"
AI_CREATED=$(printf '%s\n' "$AI_CONFIG_OUTPUT" | grep -c '^\[CREATE\]' || true)
AI_SKIPPED=$(printf '%s\n' "$AI_CONFIG_OUTPUT" | grep -c '^\[SKIP\]' || true)
CREATED=$((CREATED + AI_CREATED))
SKIPPED=$((SKIPPED + AI_SKIPPED))

# Check if target project already has substantial source code and suggest CodeMap
_check_codemap_hint() {
  local dir="$1"
  local src_count
  src_count=$(find "$dir" -maxdepth 6 \
    \( -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" \
       -o -name "*.py" -o -name "*.go" -o -name "*.java" -o -name "*.cs" \
       -o -name "*.rb" -o -name "*.php" -o -name "*.rs" -o -name "*.cpp" -o -name "*.c" \) \
    -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/vendor/*" \
    -not -path "*/dist/*" -not -path "*/build/*" -not -path "*/target/*" \
    2>/dev/null | wc -l | tr -d ' ')

  local has_marker=false
  for marker in package.json go.mod pyproject.toml pom.xml Cargo.toml build.gradle; do
    if [[ -f "$dir/$marker" ]]; then
      has_marker=true
      break
    fi
  done

  if [[ "$src_count" -gt 20 ]] && [[ "$has_marker" == "true" ]]; then
    echo ""
    echo "[SDD-RIPER] 检测到目标项目已存在 ${src_count} 个源码文件，且包含项目标记文件。"
    echo "  建议在第一次 discover 之前先建立 CodeMap，帮助 AI 快速理解模块结构："
    echo "    ./sdd.sh create-codemap $dir [--module <name>]"
  fi
}

_check_codemap_hint "$TARGET_DIR"
echo "Use 'sdd discover <dir> --task-name <name> ...' to create your first spec."
echo "SDD initialized in $TARGET_DIR. Created: $CREATED files, Skipped: $SKIPPED files."
exit 0
