#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCAFFOLD_ROOT="$(dirname "$SCRIPT_DIR")"

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

SPECS_DIR="$PROJECT_DIR/mydocs/specs"
ARCHIVE_DIR="$PROJECT_DIR/mydocs/archive"

if [[ ! -d "$SPECS_DIR" ]]; then
  echo "[ERROR] $SPECS_DIR not found. Run 'sdd init $PROJECT_DIR' first." >&2
  exit 1
fi
mkdir -p "$ARCHIVE_DIR"

# Normalize input slug (replace spaces with hyphens)
SPEC_SLUG="${SPEC_NAME// /-}"

# Find the highest-versioned spec matching the logical name.
# Accepts either:
#   - full versioned filename:   v1.1-user-login
#   - logical name only:         user-login  (auto-selects highest version)
_find_source_spec() {
  local dir="$1" slug="$2"
  local best_file="" best_major=0 best_minor=-1
  local f bname vmaj vmin
  while IFS= read -r -d '' f; do
    bname="$(basename "$f")"
    [[ "$bname" == ".gitkeep" ]] && continue
    if [[ "$bname" =~ ^v([0-9]+)\.([0-9]+)-(.+)\.md$ ]]; then
      local file_slug="${BASH_REMATCH[3]}"
      vmaj="${BASH_REMATCH[1]}"
      vmin="${BASH_REMATCH[2]}"
      if [[ "$file_slug" == "$slug" ]]; then
        if (( vmaj > best_major )) || (( vmaj == best_major && vmin > best_minor )); then
          best_major=$vmaj
          best_minor=$vmin
          best_file="$f"
        fi
      fi
    elif [[ "${bname%.md}" == "$slug" ]]; then
      best_file="$f"
      break
    fi
  done < <(find "$dir" -maxdepth 1 -name "*.md" -print0 2>/dev/null)
  echo "$best_file"
}

SOURCE_SPEC="$(_find_source_spec "$SPECS_DIR" "$SPEC_SLUG")"

if [[ -z "$SOURCE_SPEC" ]]; then
  echo "[ERROR] No versioned spec matching '${SPEC_SLUG}' found in $SPECS_DIR" >&2
  echo "  Available specs:" >&2
  find "$SPECS_DIR" -name "*.md" ! -name ".gitkeep" 2>/dev/null | sort | while read -r f; do
    echo "    $(basename "$f")" >&2
  done
  exit 1
fi

# Extract version from source spec filename: vN.M-slug.md
SOURCE_BNAME="$(basename "$SOURCE_SPEC")"
SPEC_VERSION=""
if [[ "$SOURCE_BNAME" =~ ^(v[0-9]+\.[0-9]+)-.+\.md$ ]]; then
  SPEC_VERSION="${BASH_REMATCH[1]}"
else
  SPEC_VERSION="v1.0"
  echo "[WARN] Source spec '${SOURCE_BNAME}' has no version prefix; defaulting archive version to v1.0" >&2
fi

HUMAN_FILE="$ARCHIVE_DIR/${SPEC_VERSION}-${SPEC_SLUG}-human.md"
LLM_FILE="$ARCHIVE_DIR/${SPEC_VERSION}-${SPEC_SLUG}-llm.md"

if [[ -f "$HUMAN_FILE" ]] || [[ -f "$LLM_FILE" ]]; then
  if [[ -z "$FORCE" ]]; then
    echo "[ERROR] Archive '${SPEC_VERSION}-${SPEC_SLUG}' already exists. Use --force to overwrite." >&2
    exit 1
  fi
fi

TASK_NAME_VAL=$(grep "^task-name:" "$SOURCE_SPEC" 2>/dev/null | head -1 | sed 's/task-name: *//' | tr -d '"' || echo "$SPEC_SLUG")
DATE_ISO="$(date +%Y-%m-%d)"

cp "$SCAFFOLD_ROOT/templates/archive-human.md" "$HUMAN_FILE"
sed -i.bak "s/task-name: \"Task Name\"/task-name: \"${TASK_NAME_VAL}\"/g" "$HUMAN_FILE" && rm -f "$HUMAN_FILE.bak"
sed -i.bak "s/date: YYYY-MM-DD/date: ${DATE_ISO}/g" "$HUMAN_FILE" && rm -f "$HUMAN_FILE.bak"
echo "" >> "$HUMAN_FILE"
echo "<!-- Source Spec: $(basename "$SOURCE_SPEC") -->" >> "$HUMAN_FILE"

# Generate _llm.md from template
cp "$SCAFFOLD_ROOT/templates/archive-llm.md" "$LLM_FILE"
sed -i.bak "s/task-name: \"Task Name\"/task-name: \"${TASK_NAME_VAL}\"/g" "$LLM_FILE" && rm -f "$LLM_FILE.bak"
sed -i.bak "s/date: YYYY-MM-DD/date: ${DATE_ISO}/g" "$LLM_FILE" && rm -f "$LLM_FILE.bak"
echo "" >> "$LLM_FILE"
echo "<!-- Source Spec: $(basename "$SOURCE_SPEC") -->" >> "$LLM_FILE"

echo "[CREATE] $HUMAN_FILE"
echo "[CREATE] $LLM_FILE"
echo "Original spec preserved: $SOURCE_SPEC"
exit 0