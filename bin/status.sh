#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

PROJECT_DIR="${1:-}"
if [[ -z "$PROJECT_DIR" ]]; then
  echo "[ERROR] Usage: status.sh <project-dir>" >&2
  exit 3
fi

EXIT_CODE=0
DOCS_DIR="$(_sdd_get_docs_dir "$PROJECT_DIR")"
DOCS_ROOT="$PROJECT_DIR/$DOCS_DIR"

echo "[SDD Status] $PROJECT_DIR"

# --- Structure check ---
MISSING_DIRS=()
for d in specs codemap context archive evidence; do
  if [[ ! -d "$DOCS_ROOT/$d" ]]; then
    MISSING_DIRS+=("$DOCS_DIR/$d")
  fi
done
if [[ ${#MISSING_DIRS[@]} -eq 0 ]]; then
  echo "  Structure:    OK"
else
  echo "  Structure:    MISSING (${MISSING_DIRS[*]})"
  EXIT_CODE=1
fi

# --- AI Config check ---
AI_CONFIG_FOUND=""
for f in AGENTS.md CLAUDE.md .cursorrules .github/copilot-instructions.md; do
  if [[ -f "$PROJECT_DIR/$f" ]]; then
    AI_CONFIG_FOUND="$f"
    break
  fi
done
if [[ -n "$AI_CONFIG_FOUND" ]]; then
  echo "  AI Config:    OK ($AI_CONFIG_FOUND found)"
else
  echo "  AI Config:    WARN (none found)"
fi

# --- ProjectMap check ---
PM_FILE="$PROJECT_DIR/mydocs/projectmap.md"
PM_FILE="$DOCS_ROOT/projectmap.md"
if [[ -f "$PM_FILE" ]]; then
  HAS_NAME=$(grep -c "^name:" "$PM_FILE" 2>/dev/null || true)
  HAS_REPOS=$(grep -c "^repos:" "$PM_FILE" 2>/dev/null || true)
  if [[ "$HAS_NAME" -gt 0 ]] && [[ "$HAS_REPOS" -gt 0 ]]; then
    echo "  ProjectMap:   OK"
  else
    echo "  ProjectMap:   ERROR (broken frontmatter — missing name: or repos:)"
    [[ $EXIT_CODE -lt 2 ]] && EXIT_CODE=2
  fi
else
  echo "  ProjectMap:   WARN (no projectmap.md found)"
fi

# --- CodeMap governance check ---
CODEMAP_DIR="$PROJECT_DIR/mydocs/codemap"
CODEMAP_DIR="$DOCS_ROOT/codemap"
if [[ ! -d "$CODEMAP_DIR" ]]; then
  echo "  CodeMap:      WARN (codemap/ directory missing)"
elif ! find "$CODEMAP_DIR" -maxdepth 1 -name "*.md" ! -name ".gitkeep" 2>/dev/null | grep -q .; then
  echo "  CodeMap:      OK (none — create on demand for complex modules)"
else
  CODEMAP_FILES=()
  while IFS= read -r _f; do
    CODEMAP_FILES+=("$_f")
  done < <(find "$CODEMAP_DIR" -maxdepth 1 -name "*.md" ! -name ".gitkeep" 2>/dev/null | sort)
  CODEMAP_NAMES=()
  CODEMAP_MISSING_REASON=()
  for cm in "${CODEMAP_FILES[@]}"; do
    bname="$(basename "$cm")"
    CODEMAP_NAMES+=("${bname%.md}")
    if ! grep -q '^last-reason:' "$cm" 2>/dev/null; then
      CODEMAP_MISSING_REASON+=("$bname")
    fi
  done

  CODEMAP_LIST=$(printf '%s\n' "${CODEMAP_NAMES[@]}" | paste -sd ',' -)
  if [[ ${#CODEMAP_MISSING_REASON[@]} -gt 0 ]]; then
    echo "  CodeMap:      WARN (${#CODEMAP_FILES[@]} modules: $CODEMAP_LIST; missing last-reason in: ${CODEMAP_MISSING_REASON[*]})"
  else
    echo "  CodeMap:      OK (${#CODEMAP_FILES[@]} modules: $CODEMAP_LIST)"
  fi
fi

# --- Spec status summary ---
TOTAL=0; DRAFT=0; APPROVED=0; DONE=0
SPECS_DIR="$PROJECT_DIR/mydocs/specs"
SPECS_DIR="$DOCS_ROOT/specs"

WARN_RESEARCH=()
WARN_INNOVATE=()
WARN_PLAN=()
WARN_EXECUTE=()
WARN_REVIEW=()

# _section_is_empty <file> <section-pattern>
# Returns 0 (true/success) if the named section exists but contains no non-comment content.
# Returns 1 (false/failure) if the section has content or does not exist.
# Usage: if _section_is_empty "$spec" "Review Summary"; then WARN+=...
_section_is_empty() {
  local file="$1" section="$2"
  awk -v section="$section" '
    /^##/ { 
      if (in_section) { 
        if (had_content==0) exit 0; else exit 1 
      }
      if ($0 ~ section) { in_section=1; had_content=0; in_comment=0 }
      else { in_section=0 }
      next
    }
    in_section && /<!--/ { in_comment=1 }
    in_section && /-->/ { in_comment=0; next }
    in_section && !in_comment && NF>0 && !/^<!--/ { 
      had_content=1 
    }
    END { 
      if (in_section && had_content==0) exit 0; else exit 1 
    }
  ' "$file" 2>/dev/null
}

if [[ -d "$SPECS_DIR" ]]; then
  while IFS= read -r -d '' spec; do
    BNAME="$(basename "$spec")"
    [[ "$BNAME" == ".gitkeep" ]] && continue
    
    TOTAL=$((TOTAL+1))
    STATUS_VAL=$(grep "^status:" "$spec" 2>/dev/null | head -1 | sed 's/status: *//' | tr -d '[:space:]' || echo "draft")
    case "$STATUS_VAL" in
      approved) APPROVED=$((APPROVED+1)) ;;
      done)     DONE=$((DONE+1)) ;;
      *)        DRAFT=$((DRAFT+1)) ;;
    esac
    
    local_warn_research=0
    
    # Check Requirement Restatement
     if grep -q "^## Requirement Restatement" "$spec" 2>/dev/null; then
       if _section_is_empty "$spec" "Requirement Restatement"; then
         local_warn_research=1
       fi
     fi
     # Check Open Questions
     if grep -q "^## Open Questions" "$spec" 2>/dev/null; then
       if _section_is_empty "$spec" "Open Questions"; then
         local_warn_research=1
       fi
     fi
     # Check §6 Research Findings
     if grep -q "^## §6 Research Findings" "$spec" 2>/dev/null; then
       if _section_is_empty "$spec" "§6 Research Findings"; then
         local_warn_research=1
       fi
     fi
    # Check [待确认]
    if grep -q "\[待确认\]" "$spec" 2>/dev/null; then
      local_warn_research=1
    fi
    
    if [[ $local_warn_research -eq 1 ]]; then
      WARN_RESEARCH+=("$BNAME")
    fi

     # Check Innovate Options
     if grep -q "^## .*Innovate Options" "$spec" 2>/dev/null; then
       if ! grep -q "Innovate: Skipped" "$spec" 2>/dev/null; then
         if _section_is_empty "$spec" "Innovate Options"; then
           WARN_INNOVATE+=("$BNAME")
         fi
       fi
     fi

    # Check Plan Approved By
    if grep -q "Plan Approved By:" "$spec" 2>/dev/null; then
      if grep -q -E "Plan Approved By: *(\[.*\])?[[:space:]]*(<!--.*|-->.*)?$" "$spec" 2>/dev/null; then
        WARN_PLAN+=("$BNAME")
      fi
    fi

     # Check Execute Log
     if grep -q "^## .*Execute Log" "$spec" 2>/dev/null; then
       if _section_is_empty "$spec" "Execute Log"; then
         WARN_EXECUTE+=("$BNAME")
       fi
     fi

     # Check Review Verdict / Review Summary
     if grep -qE "^## .*Review (Verdict|Summary)" "$spec" 2>/dev/null; then
       if _section_is_empty "$spec" "Review (Verdict|Summary)"; then
         WARN_REVIEW+=("$BNAME")
       fi
     fi
    
  done < <(find "$SPECS_DIR" -maxdepth 1 -name "*.md" -print0 2>/dev/null || true)
fi

echo "  Specs:        $TOTAL total ($DRAFT draft, $APPROVED approved, $DONE done)"

if [[ ${#WARN_RESEARCH[@]} -gt 0 ]]; then
  echo "  Research:     WARN (empty/pending in: ${WARN_RESEARCH[*]})"
else
  echo "  Research:     OK"
fi

if [[ ${#WARN_INNOVATE[@]} -gt 0 ]]; then
  echo "  Innovate:     WARN (empty in: ${WARN_INNOVATE[*]})"
else
  echo "  Innovate:     OK"
fi

if [[ ${#WARN_PLAN[@]} -gt 0 ]]; then
  echo "  Plan:         WARN (missing approval in: ${WARN_PLAN[*]})"
else
  echo "  Plan:         OK"
fi

if [[ ${#WARN_EXECUTE[@]} -gt 0 ]]; then
  echo "  Execute:      WARN (empty log in: ${WARN_EXECUTE[*]})"
else
  echo "  Execute:      OK"
fi

if [[ ${#WARN_REVIEW[@]} -gt 0 ]]; then
  echo "  Review:       WARN (empty verdict in: ${WARN_REVIEW[*]})"
else
  echo "  Review:       OK"
fi

exit $EXIT_CODE
