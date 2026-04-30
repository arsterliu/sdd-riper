#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

print_usage() {
  cat <<'EOF'
Usage: resume.sh <project-dir>

Resume an existing task by loading the latest project context and phase hint.

Options:
  -h, --help            Show this help

Exit codes: 0=success, 1=missing asset, 3=param error
EOF
}

if [[ $# -eq 0 ]] || [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]]; then
  print_usage
  exit 0
fi

for arg in "$@"; do
  if [[ "$arg" == "--create-spec" || "$arg" == --create-spec=* ]]; then
    echo "[ERROR] --create-spec is not valid for resume. Use: sdd discover <dir> --task-name <name>" >&2
    exit 3
  fi
done

TARGET_DIR="${1:-}"
if [[ -z "$TARGET_DIR" ]]; then
  echo "[ERROR] Usage: sdd resume <project-dir>" >&2
  exit 3
fi

DOCS_DIR="$(_sdd_get_docs_dir "$TARGET_DIR")"
DOCS_ROOT="$TARGET_DIR/$DOCS_DIR"

if [[ ! -d "$DOCS_ROOT" ]]; then
  echo "[ERROR] Project not initialized. Run: sdd.sh init <dir>" >&2
  exit 1
fi

SPECS_DIR="$DOCS_ROOT/specs"
SPEC_COUNT=$(find "$SPECS_DIR" -name "*.md" ! -name ".gitkeep" 2>/dev/null | wc -l | tr -d ' ')

_latest_spec_stderr_file="$(mktemp)"
LATEST_SPEC="$(_sdd_find_latest_spec "$SPECS_DIR" 2>"$_latest_spec_stderr_file")"
while IFS= read -r _line; do
  [[ -z "$_line" ]] && continue
  if [[ "$_line" =~ ^\[WARN\]\ Legacy\ unversioned\ spec\ found:\ (.+)$ ]]; then
    echo "[WARN] Legacy unversioned spec found (ignored by resume): ${BASH_REMATCH[1]}" >&2
  else
    echo "$_line" >&2
  fi
done < "$_latest_spec_stderr_file"
rm -f "$_latest_spec_stderr_file"

if [[ -z "$LATEST_SPEC" ]]; then
  LATEST_SPEC=$(find "$SPECS_DIR" -name "*.md" ! -name ".gitkeep" 2>/dev/null -print0 | xargs -0 ls -t 2>/dev/null | head -1 || echo "")
fi

SPEC_STATUS="none"
PHASE_HINT="unknown"
if [[ -n "$LATEST_SPEC" && -f "$LATEST_SPEC" ]]; then
  SPEC_STATUS=$(grep "^status:" "$LATEST_SPEC" 2>/dev/null | head -1 | sed 's/status: *//; s/#.*$//' | tr -d '[:space:]' || echo "none")

  if grep -q -E "^[[:space:]]*Plan Approved By:" "$LATEST_SPEC" 2>/dev/null; then
    if grep -q -E "^[[:space:]]*Plan Approved By:[[:space:]]*[^[:space:]].*" "$LATEST_SPEC" 2>/dev/null; then
      case "$SPEC_STATUS" in
        approved) PHASE_HINT="review" ;;
        done)     PHASE_HINT="archive" ;;
        archived) PHASE_HINT="new_task" ;;
        *)        PHASE_HINT="execute" ;;
      esac
    else
      PHASE_HINT="research_or_plan"
    fi
  else
    case "$SPEC_STATUS" in
      approved) PHASE_HINT="review" ;;
      done)     PHASE_HINT="archive" ;;
      archived) PHASE_HINT="new_task" ;;
      *)        PHASE_HINT="research_or_plan" ;;
    esac
  fi
else
  PHASE_HINT="new_task"
fi

HAS_CODEMAP="no"
CODEMAP_MODULES=""
if [[ -d "$DOCS_ROOT/codemap" ]]; then
  CODEMAP_FILES=$(find "$DOCS_ROOT/codemap" -name "*.md" ! -name ".gitkeep" 2>/dev/null | sort)
  if [[ -n "$CODEMAP_FILES" ]]; then
    CODEMAP_COUNT=$(printf '%s\n' "$CODEMAP_FILES" | grep -c .)
  else
    CODEMAP_COUNT=0
  fi
  if [[ "$CODEMAP_COUNT" -gt 0 ]]; then
    HAS_CODEMAP="yes"
    CODEMAP_MODULES=$(printf '%s\n' "$CODEMAP_FILES" | while IFS= read -r f; do basename "$f" .md; done | paste -sd ',' -)
  fi
fi

HAS_PROJECTMAP="no"
if [[ -f "$DOCS_ROOT/projectmap.md" ]]; then
  HAS_PROJECTMAP="yes"
fi

echo "[SDD Resume] $TARGET_DIR"
echo "DOCS_DIR: $DOCS_DIR"
echo "ACTIVE_SPECS: $SPEC_COUNT"
echo "LATEST_SPEC: ${LATEST_SPEC:-none}"
echo "SPEC_STATUS: $SPEC_STATUS"
echo "HAS_CODEMAP: $HAS_CODEMAP"
if [[ "$HAS_CODEMAP" == "yes" ]]; then
  echo "CODEMAP_MODULES: $CODEMAP_MODULES"
fi
echo "HAS_PROJECTMAP: $HAS_PROJECTMAP"
echo "PHASE_HINT: $PHASE_HINT"
exit 0
