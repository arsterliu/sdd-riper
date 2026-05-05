#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCAFFOLD_ROOT="$(dirname "$SCRIPT_DIR")"
source "$SCRIPT_DIR/_common.sh"

print_usage() {
  cat <<'EOF'
Usage: build-context-bundle.sh <project-dir> [--out <bundle-name>] [--sources <dir>]
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
SOURCES_DIR=""
shift || true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)     BUNDLE_NAME="${2:-}"; shift 2 ;;
    --version) VERSION_OVERRIDE="${2:-}"; shift 2 ;;
    --sources) SOURCES_DIR="${2:-}"; shift 2 ;;
    *) echo "[ERROR] Unknown option: $1" >&2; exit 3 ;;
  esac
done

if [[ -z "$TARGET_DIR" ]]; then
  echo "[ERROR] Usage: build-context-bundle.sh <project-dir>" >&2; exit 3
fi

DOCS_DIR="$(_sdd_get_docs_dir "$TARGET_DIR")"
DOCS_ROOT="$TARGET_DIR/$DOCS_DIR"

if [[ ! -d "$DOCS_ROOT" ]]; then
  echo "[ERROR] Project not initialized. Run: sdd.sh init <dir>" >&2; exit 1
fi

# Default logical name
if [[ -z "$BUNDLE_NAME" ]]; then
  BUNDLE_NAME="context-bundle"
fi

CONTEXT_DIR="$DOCS_ROOT/context"

if [[ -n "$VERSION_OVERRIDE" ]]; then
  if [[ ! "$VERSION_OVERRIDE" =~ ^v[0-9]+\.[0-9]+$ ]]; then
    echo "[ERROR] Invalid --version format: '${VERSION_OVERRIDE}'. Expected: v{N}.{M}" >&2; exit 3
  fi
  if [[ -f "$CONTEXT_DIR/${VERSION_OVERRIDE}-${BUNDLE_NAME}.md" ]]; then
    echo "[ERROR] Bundle '${VERSION_OVERRIDE}-${BUNDLE_NAME}.md' already exists." >&2; exit 1
  fi
  BUNDLE_VERSION="$VERSION_OVERRIDE"
else
  BUNDLE_VERSION="$(_sdd_next_version "$CONTEXT_DIR" "$BUNDLE_NAME")"
fi

DOCS_DIR_ROOT="$DOCS_ROOT"

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
  list_md_files "$DOCS_DIR_ROOT/specs"   "specs"
  list_md_files "$DOCS_DIR_ROOT/codemap" "codemap"
  list_md_files "$DOCS_DIR_ROOT/archive" "archive"
)

# Process sources directory
SOURCES_LISTING=""
if [[ -n "$SOURCES_DIR" ]]; then
  if [[ ! -d "$SOURCES_DIR" ]]; then
    echo "[WARN] --sources path not found or not a directory: $SOURCES_DIR" >&2
    SOURCES_DIR=""
  else
    SOURCES_CONTENT=""
    # find files, sort alphabetically
    while IFS= read -r -d '' f; do
      filename=$(basename "$f")
      ext="${filename##*.}"
      ext=$(echo "$ext" | tr '[:upper:]' '[:lower:]')
      
      if [[ "$ext" == "md" ]] || [[ "$ext" == "txt" ]]; then
        size=$(wc -c < "$f")
        if [[ "$size" -le 51200 ]]; then
          SOURCES_CONTENT+="### $filename
$(cat "$f")

"
        else
          SOURCES_CONTENT+="### $filename
[文件过大，请 AI 自行读取：$(cd "$(dirname "$f")" && pwd)/$filename]

"
        fi
      elif [[ "$ext" == "png" ]] || [[ "$ext" == "jpg" ]] || [[ "$ext" == "jpeg" ]] || [[ "$ext" == "gif" ]] || [[ "$ext" == "webp" ]]; then
        SOURCES_CONTENT+="- [image] $(cd "$(dirname "$f")" && pwd)/$filename
"
      fi
    done < <(find "$SOURCES_DIR" -type f -print0 | sort -z)
    
    if [[ -n "$SOURCES_CONTENT" ]]; then
      SOURCES_LISTING="## Source Materials（原始任务资料）

$SOURCES_CONTENT"
    fi
  fi
fi

# Read template (first 20 lines)
TEMPLATE_PATH="$SCAFFOLD_ROOT/templates/context-bundle.md"
TEMPLATE_EXCERPT="(template not found)"
if [[ -f "$TEMPLATE_PATH" ]]; then
  TEMPLATE_EXCERPT=$(head -20 "$TEMPLATE_PATH")
fi

OUTPUT_PATH="$DOCS_ROOT/context/${BUNDLE_VERSION}-${BUNDLE_NAME}.md"

cat <<EOF
## BUILD CONTEXT BUNDLE PROMPT
${SOURCES_LISTING:+
${SOURCES_LISTING}}
## Project Background（项目历史背景）

### mydocs 文件清单
${FILE_LISTING}

### Context Bundle 模板格式（前 20 行）
${TEMPLATE_EXCERPT}

### AI 指令
请阅读上述资料与文件清单中与当前任务相关的文档，提炼结构化上下文包：
1. 若有 Source Materials，将其作为当前需求原始资料提炼
2. 从 specs/ 中提取当前任务背景与历史决策
3. 从 codemap/ 中提取相关模块架构信息
4. 从 archive/ 中提取历史任务的关键经验和结论
5. 按 Context Bundle 模板格式整理，用 Write 工具写入以下路径（不要修改路径）：
   ${OUTPUT_PATH}

重要：你必须使用 Write 工具将内容实际写入上述路径，不能只展示内容。写入完成后输出：
  [DONE] Context Bundle written to: ${OUTPUT_PATH}
EOF

echo "SDD_OUTPUT_PATH: ${OUTPUT_PATH}"

exit 0
