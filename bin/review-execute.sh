#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCAFFOLD_ROOT="$(dirname "$SCRIPT_DIR")"
source "$SCRIPT_DIR/_common.sh"

print_usage() {
  cat <<'EOF'
Usage: review-execute.sh <project-dir> [--spec <path>] [--diff-base <rev>]
Generate a four-axis review prompt:
  Axis 0: Invocation Integrity  (requirement/goal/constraints vs implementation)
  Axis 1: Spec Plan vs Code     (each Plan step → implemented?)
  Axis 2: Code Diff             (what actually changed, scope check)
  Axis 3: Execute Log Fidelity  (deviations in ## Execute Log section of Spec vs actual code)
Exit codes: 0=success, 1=missing asset, 3=param error
EOF
}

if [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]]; then
  print_usage; exit 0
fi

TARGET_DIR="${1:-}"
SPEC_PATH=""
DIFF_BASE=""
shift || true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --spec) SPEC_PATH="${2:-}"; shift 2 ;;
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

# Axis 0: Invocation Integrity — read ## Invocation section
INVOCATION_CONTENT="(section not found)"
AXIS0_NOTE=""
if [[ -n "$SPEC_PATH" ]] && [[ -f "$SPEC_PATH" ]]; then
  INVOCATION_CONTENT=$(_sdd_extract_section "$SPEC_PATH" "Invocation" 80)
fi
if [[ -z "$INVOCATION_CONTENT" ]]; then
  INVOCATION_CONTENT="(section not found)"
  AXIS0_NOTE="[WARN] Invocation metadata not found in Spec. Axis 0 will be UNVERIFIABLE."
fi

# Axis 1: Spec Plan
PLAN_CONTENT="(no spec found)"
if [[ -n "$SPEC_PATH" ]] && [[ -f "$SPEC_PATH" ]]; then
  _plan=$(_sdd_extract_section "$SPEC_PATH" "Plan" 100)
  [[ -n "$_plan" ]] && PLAN_CONTENT="$_plan" || PLAN_CONTENT="(section not found or empty)"
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

# Axis 3: Execute Log — read ## Execute Log section from Spec
EXECUTE_LOG="(no Execute Log section found in Spec — write step records to ## Execute Log in the Spec file)"
if [[ -n "$SPEC_PATH" ]] && [[ -f "$SPEC_PATH" ]]; then
  _raw_log=$(_sdd_extract_section "$SPEC_PATH" "Execute Log" 100)
  if [[ -n "$_raw_log" ]]; then
    EXECUTE_LOG="$_raw_log"
  fi
fi

cat <<EOF
## REVIEW EXECUTE PROMPT (4-Axis)

> Diff source: ${DIFF_SOURCE}
${AXIS0_NOTE:-}

### 轴0 — Invocation Integrity [CONFIRMATION]
Invocation (from Spec):
${INVOCATION_CONTENT}

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
