#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCAFFOLD_ROOT="$(dirname "$SCRIPT_DIR")"

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
shift || true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --spec) SPEC_PATH="${2:-}"; shift 2 ;;
    --log)  LOG_PATH="${2:-}"; shift 2 ;;
    *) echo "[ERROR] Unknown option: $1" >&2; exit 3 ;;
  esac
done

if [[ -z "$TARGET_DIR" ]]; then
  echo "[ERROR] Usage: review-execute.sh <project-dir>" >&2; exit 3
fi

if [[ ! -d "$TARGET_DIR/mydocs" ]]; then
  echo "[ERROR] Project not initialized. Run: sdd.sh init <dir>" >&2; exit 1
fi

# Locate LATEST_SPEC using versioned selection (same logic as _workflow_core.sh resume)
if [[ -z "$SPEC_PATH" ]]; then
  # Warn about legacy unversioned specs
  while IFS= read -r -d '' _f; do
    _bname="$(basename "$_f")"
    if [[ ! "$_bname" =~ ^v[0-9]+\.[0-9]+-.+\.md$ ]]; then
      echo "[WARN] Legacy unversioned spec found (ignored): $_bname" >&2
    fi
  done < <(find "$TARGET_DIR/mydocs/specs" -name "*.md" ! -name ".gitkeep" -print0 2>/dev/null)

  # Select highest-versioned spec of the most-recently-modified task
  declare -A _TASK_MTIME
  while IFS= read -r -d '' _f; do
    _bname="$(basename "$_f")"
    if [[ "$_bname" =~ ^v([0-9]+)\.([0-9]+)-(.+)\.md$ ]]; then
      _tname="${BASH_REMATCH[3]}"
      _mtime=$(stat -c '%Y' "$_f" 2>/dev/null || stat -f '%m' "$_f" 2>/dev/null || echo 0)
      if [[ -z "${_TASK_MTIME[$_tname]+x}" ]] || (( _mtime > _TASK_MTIME[$_tname] )); then
        _TASK_MTIME[$_tname]=$_mtime
      fi
    fi
  done < <(find "$TARGET_DIR/mydocs/specs" -name "*.md" ! -name ".gitkeep" -print0 2>/dev/null)

  _LATEST_TASK=""
  _LATEST_MTIME=0
  for _tname in "${!_TASK_MTIME[@]}"; do
    if (( _TASK_MTIME[$_tname] > _LATEST_MTIME )); then
      _LATEST_MTIME=${_TASK_MTIME[$_tname]}
      _LATEST_TASK=$_tname
    fi
  done

  if [[ -n "$_LATEST_TASK" ]]; then
    _best_major=0; _best_minor=-1
    while IFS= read -r -d '' _f; do
      _bname="$(basename "$_f")"
      if [[ "$_bname" =~ ^v([0-9]+)\.([0-9]+)-${_LATEST_TASK}\.md$ ]]; then
        _vmaj="${BASH_REMATCH[1]}"; _vmin="${BASH_REMATCH[2]}"
        if (( _vmaj > _best_major )) || (( _vmaj == _best_major && _vmin > _best_minor )); then
          _best_major=$_vmaj; _best_minor=$_vmin
          SPEC_PATH="$_f"
        fi
      fi
    done < <(find "$TARGET_DIR/mydocs/specs" -name "*.md" ! -name ".gitkeep" -print0 2>/dev/null)
  fi

  # Fallback to mtime-based selection
  if [[ -z "$SPEC_PATH" ]]; then
    SPEC_PATH=$(find "$TARGET_DIR/mydocs/specs" -name "*.md" ! -name ".gitkeep" 2>/dev/null -print0 | xargs -0 ls -t 2>/dev/null | head -1 || echo "")
  fi
fi

# Helper: read section from spec (between two headings), truncate to N lines
read_section() {
  local file="$1" start_pat="$2" max_lines="${3:-100}"
  if [[ -z "$file" ]] || [[ ! -f "$file" ]]; then echo "(spec not found)"; return; fi
  # start_pat is internal-only. Do not pass user-provided regex fragments here.
  local raw
  raw=$(awk -v pat="$start_pat" 'BEGIN{found=0} $0 ~ ("^## .*" pat){found=1; next} found && /^## /{exit} found{print}' "$file" 2>/dev/null)
  local content
  content=$(printf '%s\n' "$raw" | head -"$max_lines")
  local total
  total=$(printf '%s\n' "$raw" | wc -l | tr -d ' ')
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
DIFF_CONTENT=$(git -C "$TARGET_DIR" diff HEAD~1 HEAD 2>/dev/null || echo "(no git diff available)")
DIFF_LINES=$(echo "$DIFF_CONTENT" | wc -l | tr -d ' ')
if [[ "$DIFF_LINES" -gt 100 ]]; then
  DIFF_CONTENT=$(printf '%s\n' "$DIFF_CONTENT" | head -100)
  DIFF_CONTENT="${DIFF_CONTENT}
[TRUNCATED: showed 100/${DIFF_LINES} lines]"
fi

# Axis 3: Execute Log
# Auto-infer log path from spec slug if --log not provided
if [[ -z "$LOG_PATH" ]] && [[ -n "$SPEC_PATH" ]] && [[ -f "$SPEC_PATH" ]]; then
  _spec_bname="$(basename "$SPEC_PATH" .md)"
  _inferred_log="$TARGET_DIR/mydocs/evidence/${_spec_bname}/execute.log"
  if [[ -f "$_inferred_log" ]]; then
    LOG_PATH="$_inferred_log"
  else
    echo "[INFO] Execute log not found at inferred path: ${_inferred_log} (falling back to Spec section)" >&2
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

> Known limitation: Code Diff covers only HEAD~1..HEAD (last commit).
> For multi-commit tasks, consider providing a broader diff.
${AXIS0_NOTE:-}

### 轴0 — Invocation Integrity
Original Requirement (from Spec):
${REQUIREMENT_CONTENT}

Original Constraints (from Spec):
${CONSTRAINTS_CONTENT}

### 轴1 — Spec Plan Coverage
${PLAN_CONTENT}

### 轴2 — Code Diff Scope
${DIFF_CONTENT}

### 轴3 — Execute Log Fidelity
${EXECUTE_LOG}

### 指令
逐轴分析，输出以下格式：

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
