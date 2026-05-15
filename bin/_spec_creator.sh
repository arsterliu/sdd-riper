#!/usr/bin/env bash
set -euo pipefail

# Internal spec creation engine. Invoked via `sdd discover`, not directly.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCAFFOLD_ROOT="$(dirname "$SCRIPT_DIR")"
source "$SCRIPT_DIR/_common.sh"

# Handle --help / -h early (before any other parsing)
for arg in "$@"; do
  if [[ "$arg" == "--help" || "$arg" == "-h" ]]; then
    cat <<'EOF'
Usage: sdd discover <project-dir> --task-name <name> [options]

Create a new Spec file pre-filled with provided fields.

Options:
  --create-spec         Enable spec creation mode (injected by discover.sh)
  --task-name <name>    Task name (required)
  --requirement <text>  Requirement definition
  --goal <text>         Goal statement
  --constraints <text>  Technical or business constraints
  --context <text>      Background context
  --version v{N}.{M}    Override auto-incremented version (e.g. v2.0)
  -h, --help            Show this help

Exit codes: 0=success, 1=missing asset, 3=param error
EOF
    exit 0
  fi
done

# Require --create-spec flag (always injected by discover.sh)
CREATE_SPEC_MODE=false
for arg in "$@"; do
  if [[ "$arg" == "--create-spec" ]]; then
    CREATE_SPEC_MODE=true
    break
  fi
done

if [[ "$CREATE_SPEC_MODE" != "true" ]]; then
  echo "[ERROR] _spec_creator.sh must be invoked via 'sdd discover'. Do not call it directly." >&2
  exit 3
fi

TASK_NAME=""
REQUIREMENT=""
GOAL=""
CONSTRAINTS=""
CONTEXT_TEXT=""
VERSION_OVERRIDE=""

TARGET_DIR="${1:-}"
shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --create-spec) shift ;;
    --task-name)   TASK_NAME="${2:-}"; shift 2 ;;
    --requirement) REQUIREMENT="${2:-}"; shift 2 ;;
    --goal)        GOAL="${2:-}"; shift 2 ;;
    --constraints) CONSTRAINTS="${2:-}"; shift 2 ;;
    --context)     CONTEXT_TEXT="${2:-}"; shift 2 ;;
    --version)     VERSION_OVERRIDE="${2:-}"; shift 2 ;;
    *) echo "[ERROR] Unknown option: $1" >&2; exit 3 ;;
  esac
done

if [[ -z "$TARGET_DIR" ]]; then
  echo "[ERROR] Usage: sdd discover <project-dir> --task-name <name>" >&2; exit 3
fi
DOCS_DIR="$(_sdd_get_docs_dir "$TARGET_DIR")"
DOCS_ROOT="$TARGET_DIR/$DOCS_DIR"
MODE="$(_sdd_get_mode "$TARGET_DIR")"
if [[ ! -d "$DOCS_ROOT" ]]; then
  echo "[ERROR] Project not initialized. Run: sdd.sh init <dir>" >&2; exit 1
fi
if [[ -z "$TASK_NAME" ]]; then
  echo "[ERROR] --task-name is required" >&2; exit 3
fi
if [[ ! "$TASK_NAME" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "[ERROR] Invalid --task-name: use only letters, numbers, hyphens, and underscores" >&2; exit 3
fi

SPEC_TEMPLATE="$(_sdd_get_spec_template "$SCAFFOLD_ROOT" "$TARGET_DIR")"
if [[ ! -f "$SPEC_TEMPLATE" ]]; then
  echo "[ERROR] spec template not found at: $SPEC_TEMPLATE" >&2; exit 1
fi

SPECS_DIR="$DOCS_ROOT/specs"
if [[ -n "$VERSION_OVERRIDE" ]]; then
  if [[ ! "$VERSION_OVERRIDE" =~ ^v[0-9]+\.[0-9]+$ ]]; then
    echo "[ERROR] Invalid --version format: '${VERSION_OVERRIDE}'. Expected: v{N}.{M} (e.g. v1.0, v2.3)" >&2; exit 3
  fi
  if _sdd_version_exists "$SPECS_DIR" "$TASK_NAME" "$VERSION_OVERRIDE"; then
    echo "[ERROR] Spec '${VERSION_OVERRIDE}-${TASK_NAME}.md' already exists. Choose a different version or omit --version for auto-increment." >&2; exit 1
  fi
  SPEC_VERSION="$VERSION_OVERRIDE"
else
  SPEC_VERSION="$(_sdd_next_version "$SPECS_DIR" "$TASK_NAME")"
fi
SPEC_OUT="$SPECS_DIR/${SPEC_VERSION}-${TASK_NAME}.md"

# Fill template: read and substitute placeholders
SPEC_CONTENT=$(cat "$SPEC_TEMPLATE")

INVOCATION_PLACEHOLDER='<!-- 核心目标 -->'
TOKEN_SUFFIX="${RANDOM}_$$"
INVOCATION_TOKEN="__SDD_INVOCATION_${TOKEN_SUFFIX}__"

# Build invocation block from discover args
INVOCATION_LINES=""
[[ -n "$REQUIREMENT"   ]] && INVOCATION_LINES+="requirement: ${REQUIREMENT}"$'\n'
[[ -n "$GOAL"          ]] && INVOCATION_LINES+="goal: ${GOAL}"$'\n'
[[ -n "$CONSTRAINTS"   ]] && INVOCATION_LINES+="constraints: ${CONSTRAINTS}"$'\n'
[[ -n "$CONTEXT_TEXT"  ]] && INVOCATION_LINES+="<!-- context: ${CONTEXT_TEXT} -->"$'\n'
INVOCATION_CONTENT="${INVOCATION_LINES:-$INVOCATION_PLACEHOLDER}"

# Sentinel swap to guard against user content matching later patterns
SPEC_CONTENT="${SPEC_CONTENT//task-name: \"Task Name Placeholder\"/task-name: \"$TASK_NAME\"}"
SPEC_CONTENT="${SPEC_CONTENT//$INVOCATION_PLACEHOLDER/$INVOCATION_TOKEN}"
SPEC_CONTENT="${SPEC_CONTENT//$INVOCATION_TOKEN/$INVOCATION_CONTENT}"

# Write the spec file
printf '%s\n' "$SPEC_CONTENT" > "$SPEC_OUT"

# Advisory: suggest CodeMap if project has substantial code and no codemap yet
_sdd_should_suggest_codemap "$TARGET_DIR" "$DOCS_DIR"

# Output SPEC CREATION PROMPT
if [[ "$MODE" == "micro" ]]; then
cat <<EOF
## SPEC CREATION PROMPT

### 已填充字段
task-name: ${TASK_NAME}
requirement: ${REQUIREMENT:-"(未指定)"}
goal: ${GOAL:-"(未指定)"}
constraints: ${CONSTRAINTS:-"(未指定)"}

### 创建的文件
${SPEC_OUT}

### AI 指令（Micro 模式）
请读取上述 Spec 文件，直接进入 Plan 阶段：
- 根据 requirement / goal / constraints 写出原子步骤，每步声明文件边界 + 验收条件
- Research / Innovate 整体跳过
- 完成 Plan 后等待人工审批，审批通过后进入 Execute
EOF
else
cat <<EOF
## SPEC CREATION PROMPT

### 已填充字段
task-name: ${TASK_NAME}
requirement: ${REQUIREMENT:-"(未指定)"}
goal: ${GOAL:-"(未指定)"}
constraints: ${CONSTRAINTS:-"(未指定)"}
context: ${CONTEXT_TEXT:-"(未指定)"}

### 创建的文件
${SPEC_OUT}

### AI 指令
请读取上述 Spec 文件，根据以下字段完善 Research Findings 区块，并识别初始 Open Questions：
- Requirement（需求定义）: ${REQUIREMENT:-"(待填充)"}
- Goal（目标）: ${GOAL:-"(待填充)"}
- Constraints（约束）: ${CONSTRAINTS:-"(待填充)"}
- Context（背景）: ${CONTEXT_TEXT:-"(待填充)"}

在 Spec Research 区块中：
1. 先采集 Findings（代码位置 / 调用链 / 依赖关系）
2. 从 Findings 识别 2-5 个 Open Questions
3. 将 constraints 记录到 Assumptions 区块
4. 最后基于以上三项写 Requirement Restatement

若当前任务涉及陌生或复杂模块，请在进入深入 Research 前执行以下检查：
- 先查看 mydocs/codemap/ 是否已有对应模块的 CodeMap，已有则优先复用
- 若没有现成 CodeMap，且模块结构/调用链较复杂，再运行: ./sdd.sh create-codemap <project-dir> --module <module-name>
- 任务结束前，如本次实现改变了入口点、核心调用链、外部依赖或风险项，请反向更新对应 CodeMap
EOF
fi
exit 0
