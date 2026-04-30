#!/usr/bin/env bash
set -euo pipefail

# Internal workflow engine. Invoke via `sdd discover` or `sdd resume`, not directly.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCAFFOLD_ROOT="$(dirname "$SCRIPT_DIR")"
source "$SCRIPT_DIR/_common.sh"

# Handle --help / -h early (before any other parsing)
for arg in "$@"; do
  if [[ "$arg" == "--help" || "$arg" == "-h" ]]; then
    cat <<'EOF'
Usage: sdd resume <project-dir>
sdd discover <project-dir> --task-name <name> [options]

Standard mode: output project status and PHASE_HINT for AI context loading.
Create-spec mode: create a new Spec file pre-filled with provided fields.

Options (standard mode):
  -h, --help            Show this help

Options (create-spec mode):
  --create-spec         Enable spec creation mode
  --task-name <name>    Task name (required in create-spec mode)
  --requirement <text>  Requirement definition
  --goal <text>         Goal statement
  --constraints <text>  Technical or business constraints
  --context <text>      Background context

Exit codes: 0=success, 1=missing asset, 3=param error
EOF
    exit 0
  fi
done

# Detect --create-spec mode
CREATE_SPEC_MODE=false
TASK_NAME=""
REQUIREMENT=""
GOAL=""
CONSTRAINTS=""
CONTEXT_TEXT=""
VERSION_OVERRIDE=""

# Parse all args first pass (look for --create-spec)
for arg in "$@"; do
  if [[ "$arg" == "--create-spec" ]]; then
    CREATE_SPEC_MODE=true
    break
  fi
done

if [[ "$CREATE_SPEC_MODE" == "true" ]]; then
  # Parse create-spec specific args
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
  if [[ ! -d "$DOCS_ROOT" ]]; then
    echo "[ERROR] Project not initialized. Run: sdd.sh init <dir>" >&2; exit 1
  fi
  if [[ -z "$TASK_NAME" ]]; then
    echo "[ERROR] --task-name is required with --create-spec mode" >&2; exit 3
  fi
  if [[ ! "$TASK_NAME" =~ ^[A-Za-z0-9_-]+$ ]]; then
    echo "[ERROR] Invalid --task-name: use only letters, numbers, hyphens, and underscores" >&2; exit 3
  fi
  
  SPEC_TEMPLATE="$SCAFFOLD_ROOT/templates/spec.md"
  if [[ ! -f "$SPEC_TEMPLATE" ]]; then
    echo "[ERROR] templates/spec.md not found at: $SPEC_TEMPLATE" >&2; exit 1
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

  REQ_PLACEHOLDER='<!-- 我对需求的复述（必填） -->'
  GOAL_PLACEHOLDER='<!-- 核心目标 -->'
  CONSTRAINTS_PLACEHOLDER='<!-- 技术或业务约束 -->'
  CONTEXT_PLACEHOLDER='<!-- 背景材料包（历史资料、旧Spec、CodeMap等，不替代Requirement）TODO -->'
  TOKEN_SUFFIX="${RANDOM}_$$"
  REQ_TOKEN="__SDD_REQ_${TOKEN_SUFFIX}__"
  GOAL_TOKEN="__SDD_GOAL_${TOKEN_SUFFIX}__"
  CONSTRAINTS_TOKEN="__SDD_CONSTRAINTS_${TOKEN_SUFFIX}__"
  CONTEXT_TOKEN="__SDD_CONTEXT_${TOKEN_SUFFIX}__"
  
  # Replace fixed template placeholders with unique sentinels first so later
  # user-provided content cannot be re-matched by subsequent replacements.
  SPEC_CONTENT="${SPEC_CONTENT//task-name: \"Task Name Placeholder\"/task-name: \"$TASK_NAME\"}"
  SPEC_CONTENT="${SPEC_CONTENT//$REQ_PLACEHOLDER/$REQ_TOKEN}"
  SPEC_CONTENT="${SPEC_CONTENT//$GOAL_PLACEHOLDER/$GOAL_TOKEN}"
  SPEC_CONTENT="${SPEC_CONTENT//$CONSTRAINTS_PLACEHOLDER/$CONSTRAINTS_TOKEN}"
  SPEC_CONTENT="${SPEC_CONTENT//$CONTEXT_PLACEHOLDER/$CONTEXT_TOKEN}"
  
  SPEC_CONTENT="${SPEC_CONTENT//$REQ_TOKEN/${REQUIREMENT:-$REQ_PLACEHOLDER}}"
  SPEC_CONTENT="${SPEC_CONTENT//$GOAL_TOKEN/${GOAL:-$GOAL_PLACEHOLDER}}"
  SPEC_CONTENT="${SPEC_CONTENT//$CONSTRAINTS_TOKEN/${CONSTRAINTS:-$CONSTRAINTS_PLACEHOLDER}}"
  SPEC_CONTENT="${SPEC_CONTENT//$CONTEXT_TOKEN/${CONTEXT_TEXT:-$CONTEXT_PLACEHOLDER}}"

  # Write the spec file
  printf '%s\n' "$SPEC_CONTENT" > "$SPEC_OUT"
  
  # Advisory: suggest CodeMap if project has substantial code and no codemap yet
  _codemap_hint_if_needed() {
    local dir="$1"
    local docs_dir="${2:-mydocs}"
    # Check codemap existence (same semantics as resume branch)
    local has_codemap=false
    if [[ -d "$dir/$docs_dir/codemap" ]]; then
      local codemap_count
      codemap_count=$(find "$dir/$docs_dir/codemap" -name "*.md" ! -name ".gitkeep" 2>/dev/null | wc -l | tr -d ' ')
      if [[ "$codemap_count" -gt 0 ]]; then
        has_codemap=true
      fi
    fi

    if [[ "$has_codemap" == "true" ]]; then
      return 0
    fi

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
      echo "[SDD-RIPER] 检测到目标项目已存在 ${src_count} 个源码文件，且尚未建立 CodeMap。"
      echo "  建议先建立 CodeMap 再进入 Research，帮助 AI 快速理解模块结构："
      echo "    ./sdd.sh create-codemap $dir [--module <name>]"
    fi
  }

  _codemap_hint_if_needed "$TARGET_DIR" "$DOCS_DIR"
  
  # Output SPEC CREATION PROMPT
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

在 Spec §6 Research Findings 中：
1. 将上述字段写入 Requirement Restatement
2. 根据 requirement 和 goal 识别 2-5 个 Open Questions
3. 将 constraints 记录到 Assumptions 区块

若当前任务涉及陌生或复杂模块，请在进入深入 Research 前执行以下检查：
- 先查看 mydocs/codemap/ 是否已有对应模块的 CodeMap，已有则优先复用
- 若没有现成 CodeMap，且模块结构/调用链较复杂，再运行: ./sdd.sh create-codemap <project-dir> --module <module-name>
- 任务结束前，如本次实现改变了入口点、核心调用链、外部依赖或风险项，请反向更新对应 CodeMap
EOF
  exit 0
fi

echo "[ERROR] _workflow_core.sh only supports --create-spec mode. Use discover.sh or resume.sh." >&2
exit 3
