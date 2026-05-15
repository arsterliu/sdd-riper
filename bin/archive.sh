#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCAFFOLD_ROOT="$(dirname "$SCRIPT_DIR")"
source "$SCRIPT_DIR/_common.sh"

PROJECT_DIR=""
SPEC_NAME=""
FORCE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force) FORCE="1"; shift ;;
    -*) echo "[ERROR] Unknown option: $1" >&2; exit 3 ;;
    *)
      if [[ -z "$PROJECT_DIR" ]]; then PROJECT_DIR="$1"
      elif [[ -z "$SPEC_NAME" ]]; then SPEC_NAME="$1"
      fi
      shift ;;
  esac
done

if [[ -z "$PROJECT_DIR" ]] || [[ -z "$SPEC_NAME" ]]; then
  echo "[ERROR] Usage: archive.sh <project-dir> <spec-name> [--force]" >&2
  exit 3
fi

DOCS_ROOT="$(_sdd_get_docs_root "$PROJECT_DIR")"
SPECS_DIR="$DOCS_ROOT/specs"
ARCHIVE_DIR="$DOCS_ROOT/archive"

if [[ ! -d "$SPECS_DIR" ]]; then
  echo "[ERROR] $SPECS_DIR not found. Run 'sdd init $PROJECT_DIR' first." >&2
  exit 1
fi
mkdir -p "$ARCHIVE_DIR"

SPEC_SLUG="${SPEC_NAME// /-}"

SOURCE_SPEC="$(_sdd_find_source_spec "$SPECS_DIR" "$SPEC_SLUG")"
if [[ -z "$SOURCE_SPEC" ]]; then
  echo "[ERROR] No versioned spec matching '${SPEC_SLUG}' found in $SPECS_DIR" >&2
  echo "  Available specs:" >&2
  find "$SPECS_DIR" -name "*.md" ! -name ".gitkeep" 2>/dev/null | sort | while read -r f; do
    echo "    $(basename "$f")" >&2
  done
  exit 1
fi

SOURCE_BNAME="$(basename "$SOURCE_SPEC")"
SPEC_VERSION=""
if [[ "$SOURCE_BNAME" =~ ^(v[0-9]+\.[0-9]+)-.+\.md$ ]]; then
  SPEC_VERSION="${BASH_REMATCH[1]}"
else
  SPEC_VERSION="v1.0"
  echo "[WARN] Source spec '${SOURCE_BNAME}' has no version prefix; defaulting archive version to v1.0" >&2
fi

ARCHIVE_FILE="$ARCHIVE_DIR/${SPEC_VERSION}-${SPEC_SLUG}.md"

if [[ -f "$ARCHIVE_FILE" ]]; then
  if [[ -z "$FORCE" ]]; then
    echo "[ERROR] Archive '${SPEC_VERSION}-${SPEC_SLUG}.md' already exists. Use --force to overwrite." >&2
    exit 1
  fi
fi

DATE_ISO="$(date +%Y-%m-%d)"

# Mark source spec as archived
sed -i.bak 's/^status:[[:space:]]*[^[:space:]#]*/status: archived/' "$SOURCE_SPEC" && rm -f "$SOURCE_SPEC.bak"

# Append summary scaffold to the spec (AI will fill these in during Archive Phase step 3)
cat >> "$SOURCE_SPEC" <<SUMMARY_EOF

---
<!-- Archive summary — appended by sdd archive on ${DATE_ISO} -->

## 目标摘要
<!-- (未填充) -->

## 最终方案
<!-- (未填充) -->

## 关键约束
<!-- (未填充) -->

## 坑点与风险
<!-- (未填充) -->
SUMMARY_EOF

# Move spec into archive/
mv "$SOURCE_SPEC" "$ARCHIVE_FILE"

# Maintain archive/index.md
INDEX_FILE="$ARCHIVE_DIR/index.md"
if [[ ! -f "$INDEX_FILE" ]]; then
  cat > "$INDEX_FILE" <<'INDEX_HEADER'
# Archive Index
<!-- Auto-maintained by sdd archive. Do NOT edit manually. -->
<!-- Format: | version-slug | date | task-name | verdict | -->

| File | Date | Task | Verdict |
|---|---|---|---|
INDEX_HEADER
fi

TASK_NAME_VAL=$(grep "^task-name:" "$ARCHIVE_FILE" 2>/dev/null | head -1 | sed 's/task-name:[[:space:]]*//' | tr -d '"' || echo "$SPEC_SLUG")
VERDICT_VAL=$(grep -E "^## (Review Verdict|Review Summary)" "$ARCHIVE_FILE" 2>/dev/null | head -1 | sed 's/^## //' || echo "—")
# Try to extract a short verdict from the section content
_verdict_content=$(awk '/^## (Review Verdict|Review Summary)/{found=1; next} found && /^## /{exit} found{print}' "$ARCHIVE_FILE" 2>/dev/null | grep -v '^<!--' | grep -v '^[[:space:]]*$' | head -1 || true)
if [[ -n "$_verdict_content" ]]; then
  VERDICT_VAL="$_verdict_content"
fi

echo "| $(basename "$ARCHIVE_FILE") | ${DATE_ISO} | ${TASK_NAME_VAL} | ${VERDICT_VAL} |" >> "$INDEX_FILE"

echo "[ARCHIVE] $ARCHIVE_FILE"
echo "[INDEX]   $INDEX_FILE"
echo "[MOVED] $(basename "$SOURCE_SPEC") → archive/$(basename "$ARCHIVE_FILE")"
exit 0
