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
  --version v{N}.{M}    Version for this spec (required, e.g. v1.0)
  --mode <mode>         Spec mode: standard | lite | micro (default: project .sdd-config)
  --requirement <text>  Requirement definition
  --goal <text>         Goal statement
  --constraints <text>  Technical or business constraints
  --context <text>      Background context
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
MODE_OVERRIDE=""

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
    --mode)        MODE_OVERRIDE="${2:-}"; shift 2 ;;
    *) echo "[ERROR] Unknown option: $1" >&2; exit 3 ;;
  esac
done

if [[ -z "$TARGET_DIR" ]]; then
  echo "[ERROR] Usage: sdd discover <project-dir> --task-name <name>" >&2; exit 3
fi
DOCS_DIR="$(_sdd_get_docs_dir "$TARGET_DIR")"
DOCS_ROOT="$TARGET_DIR/$DOCS_DIR"
MODE="$(_sdd_get_mode "$TARGET_DIR")"
if [[ -n "$MODE_OVERRIDE" ]]; then
  case "$MODE_OVERRIDE" in
    standard|lite|micro) MODE="$MODE_OVERRIDE" ;;
    *) echo "[ERROR] Invalid --mode value: '${MODE_OVERRIDE}'. Expected: standard | lite | micro" >&2; exit 3 ;;
  esac
fi
if [[ ! -d "$DOCS_ROOT" ]]; then
  echo "[ERROR] Project not initialized. Run: sdd.sh init <dir>" >&2; exit 1
fi
if [[ -z "$TASK_NAME" ]]; then
  echo "[ERROR] --task-name is required" >&2; exit 3
fi
if [[ ! "$TASK_NAME" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "[ERROR] Invalid --task-name: use only letters, numbers, hyphens, and underscores" >&2; exit 3
fi

SPEC_TEMPLATE="$(_sdd_get_spec_template "$SCAFFOLD_ROOT" "$TARGET_DIR" "$MODE")"
if [[ ! -f "$SPEC_TEMPLATE" ]]; then
  echo "[ERROR] spec template not found at: $SPEC_TEMPLATE" >&2; exit 1
fi

SPECS_DIR="$DOCS_ROOT/specs"
if [[ -z "$VERSION_OVERRIDE" ]]; then
  echo "[ERROR] --version is required (e.g. --version v1.0)" >&2; exit 3
fi
if [[ ! "$VERSION_OVERRIDE" =~ ^v[0-9]+\.[0-9]+$ ]]; then
  echo "[ERROR] Invalid --version format: '${VERSION_OVERRIDE}'. Expected: v{N}.{M} (e.g. v1.0, v2.3)" >&2; exit 3
fi
if _sdd_version_exists "$SPECS_DIR" "$TASK_NAME" "$VERSION_OVERRIDE"; then
  echo "[ERROR] Spec '${VERSION_OVERRIDE}-${TASK_NAME}.md' already exists. Choose a different version." >&2; exit 1
fi
SPEC_VERSION="$VERSION_OVERRIDE"
SPEC_OUT="$SPECS_DIR/${SPEC_VERSION}-${TASK_NAME}.md"
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

# Write template content with substitutions applied via awk (safe against '/' and glob chars).
# Strategy:
#   Pass each replacement value through a temp file so awk reads it as literal text,
#   avoiding any shell quoting or awk special-character issues.
_task_name_file="$(mktemp)"
_invocation_file="$(mktemp)"
trap 'rm -f "$_task_name_file" "$_invocation_file"' EXIT
printf '%s' "$TASK_NAME"          > "$_task_name_file"
printf '%s' "$INVOCATION_CONTENT" > "$_invocation_file"

SPEC_CONTENT=$(awk \
  -v task_name_file="$_task_name_file" \
  -v invocation_file="$_invocation_file" \
  -v placeholder="$INVOCATION_PLACEHOLDER" \
  'BEGIN {
    # Read replacement values from files to avoid awk special-char issues
    getline task_name  < task_name_file
    close(task_name_file)
    # Invocation may be multi-line; read entire file
    invocation = ""
    while ((getline line < invocation_file) > 0) {
      invocation = (invocation == "") ? line : invocation "\n" line
    }
    close(invocation_file)
  }
  {
    # Replace task-name placeholder (literal string, no regex needed)
    gsub(/task-name: "Task Name Placeholder"/, "task-name: \"" task_name "\"")
    # Replace invocation placeholder
    if (index($0, placeholder) > 0) {
      n = split($0, parts, placeholder)
      line = parts[1]
      for (i = 2; i <= n; i++) {
        line = line invocation parts[i]
      }
      print line
    } else {
      print
    }
  }' <<< "$SPEC_CONTENT")

rm -f "$_task_name_file" "$_invocation_file"
trap - EXIT

# Write the spec file
printf '%s\n' "$SPEC_CONTENT" > "$SPEC_OUT"

# Advisory: suggest CodeMap if project has substantial code and no codemap yet
# Use || true so set -e doesn't treat "no suggestion needed" (exit 1) as failure.
_sdd_should_suggest_codemap "$TARGET_DIR" "$DOCS_DIR" || true

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
请读取上述 Spec 文件，按以下顺序完善 Research 区块：
- Requirement（需求定义）: ${REQUIREMENT:-"(待填充)"}
- Goal（目标）: ${GOAL:-"(待填充)"}
- Constraints（约束）: ${CONSTRAINTS:-"(待填充)"}
- Context（背景）: ${CONTEXT_TEXT:-"(待填充)"}

在 Spec Research 区块中，严格按顺序执行：
0. **Requirement Review（document-first with gate）**：一次性完成 6 维度苏格拉底式审视，把所有发现按格式写入 Spec `### Requirement Review` 区块，**不要实时一次一题追问**（避免主上下文被 Q&A 污染）：
   - 6 维度（逐一检查）：边界 / 异常路径 / 约束真实性 / 验收标准 / 内部冲突 / 目标验证
   - 输出格式：① 维度状态表（每行 ✅/⚠️/❌） ② 对 ⚠️/❌ 列 Open Question + Tentative Assumption + Impact-if-wrong ③ Premise List（隐含前提编号 P1/P2/…）
   - 写完后**触发门禁** AskUserQuestion：选择 A) STOP（用户线下澄清，Spec 保持 draft） 或 B) CONTINUE（接受 Tentative Assumptions，复制到 ### Assumptions 区块，进入 Findings）
   - 若 6 维度全 ✅ Clear，可省略门禁直接进入 Findings，但 Premise List 仍要写
1. 采集 Findings（代码位置 / 调用链 / 依赖关系）
2. 从 Findings 识别 2-5 个技术 Open Questions
3. 将 constraints 与 Tentative Assumptions 记录到 Assumptions 区块
4. 最后基于以上三项写 Confirmed Requirement（首轮为基准版本，后续迭代追加 Revised — Round N，不覆盖）
5. **Mode Recommendation Gate**（micro 模式跳过）：用 5 维度（Scope / Architecture impact / Cross-cutting / Test surface / Uncertainty）评估任务复杂度（每维 0/1/2），总分映射 mode 0-2 micro / 3-5 lite / 6+ standard；输出评分明细 + 推荐；用 AskUserQuestion 让用户接受 / 升级 / 降级 / 回 Research；用户选完后用 Edit 工具更新 Spec frontmatter 的 `mode:` 字段
   - **不依赖 raw `### Requirement` 字符数**——复杂度信号来自 Confirmed Requirement + Findings 的实质内容，不是文本长度

若当前任务涉及陌生或复杂模块，请在进入深入 Research 前执行以下检查：
- 先查看 mydocs/codemap/ 是否已有对应模块的 CodeMap，已有则优先复用
- 若没有现成 CodeMap，且模块结构/调用链较复杂，再运行: ./sdd.sh create-codemap <project-dir> --module <module-name>
- 任务结束前，如本次实现改变了入口点、核心调用链、外部依赖或风险项，请反向更新对应 CodeMap
EOF
fi
exit 0
