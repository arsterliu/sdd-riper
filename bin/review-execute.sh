#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCAFFOLD_ROOT="$(dirname "$SCRIPT_DIR")"
source "$SCRIPT_DIR/_common.sh"

print_usage() {
  cat <<'EOF'
Usage: review-execute.sh <project-dir> [--spec <path>] [--log <path>]
Generate a four-axis review prompt:
  Axis 0: Invocation Integrity  (requirement/goal/constraints vs implementation)
  Axis 1: Spec Plan vs Code     (each Plan step → implemented?)
  Axis 2: Code Diff             (what actually changed, scope check)
  Axis 3: Execute Log Fidelity  (deviations in log vs actual code)
Exit codes: 0=success, 1=missing asset, 3=param error
EOF
}

if [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]]; then
  print_usage; exit 0
fi

TARGET_DIR="${1:-}"
SPEC_PATH=""
LOG_PATH=""
DIFF_BASE=""
shift || true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --spec) SPEC_PATH="${2:-}"; shift 2 ;;
    --log)  LOG_PATH="${2:-}"; shift 2 ;;
    --diff-base) DIFF_BASE="${2:-}"; shift 2 ;;
    *) echo "[ERROR] Unknown option: $1" >&2; exit 3 ;;
  esac
done

if [[ -z "$TARGET_DIR" ]]; then
  echo "[ERROR] Usage: review-execute.sh <project-dir>" >&2; exit 3
fi

DOCS_ROOT="$(_sdd_get_docs_root "$TARGET_DIR")"

if [[ ! -d "$DOCS_ROOT" ]]; then
  echo "[ERROR] Project not initialized. Run: sdd.sh init <dir>" >&2; exit 1
fi

# Locate LATEST_SPEC using versioned selection (same logic as _workflow_core.sh resume)
if [[ -z "$SPEC_PATH" ]]; then
  SPEC_PATH="$(_sdd_find_latest_spec "$DOCS_ROOT/specs")"
  
  # Fallback to mtime-based selection
  if [[ -z "$SPEC_PATH" ]]; then
    SPEC_PATH=$(find "$DOCS_ROOT/specs" -name "*.md" ! -name ".gitkeep" 2>/dev/null -print0 | xargs -0 ls -t 2>/dev/null | head -1 || echo "")
  fi
fi

resolve_diff_base() {
  local dir="$1" explicit_base="$2"
  local candidate merge_base commit_count root_commit head_commit current_branch

  head_commit=$(git -C "$dir" rev-parse HEAD 2>/dev/null || true)
  current_branch=$(git -C "$dir" rev-parse --abbrev-ref HEAD 2>/dev/null || true)

  if [[ -n "$explicit_base" ]]; then
    echo "$explicit_base"
    return
  fi

  for candidate in origin/main origin/master main master trunk; do
    if git -C "$dir" rev-parse --verify "$candidate" >/dev/null 2>&1; then
      if [[ "$candidate" == "$current_branch" ]]; then
        continue
      fi
      merge_base=$(git -C "$dir" merge-base HEAD "$candidate" 2>/dev/null || true)
      if [[ -n "$merge_base" && -n "$head_commit" && "$merge_base" != "$head_commit" ]]; then
        echo "$merge_base"
        return
      fi
    fi
  done

  commit_count=$(git -C "$dir" rev-list --count HEAD 2>/dev/null || echo 0)
  if [[ "$commit_count" -gt 1 ]]; then
    root_commit=$(git -C "$dir" rev-list --max-parents=0 HEAD 2>/dev/null | tail -1)
    head_commit=$(git -C "$dir" rev-parse HEAD 2>/dev/null || true)
    if [[ -n "$root_commit" && -n "$head_commit" && "$root_commit" != "$head_commit" ]]; then
      echo "$root_commit"
      return
    fi
    if git -C "$dir" rev-parse --verify HEAD~1 >/dev/null 2>&1; then
      echo "HEAD~1"
      return
    fi
  fi

  echo ""
}

# Helper: read section from spec (between two headings), truncate to N lines
read_section() {
  local file="$1" start_pat="$2" max_lines="${3:-100}"
  if [[ -z "$file" ]] || [[ ! -f "$file" ]]; then echo "(spec not found)"; return; fi
  # start_pat is internal-only. Do not pass user-provided regex fragments here.
  local raw
  raw=$(awk -v pat="$start_pat" 'BEGIN{found=0} $0 ~ ("^## .*" pat){found=1; next} found && /^## /{exit} found{print}' "$file" 2>/dev/null)
  local content
  content=$(printf '%s\n' "$raw" | awk -v max="$max_lines" 'NR <= max { print }')
  local total
  total=$(printf '%s\n' "$raw" | awk 'END { print NR }')
  if [[ -z "$content" ]]; then echo "(section not found or empty)"; return; fi
  echo "$content"
  if [[ "$total" -gt "$max_lines" ]]; then echo "[TRUNCATED: showed ${max_lines}/${total} lines]"; fi
}

# Axis 0: Invocation Integrity — extract from Spec body sections
REQUIREMENT_CONTENT="(section not found)"
CONSTRAINTS_CONTENT="(section not found)"
AXIS0_NOTE=""
if [[ -n "$SPEC_PATH" ]] && [[ -f "$SPEC_PATH" ]]; then
  REQUIREMENT_CONTENT=$(read_section "$SPEC_PATH" "Requirement" 50)
  CONSTRAINTS_CONTENT=$(read_section "$SPEC_PATH" "Constraint" 50)
fi
if [[ "$REQUIREMENT_CONTENT" == "(section not found or empty)" ]] || [[ "$REQUIREMENT_CONTENT" == "(spec not found)" ]]; then
  REQUIREMENT_CONTENT="(section not found)"
fi
if [[ "$CONSTRAINTS_CONTENT" == "(section not found or empty)" ]] || [[ "$CONSTRAINTS_CONTENT" == "(spec not found)" ]]; then
  CONSTRAINTS_CONTENT="(section not found)"
fi
if [[ "$REQUIREMENT_CONTENT" == "(section not found)" ]] && [[ "$CONSTRAINTS_CONTENT" == "(section not found)" ]]; then
  AXIS0_NOTE="[WARN] Invocation metadata not found in Spec. Axis 0 will be UNVERIFIABLE."
fi

# Axis 1: Spec Plan
PLAN_CONTENT="(no spec found)"
if [[ -n "$SPEC_PATH" ]] && [[ -f "$SPEC_PATH" ]]; then
  PLAN_CONTENT=$(read_section "$SPEC_PATH" "Plan" 100)
fi

# Axis 2: Code Diff
DIFF_BASE_RESOLVED="$(resolve_diff_base "$TARGET_DIR" "$DIFF_BASE")"
if [[ -n "$DIFF_BASE_RESOLVED" ]]; then
  DIFF_CONTENT=$(git -C "$TARGET_DIR" diff "$DIFF_BASE_RESOLVED" HEAD 2>/dev/null || echo "(no git diff available)")
  DIFF_SOURCE="${DIFF_BASE_RESOLVED}..HEAD"
else
  DIFF_CONTENT="(no git diff available)"
  DIFF_SOURCE="unavailable"
fi
if [[ -z "$DIFF_CONTENT" ]]; then
  DIFF_CONTENT="(no git diff available)"
fi
DIFF_LINES=$(echo "$DIFF_CONTENT" | wc -l | tr -d ' ')
if [[ "$DIFF_LINES" -gt 100 ]]; then
  DIFF_CONTENT=$(printf '%s\n' "$DIFF_CONTENT" | awk 'NR <= 100 { print }')
  DIFF_CONTENT="${DIFF_CONTENT}
[TRUNCATED: showed 100/${DIFF_LINES} lines]"
fi

# Axis 3: Execute Log
# Auto-infer log path from spec slug if --log not provided
if [[ -z "$LOG_PATH" ]] && [[ -n "$SPEC_PATH" ]] && [[ -f "$SPEC_PATH" ]]; then
  _spec_bname="$(basename "$SPEC_PATH" .md)"
  _inferred_log="$DOCS_ROOT/evidence/${_spec_bname}/execute.log"
  if [[ -f "$_inferred_log" ]]; then
    LOG_PATH="$_inferred_log"
  fi
fi

EXECUTE_LOG="(no execute log found)"
if [[ -n "$LOG_PATH" ]] && [[ -f "$LOG_PATH" ]]; then
  EXECUTE_LOG=$(tail -100 "$LOG_PATH")
  LOG_LINES=$(wc -l < "$LOG_PATH" | tr -d ' ')
  if [[ "$LOG_LINES" -gt 100 ]]; then EXECUTE_LOG="${EXECUTE_LOG}
[TRUNCATED: showed last 100/${LOG_LINES} lines]"; fi
elif [[ -n "$SPEC_PATH" ]] && [[ -f "$SPEC_PATH" ]]; then
  EXECUTE_LOG=$(read_section "$SPEC_PATH" "Execute Log" 100)
fi

cat <<EOF
## REVIEW EXECUTE PROMPT (4-Axis)

> Diff source: ${DIFF_SOURCE}
${AXIS0_NOTE:-}

### 轴0 — Invocation Integrity [CONFIRMATION]
Original Requirement (from Spec):
${REQUIREMENT_CONTENT}

Original Constraints (from Spec):
${CONSTRAINTS_CONTENT}

### 轴1 — Spec Plan Coverage [CONFIRMATION]
${PLAN_CONTENT}

### 轴2 — Code Diff Scope [PRIMARY]
${DIFF_CONTENT}

### 轴3 — Execute Log Fidelity [CONFIRMATION]
${EXECUTE_LOG}

### 指令
逐轴分析，输出以下格式：

> **轴角色说明**: Axis 2 是 '[PRIMARY]' — Review 的核心职责，全量 Diff 审计只能在此完成。Axis 0/1/3 是 '[CONFIRMATION]' 安全网。
>
> ⚠️ **上游门禁失效警告**: 若 Axis 0/1/3 出现 FAIL 判定，在 Verdict 输出中追加：
> "⚠️ UPSTREAM GATE FAILURE: This Axis [N] failure indicates the corresponding upstream gate (Gate [1/2/3]) did not catch this issue during [Research/Plan/Execute]. Recommend retrospective review of the upstream gate."
> Verdict 映射: Axis 0 FAIL → FAIL_SPEC | Axis 1 FAIL → FAIL_PLAN | Axis 3 FAIL → FAIL_CODE

#### Axis 0 — Invocation Integrity
Assessment: [does implementation serve original requirement/constraints?]
Finding: ALIGNED | DRIFTED | VIOLATED | UNVERIFIABLE

#### Axis 1 — Spec Plan Coverage
[For each Plan step: ✅ implemented / ❌ missing / ⚠️ partial]
Finding: FULL | PARTIAL | MISSING

#### Axis 2 — Code Diff Scope
[Within-Plan changes vs. out-of-Plan changes]
Finding: IN_SCOPE | OUT_OF_SCOPE_MINOR | OUT_OF_SCOPE_MAJOR

#### Axis 3 — Execute Log Fidelity
[Log deviations vs. actual code — match?]
Finding: FAITHFUL | DISCREPANCY

#### Defect Table (if any finding is not ALIGNED/FULL/IN_SCOPE/FAITHFUL)
| Defect | Axis | Severity | Rollback Target |
|--------|------|----------|-----------------|
| [desc] | [0-3]| HIGH/MED | Execute / Plan / Research+Plan |

#### Verdict
PASS | PASS_WITH_CONCERNS | FAIL_CODE | FAIL_PLAN | FAIL_SPEC

Verdict precedence (if multiple failures): FAIL_SPEC > FAIL_PLAN > FAIL_CODE.

#### Rollback Instruction (if FAIL)
- FAIL_CODE → Developer reopens Execute. Re-execute steps: [list step numbers]
- FAIL_PLAN → Developer reopens Plan. Plan issues: [describe]
- FAIL_SPEC → Developer reopens Research + Plan. Requirement concern: [describe]

#### Risk Register (if PASS_WITH_CONCERNS)
| Risk | Axis | Severity | Mitigation |
|------|------|----------|------------|

Record this verdict in Spec §10 as:
Review Pass N — <ISO-8601 timestamp> — <VERDICT>
EOF

exit 0
