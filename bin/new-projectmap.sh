#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCAFFOLD_ROOT="$(dirname "$SCRIPT_DIR")"

PROJECT_DIR=""
REPOS_CSV=""
FORCE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repos) REPOS_CSV="$2"; shift 2 ;;
    --force) FORCE="1"; shift ;;
    -*) echo "[ERROR] Unknown option: $1" >&2; exit 3 ;;
    *) PROJECT_DIR="$1"; shift ;;
  esac
done

if [[ -z "$PROJECT_DIR" ]]; then
  echo "[ERROR] Usage: new-projectmap.sh <project-dir> [--repos repo1,repo2,...] [--force]" >&2
  exit 3
fi

DOCS_DIR="$PROJECT_DIR/mydocs"
if [[ ! -d "$DOCS_DIR" ]]; then
  echo "[ERROR] $DOCS_DIR not found. Run 'sdd init $PROJECT_DIR' first." >&2
  exit 1
fi

OUTPUT_FILE="$DOCS_DIR/projectmap.md"
if [[ -f "$OUTPUT_FILE" ]] && [[ -z "$FORCE" ]]; then
  echo "[ERROR] projectmap.md already exists. Use --force to overwrite, or edit it manually." >&2
  exit 1
fi

DATE_ISO="$(date +%Y-%m-%d)"
PROJECT_NAME="$(basename "$PROJECT_DIR")"

# Copy template
cp "$SCAFFOLD_ROOT/templates/projectmap.md" "$OUTPUT_FILE"
sed -i.bak "s/name: \"Project Name\"/name: \"${PROJECT_NAME}\"/g" "$OUTPUT_FILE" && rm -f "$OUTPUT_FILE.bak"
sed -i.bak "s/updated-at: YYYY-MM-DD/updated-at: ${DATE_ISO}/g" "$OUTPUT_FILE" && rm -f "$OUTPUT_FILE.bak"

# If --repos provided, replace the repos array in frontmatter
if [[ -n "$REPOS_CSV" ]]; then
  # Build the repos YAML block
  REPOS_BLOCK="repos:"
  IFS=',' read -ra REPO_ARRAY <<< "$REPOS_CSV"
  for repo in "${REPO_ARRAY[@]}"; do
    repo="$(echo "$repo" | tr -d ' ')"
    REPOS_BLOCK="${REPOS_BLOCK}
  - name: \"${repo}\"
    path: \"\"
    role: \"\"
    tech-stack: \"\"
    owner: \"\""
  done
  
  # Use awk to replace repos: block with the new one
  awk -v repos="$REPOS_BLOCK" '
    /^repos:/{found=1; print repos; next}
    found && /^  - /{next}
    found && !/^  - /{found=0}
    {print}
  ' "$OUTPUT_FILE" > "${OUTPUT_FILE}.tmp" && mv "${OUTPUT_FILE}.tmp" "$OUTPUT_FILE"
fi

echo "[CREATE] $OUTPUT_FILE"
exit 0
