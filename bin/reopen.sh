#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCAFFOLD_ROOT="$(dirname "$SCRIPT_DIR")"
source "$SCRIPT_DIR/_common.sh"

print_usage() {
  cat <<'EOF'
Usage: reopen.sh <project-dir> <spec-name> [--defect <defect-summary>]

Reopen an archived spec as a new patch spec with archive context.

Options:
  --defect <text>       Optional defect summary to seed the patch spec
  -h, --help            Show this help

Exit codes: 0=success, 1=missing asset/state conflict, 3=param error
EOF
}

if [[ $# -eq 0 ]] || [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]]; then
  print_usage
  exit 0
fi

PROJECT_DIR=""
SPEC_NAME=""
DEFECT_SUMMARY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --defect)
      DEFECT_SUMMARY="${2:-}"
      shift 2
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    -*)
      echo "[ERROR] Unknown option: $1" >&2
      exit 3
      ;;
    *)
      if [[ -z "$PROJECT_DIR" ]]; then
        PROJECT_DIR="$1"
      elif [[ -z "$SPEC_NAME" ]]; then
        SPEC_NAME="$1"
      else
        echo "[ERROR] Unexpected argument: $1" >&2
        exit 3
      fi
      shift
      ;;
  esac
done

if [[ -z "$PROJECT_DIR" || -z "$SPEC_NAME" ]]; then
  echo "[ERROR] Usage: reopen.sh <project-dir> <spec-name> [--defect <defect-summary>]" >&2
  exit 3
fi

DOCS_DIR_NAME="$(_sdd_get_docs_dir "$PROJECT_DIR")"
DOCS_ROOT="$PROJECT_DIR/$DOCS_DIR_NAME"
SPECS_DIR="$DOCS_ROOT/specs"
ARCHIVE_DIR="$DOCS_ROOT/archive"
SPEC_TEMPLATE="$(_sdd_get_spec_template "$SCAFFOLD_ROOT" "$PROJECT_DIR")"

if [[ ! -d "$DOCS_ROOT" || ! -d "$SPECS_DIR" ]]; then
  echo "[ERROR] Project not initialized. Run: sdd.sh init <dir>" >&2
  exit 1
fi

if [[ ! -f "$SPEC_TEMPLATE" ]]; then
  echo "[ERROR] spec template not found at: $SPEC_TEMPLATE" >&2
  exit 1
fi

SPEC_SLUG="${SPEC_NAME// /-}"
if [[ "$SPEC_SLUG" =~ ^v([0-9]+)\.([0-9]+)-(.+)$ ]]; then
  SPEC_SLUG="${BASH_REMATCH[3]}"
fi

highest_spec="$(_sdd_find_source_spec "$SPECS_DIR" "$SPEC_SLUG")"
archived_spec="$(_sdd_find_source_spec "$ARCHIVE_DIR" "$SPEC_SLUG" "true")"

if [[ -z "$highest_spec" ]] && [[ -z "$archived_spec" ]]; then
  echo "[ERROR] No versioned spec matching '${SPEC_SLUG}' found in $SPECS_DIR or $ARCHIVE_DIR" >&2
  exit 1
fi

# If the highest active spec is not archived, use archive dir to find archived version
source_spec="$(_sdd_find_source_spec "$SPECS_DIR" "$SPEC_SLUG" "true")"
if [[ -z "$source_spec" ]]; then
  # Check archive dir for archived spec
  source_spec="$archived_spec"
fi
if [[ -z "$source_spec" ]]; then
  echo "[ERROR] Source spec is not archived. Use 'sdd.sh resume \"$PROJECT_DIR\"' to continue the active task." >&2
  exit 1
fi

source_bname="$(basename "$source_spec")"
if [[ ! "$source_bname" =~ ^(v[0-9]+\.[0-9]+)-(.+)\.md$ ]]; then
  echo "[ERROR] Source spec '$source_bname' does not use versioned naming" >&2
  exit 1
fi

source_version="${BASH_REMATCH[1]}"
task_slug="${BASH_REMATCH[2]}"
archive_file="$ARCHIVE_DIR/${source_version}-${task_slug}.md"
archive_context_path=""

if [[ -f "$archive_file" ]]; then
  archive_context_path="$archive_file"
else
  echo "[ERROR] Archive context file not found for '${task_slug}'. Expected '${archive_file}'." >&2
  exit 1
fi

source_major="${source_version#v}"
source_major="${source_major%%.*}"
source_minor="${source_version#v${source_major}.}"

open_patch=""
while IFS= read -r -d '' f; do
  bname="$(basename "$f")"
  [[ "$bname" == ".gitkeep" ]] && continue
  if [[ "$bname" =~ ^v([0-9]+)\.([0-9]+)-(.+)\.md$ ]]; then
    cand_major="${BASH_REMATCH[1]}"
    cand_minor="${BASH_REMATCH[2]}"
    cand_slug="${BASH_REMATCH[3]}"
    if [[ "$cand_slug" == "$task_slug" ]]; then
      if (( cand_major > source_major )) || (( cand_major == source_major && cand_minor > source_minor )); then
        cand_status="$(grep '^status:' "$f" 2>/dev/null | head -1 | sed 's/status: *//; s/#.*$//' | tr -d '[:space:]' || true)"
        if [[ "$cand_status" != "archived" ]]; then
          open_patch="$f"
          break
        fi
      fi
    fi
  fi
done < <(find "$SPECS_DIR" -maxdepth 1 -name "*.md" -print0 2>/dev/null)

if [[ -n "$open_patch" ]]; then
  echo "[ERROR] Open patch spec already exists: $(basename "$open_patch"). Run 'sdd.sh resume "$PROJECT_DIR"' to continue." >&2
  exit 1
fi

new_version_specs="$(_sdd_next_version "$SPECS_DIR" "$task_slug")"
new_version_archive="$(_sdd_next_version "$ARCHIVE_DIR" "$task_slug")"
# Pick the higher of the two to avoid colliding with archived versions
_v1="${new_version_specs#v}"; _maj1="${_v1%%.*}"; _min1="${_v1##*.}"
_v2="${new_version_archive#v}"; _maj2="${_v2%%.*}"; _min2="${_v2##*.}"
if (( _maj2 > _maj1 )) || (( _maj2 == _maj1 && _min2 > _min1 )); then
  new_version="$new_version_archive"
else
  new_version="$new_version_specs"
fi
new_spec="$SPECS_DIR/${new_version}-${task_slug}.md"
today_iso="$(date +%Y-%m-%d)"
context_relative="${archive_context_path#${PROJECT_DIR}/}"

cp "$SPEC_TEMPLATE" "$new_spec"
sed -i.bak "s/date: YYYY-MM-DD/date: ${today_iso}/" "$new_spec" && rm -f "$new_spec.bak"
sed -i.bak "s/task-name: \"Task Name Placeholder\"/task-name: \"${task_slug}\"/" "$new_spec" && rm -f "$new_spec.bak"
sed -i.bak "s|^reopened-from:.*|reopened-from: \"${source_version}\"|" "$new_spec" && rm -f "$new_spec.bak"
sed -i.bak "s|^context-source:.*|context-source: \"${context_relative}\"|" "$new_spec" && rm -f "$new_spec.bak"

archive_note="<!-- Reopened from archived context: ${context_relative}${DEFECT_SUMMARY:+ | defect: ${DEFECT_SUMMARY}} -->"
awk -v note="$archive_note" '
  BEGIN { fm_count=0; injected=0 }
  {
    print $0
    if (!injected && /^---$/) {
      fm_count++
      if (fm_count == 2) {
        print ""
        print note
        injected=1
      }
    }
  }
' "$new_spec" > "$new_spec.tmp" && mv "$new_spec.tmp" "$new_spec"

echo "" >> "$new_spec"
echo "<!-- Source Spec: ${source_bname} -->" >> "$new_spec"

echo "[CREATE] $new_spec"
echo "Reopened from: $source_bname"
echo "Archive context: $archive_context_path"
echo "Run: bash \"$SCAFFOLD_ROOT/sdd.sh\" resume \"$PROJECT_DIR\""
exit 0
