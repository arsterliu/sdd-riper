#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCAFFOLD_ROOT="$(dirname "$SCRIPT_DIR")"
source "$SCRIPT_DIR/_common.sh"

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

DOCS_ROOT="$(_sdd_get_docs_root "$PROJECT_DIR")"
if [[ ! -d "$DOCS_ROOT" ]]; then
  echo "[ERROR] $DOCS_ROOT not found. Run 'sdd init $PROJECT_DIR' first." >&2
  exit 1
fi

OUTPUT_FILE="$DOCS_ROOT/projectmap.md"
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

# If --repos provided, replace the repos array in frontmatter.
# Pass the repos block via a temp file rather than awk -v to avoid awk treating
# newlines in the variable as literal "\n" (behaviour differs between gawk and mawk).
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

  _repos_tmp="$(mktemp)"
  printf '%s\n' "$REPOS_BLOCK" > "$_repos_tmp"

  # Replace the repos: block: read replacement from the temp file so newlines are preserved.
  awk '
    NR==FNR { repos = repos $0 "\n"; next }
    /^repos:/ { found=1; printf "%s", repos; next }
    found && /^  - / { next }
    found && !/^  - / { found=0; print; next }
    { print }
  ' "$_repos_tmp" "$OUTPUT_FILE" > "${OUTPUT_FILE}.tmp" && mv "${OUTPUT_FILE}.tmp" "$OUTPUT_FILE"

  rm -f "$_repos_tmp"
fi

echo "[CREATE] $OUTPUT_FILE"
exit 0
