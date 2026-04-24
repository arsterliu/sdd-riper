#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCAFFOLD_ROOT="$(dirname "$SCRIPT_DIR")"

PROJECT_DIR=""
MODULE_NAME=""
FORCE=""
VERSION_OVERRIDE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)   FORCE="1"; shift ;;
    --version) VERSION_OVERRIDE="${2:-}"; shift 2 ;;
    -*) echo "[ERROR] Unknown option: $1" >&2; exit 3 ;;
    *) 
      if [[ -z "$PROJECT_DIR" ]]; then PROJECT_DIR="$1"
      elif [[ -z "$MODULE_NAME" ]]; then MODULE_NAME="$1"
      fi
      shift ;;
  esac
done

if [[ -z "$PROJECT_DIR" ]] || [[ -z "$MODULE_NAME" ]]; then
  echo "[ERROR] Usage: new-codemap.sh <project-dir> <module-name> [--version v{N}.{M}] [--force]" >&2
  exit 3
fi

CODEMAP_DIR="$PROJECT_DIR/mydocs/codemap"
if [[ ! -d "$CODEMAP_DIR" ]]; then
  echo "[ERROR] $CODEMAP_DIR not found. Run 'sdd init $PROJECT_DIR' first." >&2
  exit 1
fi

# Version helper (inline)
_next_version() {
  local dir="$1" name="$2"
  local max_major=0 max_minor=-1
  local f bname vmaj vmin
  while IFS= read -r -d '' f; do
    bname="$(basename "$f")"
    if [[ "$bname" =~ ^v([0-9]+)\.([0-9]+)-.+\.md$ ]]; then
      local stem="${bname%.md}"
      local vprefix="v${BASH_REMATCH[1]}.${BASH_REMATCH[2]}"
      local after_prefix="${stem#${vprefix}-}"
      if [[ "$after_prefix" == "$name" ]]; then
        vmaj="${BASH_REMATCH[1]}"
        vmin="${BASH_REMATCH[2]}"
        if (( vmaj > max_major )) || (( vmaj == max_major && vmin > max_minor )); then
          max_major=$vmaj; max_minor=$vmin
        fi
      fi
    fi
  done < <(find "$dir" -maxdepth 1 -name "*.md" -print0 2>/dev/null)
  if (( max_minor == -1 )); then echo "v1.0"; else echo "v${max_major}.$((max_minor + 1))"; fi
}

DATE_ISO="$(date +%Y-%m-%d)"

if [[ -n "$VERSION_OVERRIDE" ]]; then
  if [[ ! "$VERSION_OVERRIDE" =~ ^v[0-9]+\.[0-9]+$ ]]; then
    echo "[ERROR] Invalid --version format: '${VERSION_OVERRIDE}'. Expected: v{N}.{M} (e.g. v1.0)" >&2; exit 3
  fi
  if [[ -f "$CODEMAP_DIR/${VERSION_OVERRIDE}-${MODULE_NAME}.md" ]] && [[ -z "$FORCE" ]]; then
    echo "[ERROR] Codemap '${VERSION_OVERRIDE}-${MODULE_NAME}.md' already exists. Use --force to overwrite." >&2; exit 1
  fi
  MODULE_VERSION="$VERSION_OVERRIDE"
else
  MODULE_VERSION="$(_next_version "$CODEMAP_DIR" "$MODULE_NAME")"
fi

OUTPUT_FILE="$CODEMAP_DIR/${MODULE_VERSION}-${MODULE_NAME}.md"

cp "$SCAFFOLD_ROOT/templates/codemap.md" "$OUTPUT_FILE"
sed -i.bak "s/updated-at: YYYY-MM-DD/updated-at: ${DATE_ISO}/g" "$OUTPUT_FILE" && rm -f "$OUTPUT_FILE.bak"
sed -i.bak "s/module: \"Module Name\"/module: \"${MODULE_NAME}\"/g" "$OUTPUT_FILE" && rm -f "$OUTPUT_FILE.bak"

echo "[CREATE] $OUTPUT_FILE"
exit 0
