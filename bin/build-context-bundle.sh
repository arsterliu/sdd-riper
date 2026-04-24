#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCAFFOLD_ROOT="$(dirname "$SCRIPT_DIR")"

print_usage() {
  cat <<'EOF'
Usage: build-context-bundle.sh <project-dir> [--out <bundle-name>]
Generate an AI prompt to extract a structured context bundle from mydocs/.
Exit codes: 0=success, 1=missing asset, 3=param error
EOF
}

if [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]]; then
  print_usage; exit 0
fi

if [[ $# -eq 0 ]]; then
  echo "[ERROR] Usage: build-context-bundle.sh <project-dir>" >&2
  exit 3
fi

TARGET_DIR="${1:-}"
BUNDLE_NAME=""
VERSION_OVERRIDE=""
shift || true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)     BUNDLE_NAME="${2:-}"; shift 2 ;;
    --version) VERSION_OVERRIDE="${2:-}"; shift 2 ;;
    *) echo "[ERROR] Unknown option: $1" >&2; exit 3 ;;
  esac
done

if [[ -z "$TARGET_DIR" ]]; then
  echo "[ERROR] Usage: build-context-bundle.sh <project-dir>" >&2; exit 3
fi

if [[ ! -d "$TARGET_DIR/mydocs" ]]; then
  echo "[ERROR] Project not initialized. Run: sdd.sh init <dir>" >&2; exit 1
fi

# Default logical name
if [[ -z "$BUNDLE_NAME" ]]; then
  BUNDLE_NAME="context-bundle"
fi

CONTEXT_DIR="$TARGET_DIR/mydocs/context"

# Version helper (inline)
_next_version_bundle() {
  local dir="$1" name="$2"
  local max_major=0 max_minor=-1
  local f bname vmaj vmin
  while IFS= read -r -d '' f; do
    bname="$(basename "$f")"
    if [[ "$bname" =~ ^v([0-9]+)\.([0-9]+)-.+\.md$ ]]; then
      local stem="${bname%.md}"
      local vprefix="v${BASH_REMATCH[1]}.${BASH_REMATCH[2]}"
      local after_prefix="${stem#${vprefix}-}"
      if [[ "$after_prefix" == "$name" ]]; then
        vmaj="${BASH_REMATCH[1]}"
        vmin="${BASH_REMATCH[2]}"
        if (( vmaj > max_major )) || (( vmaj == max_major && vmin > max_minor )); then
          max_major=$vmaj; max_minor=$vmin
        fi
      fi
    fi
  done < <(find "$dir" -maxdepth 1 -name "*.md" -print0 2>/dev/null)
  if (( max_minor == -1 )); then echo "v1.0"; else echo "v${max_major}.$((max_minor + 1))"; fi
}

if [[ -n "$VERSION_OVERRIDE" ]]; then
  if [[ ! "$VERSION_OVERRIDE" =~ ^v[0-9]+\.[0-9]+$ ]]; then
    echo "[ERROR] Invalid --version format: '${VERSION_OVERRIDE}'. Expected: v{N}.{M}" >&2; exit 3
  fi
  if [[ -f "$CONTEXT_DIR/${VERSION_OVERRIDE}-${BUNDLE_NAME}.md" ]]; then
    echo "[ERROR] Bundle '${VERSION_OVERRIDE}-${BUNDLE_NAME}.md' already exists." >&2; exit 1
  fi
  BUNDLE_VERSION="$VERSION_OVERRIDE"
else
  BUNDLE_VERSION="$(_next_version_bundle "$CONTEXT_DIR" "$BUNDLE_NAME")"
fi

DOCS_DIR="$TARGET_DIR/mydocs"

# Enumerate markdown files grouped by directory
list_md_files() {
  local dir="$1" label="$2"
  local files
  if [[ ! -d "$dir" ]]; then
    echo "  [${label}] (empty)"
    return
  fi
  files=$(find "$dir" -maxdepth 1 -name "*.md" ! -name ".gitkeep" 2>/dev/null | sort)
  local count=0
  if [[ -n "$files" ]]; then
    count=$(echo "$files" | wc -l)
  fi
  if [[ "$count" -gt 0 ]]; then
    echo "  [${label}] (${count} files)"
    echo "$files" | while read -r f; do echo "    - $(basename "$f")"; done
  else
    echo "  [${label}] (empty)"
  fi
}

FILE_LISTING=$(
  list_md_files "$DOCS_DIR/specs"   "specs"
  list_md_files "$DOCS_DIR/codemap" "codemap"
  list_md_files "$DOCS_DIR/context" "context"
  list_md_files "$DOCS_DIR/archive" "archive"
)

# Read template (first 20 lines)
TEMPLATE_PATH="$SCAFFOLD_ROOT/templates/context-bundle.md"
TEMPLATE_EXCERPT="(template not found)"
if [[ -f "$TEMPLATE_PATH" ]]; then
  TEMPLATE_EXCERPT=$(head -20 "$TEMPLATE_PATH")
fi

OUTPUT_PATH="$TARGET_DIR/mydocs/context/${BUNDLE_VERSION}-${BUNDLE_NAME}.md"

cat <<EOF
## BUILD CONTEXT BUNDLE PROMPT

### mydocs 文件清单
${FILE_LISTING}

### Context Bundle 模板格式（前 20 行）
${TEMPLATE_EXCERPT}

### AI 指令
请阅读上述文件清单中与当前任务相关的文档，提炼结构化上下文包：
1. 从 specs/ 中提取当前任务背景与历史决策
2. 从 codemap/ 中提取相关模块架构信息
3. 从 archive/ 中提取历史任务的关键经验和结论
4. 按 Context Bundle 模板格式整理，用 Write 工具写入以下路径（不要修改路径）：
   ${OUTPUT_PATH}

重要：你必须使用 Write 工具将内容实际写入上述路径，不能只展示内容。写入完成后输出：
  [DONE] Context Bundle written to: ${OUTPUT_PATH}
EOF

echo "SDD_OUTPUT_PATH: ${OUTPUT_PATH}"

exit 0