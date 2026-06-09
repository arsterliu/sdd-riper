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
for d in specs codemap context archive; do
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
TOTAL=0; DRAFT=0
SPECS_DIR="$DOCS_ROOT/specs"

WARN_RESEARCH=()
WARN_INNOVATE=()
WARN_PLAN=()
WARN_REVIEW=()

if [[ -d "$SPECS_DIR" ]]; then
  while IFS= read -r -d '' spec; do
    BNAME="$(basename "$spec")"
    [[ "$BNAME" == ".gitkeep" ]] && continue

    TOTAL=$((TOTAL+1))
    STATUS_VAL=$(_sdd_get_frontmatter_field "$spec" "status")
    [[ -z "$STATUS_VAL" ]] && STATUS_VAL="draft"
    [[ "$STATUS_VAL" == "archived" ]] || DRAFT=$((DRAFT+1))

    SPEC_MODE=$(_sdd_get_frontmatter_field "$spec" "mode")
    [[ -z "$SPEC_MODE" ]] && SPEC_MODE="standard"

    local_warn_research=0

    if [[ "$SPEC_MODE" == "lite" ]]; then
      # Lite: ## Invocation and ## Open Questions must have content
      if grep -q "^## Invocation" "$spec" 2>/dev/null; then
        if _sdd_section_is_empty "$spec" "Invocation"; then local_warn_research=1; fi
      fi
      if grep -q "^## Open Questions" "$spec" 2>/dev/null; then
        if _sdd_section_is_empty "$spec" "Open Questions"; then local_warn_research=1; fi
      fi
    elif [[ "$SPEC_MODE" == "micro" ]]; then
      # Micro: Research / Innovate are skipped by design. Only ## Invocation and Plan must have content.
      if grep -q "^## Invocation" "$spec" 2>/dev/null; then
        if _sdd_section_is_empty "$spec" "Invocation"; then local_warn_research=1; fi
      fi
    else
      # Standard: ## Research must have content in ### subsections
      if grep -q "^## Research" "$spec" 2>/dev/null; then
        if _sdd_subsection_is_empty "$spec" "Requirement Restatement"; then local_warn_research=1; fi
        if _sdd_subsection_is_empty "$spec" "Open Questions"; then local_warn_research=1; fi
      fi
    fi

    if grep -q "\[待确认\]" "$spec" 2>/dev/null; then local_warn_research=1; fi
    if [[ $local_warn_research -eq 1 ]]; then WARN_RESEARCH+=("$BNAME"); fi

    # Innovate — ## Innovate Options (both modes)
    if grep -q "^## Innovate Options" "$spec" 2>/dev/null; then
      if ! grep -q "Innovate: Skipped" "$spec" 2>/dev/null; then
        if _sdd_section_is_empty "$spec" "Innovate Options"; then WARN_INNOVATE+=("$BNAME"); fi
      fi
    fi

    # Plan Approved By — same field in both modes
    if grep -q "Plan Approved By:" "$spec" 2>/dev/null; then
      if grep -q -E "^Plan Approved By:[[:space:]]*$" "$spec" 2>/dev/null; then
        WARN_PLAN+=("$BNAME")
      fi
    fi

    # Review — ## Review Verdict (standard) or ## Review Summary (lite)
    if grep -qE "^## (Review Verdict|Review Summary)" "$spec" 2>/dev/null; then
      if _sdd_section_is_empty "$spec" "Review (Verdict|Summary)"; then WARN_REVIEW+=("$BNAME"); fi
    fi

  done < <(find "$SPECS_DIR" -maxdepth 1 -name "*.md" -print0 2>/dev/null || true)
fi

echo "  Specs:        $TOTAL total ($DRAFT active)"

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

if [[ ${#WARN_REVIEW[@]} -gt 0 ]]; then
  echo "  Review:       WARN (empty verdict in: ${WARN_REVIEW[*]})"
else
  echo "  Review:       OK"
fi

exit $EXIT_CODE
