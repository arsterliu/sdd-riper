#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCAFFOLD_ROOT="$(dirname "$SCRIPT_DIR")"

print_usage() {
  cat <<'EOF'
Usage: create-projectmap.sh <project-dir> [--repos <repo1,repo2,...>] [--force]
Exit codes: 0=success, 1=missing asset, 2=already exists (use --force), 3=param error
EOF
}

if [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]]; then
  print_usage; exit 0
fi

TARGET_DIR="${1:-}"
REPOS=""
FORCE=""
shift || true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repos) REPOS="${2:-}"; shift 2 ;;
    --force) FORCE="1"; shift ;;
    *) echo "[ERROR] Unknown option: $1" >&2; exit 3 ;;
  esac
done

if [[ -z "$TARGET_DIR" ]]; then
  echo "[ERROR] Usage: create-projectmap.sh <project-dir>" >&2; exit 3
fi

if [[ ! -d "$TARGET_DIR/mydocs" ]]; then
  echo "[ERROR] Project not initialized." >&2; exit 1
fi

if [[ -f "$TARGET_DIR/mydocs/projectmap.md" ]] && [[ -z "$FORCE" ]]; then
  echo "[ERROR] projectmap.md already exists. Use --force to override." >&2; exit 2
fi

PROJECT_NAME=$(basename "$TARGET_DIR")

TOP_DIRS=$(find "$TARGET_DIR" -maxdepth 1 -mindepth 1 -type d ! -name ".*" 2>/dev/null | xargs -I{} basename {} 2>/dev/null | sort | tr '\n' ' ' | head -c 200 || echo "")
if [[ -z "${TOP_DIRS:-}" ]]; then
  TOP_DIRS="(no top-level directories)"
fi

STACKS=""
if [[ -f "$TARGET_DIR/package.json" ]]; then STACKS="${STACKS}Node.js "; fi
if [[ -f "$TARGET_DIR/go.mod" ]]; then STACKS="${STACKS}Go "; fi
if [[ -f "$TARGET_DIR/pyproject.toml" ]] || [[ -f "$TARGET_DIR/setup.py" ]]; then STACKS="${STACKS}Python "; fi
if [[ -f "$TARGET_DIR/pom.xml" ]]; then STACKS="${STACKS}Java/Maven "; fi
if [[ -f "$TARGET_DIR/Cargo.toml" ]]; then STACKS="${STACKS}Rust "; fi
STACKS="${STACKS%"${STACKS##*[![:space:]]}"}" # trim trailing space
if [[ -z "$STACKS" ]]; then STACKS="(未检测到)"; fi

REPOS_LIST="${REPOS:-单仓库}"

TEMPLATE_PATH="$SCAFFOLD_ROOT/templates/projectmap.md"
TEMPLATE_EXCERPT="(template not found)"
if [[ -f "$TEMPLATE_PATH" ]]; then
  TEMPLATE_EXCERPT=$(head -30 "$TEMPLATE_PATH")
fi

cat <<EOF
## CREATE PROJECTMAP PROMPT

### 项目基础信息
name: ${PROJECT_NAME}
repos: ${REPOS_LIST}
top-level-dirs: ${TOP_DIRS}
detected-stacks: ${STACKS}

### ProjectMap 模板格式（前 30 行）
${TEMPLATE_EXCERPT}

### AI 指令
请基于上述信息，填写 ProjectMap，重点描述：
1. 各仓库/模块职责
2. 跨模块接口契约
3. 核心数据流
完成后将内容写入：${TARGET_DIR}/mydocs/projectmap.md
EOF

exit 0