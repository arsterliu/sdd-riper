#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"
SCAFFOLD_ROOT="$(dirname "$SCRIPT_DIR")"

print_usage() {
  cat <<'EOF'
Usage: create-codemap.sh <project-dir> [--module <name>]
Generate an AI prompt to scan the codebase and fill a CodeMap.
Exit codes: 0=success, 1=missing asset, 3=param error
EOF
}

if [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]]; then
  print_usage; exit 0
fi

TARGET_DIR="${1:-}"
MODULE_NAME=""
shift || true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --module) MODULE_NAME="${2:-}"; shift 2 ;;
    *) echo "[ERROR] Unknown option: $1" >&2; exit 3 ;;
  esac
done

if [[ -z "$TARGET_DIR" ]]; then
  echo "[ERROR] Usage: create-codemap.sh <project-dir>" >&2; exit 3
fi

DOCS_ROOT="$(_sdd_get_docs_root "$TARGET_DIR")"

if [[ -n "$MODULE_NAME" ]]; then
  if [[ "$MODULE_NAME" == *"/"* ]] || [[ "$MODULE_NAME" == *"\\"* ]] || [[ "$MODULE_NAME" == *".."* ]]; then
    echo "[ERROR] Invalid --module: path separators and '..' are not allowed" >&2; exit 3
  fi
fi

if [[ ! -d "$DOCS_ROOT" ]]; then
  echo "[ERROR] Project not initialized. Run: sdd.sh init <dir>" >&2; exit 1
fi

# Scan project files (sample, exclude common noise)
FILE_LIST=$(find "$TARGET_DIR" -maxdepth 3 \( -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.go" -o -name "*.java" -o -name "*.sh" \) \
  ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/dist/*" ! -path "*/__pycache__/*" \
  2>/dev/null | sort | head -50)
FILE_COUNT=$(printf '%s\n' "$FILE_LIST" | grep -c '[^[:space:]]' 2>/dev/null || echo "0")

# Optional: module-specific files
MODULE_FILES=""
if [[ -n "$MODULE_NAME" ]]; then
  MODULE_FILES=$(find "$TARGET_DIR" -maxdepth 5 -path "*${MODULE_NAME}*" \( -name "*.md" -o -name "*.ts" -o -name "*.py" -o -name "*.go" \) \
    ! -path "*/.git/*" ! -path "*/node_modules/*" 2>/dev/null | head -20)
fi

# Read codemap template (first 30 lines as format guide)
TEMPLATE_PATH="$SCAFFOLD_ROOT/templates/codemap.md"
TEMPLATE_EXCERPT="(template not found)"
if [[ -f "$TEMPLATE_PATH" ]]; then
  TEMPLATE_EXCERPT=$(head -30 "$TEMPLATE_PATH")
fi

# Determine output path
MODULE_SLUG="${MODULE_NAME:-$(basename "$TARGET_DIR")}"
CODEMAP_DIR="$DOCS_ROOT/codemap"
OUTPUT_PATH="$CODEMAP_DIR/${MODULE_SLUG}.md"

MODE="CREATE"
EXISTING_CODEMAP=""
if [[ -f "$OUTPUT_PATH" ]]; then
  MODE="UPDATE"
  _codemap_size=$(wc -c < "$OUTPUT_PATH" | tr -d ' ')
  if [[ "$_codemap_size" -gt 51200 ]]; then
    EXISTING_CODEMAP="[文件过大 (${_codemap_size} bytes)，请直接读取文件：${OUTPUT_PATH}]"
  else
    EXISTING_CODEMAP=$(cat "$OUTPUT_PATH")
  fi
fi

if [[ "$MODE" == "UPDATE" ]]; then
cat <<EOF
## UPDATE CODEMAP PROMPT

### 已有 CodeMap
${EXISTING_CODEMAP}

### 当前项目文件树（采样，≤50 files）
${FILE_LIST:-"(no source files found)"}
$([ -n "$MODULE_FILES" ] && echo "" && echo "### 模块文件（--module: ${MODULE_NAME}）" && echo "$MODULE_FILES" || true)

### AI 指令（UPDATE 模式）
此模块已存在 CodeMap。请不要整份重写；先比较已有 CodeMap 与当前文件树，再决定是否需要更新：
1. 检查入口点、模块边界、关键组件、核心调用链、依赖、风险项是否发生架构事实变化
2. 若没有架构事实变化，只输出：[NO UPDATE NEEDED] CodeMap 仍然准确，无需修改。不要改写文件。
3. 若发生变化，仅更新受影响区块，并同步更新 frontmatter 中的 updated-at 与 last-reason
4. last-reason 应说明本次更新对应的架构变化，而不是简单写"task done"

仅在第 3 步发生时，将更新后的内容写回：${OUTPUT_PATH}
EOF
else
cat <<EOF
## CREATE CODEMAP PROMPT

### 项目文件树（采样，≤50 files）
${FILE_LIST:-"(no source files found)"}
$([ -n "$MODULE_FILES" ] && echo "" && echo "### 模块文件（--module: ${MODULE_NAME}）" && echo "$MODULE_FILES" || true)

### CodeMap 模板格式（前 30 行）
${TEMPLATE_EXCERPT}

### AI 指令
请分析上述文件树，识别以下内容并按 CodeMap 模板格式输出：
1. 入口点（HTTP 路由 / CLI 命令 / 事件监听等触发方式）
2. 模块边界（本模块负责什么、委托什么给其他模块、对外暴露什么接口）
3. 关键组件及其职责
4. 核心调用链路（入口 → 核心处理 → 输出）
5. 依赖（内部模块依赖 + 外部第三方库 / API / DB / MQ）
6. 风险点（已知风险、脆弱依赖、需注意的边界条件）

CodeMap 是模块级活文档，供后续任务复用：
- 请在 frontmatter 中将 updated-at 设为今天日期
- 将 last-reason 设为 "Initial creation"

完成后请用户运行以下命令创建文件，再将内容写入：
  sdd new-codemap <project-dir> ${MODULE_SLUG}
EOF
fi

exit 0
