#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

print_usage() {
  cat <<'EOF'
Usage: discover.sh <project-dir> --task-name <name> --version v{N}.{M} [options]

Start a new task by creating the first Spec and generating the structured
Pre-Research prompt for AI.

Options:
  --task-name <name>    Task name (required)
  --version v{N}.{M}    Version for this spec (required, e.g. v1.0)
  --requirement <text>  Requirement definition
  --goal <text>         Goal statement
  --constraints <text>  Technical or business constraints
  --context <text>      Background context
  -h, --help            Show this help

Exit codes: 0=success, 1=missing asset, 3=param error
EOF
}

if [[ $# -eq 0 ]] || [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]]; then
  print_usage
  exit 0
fi

TARGET_DIR="$1"
shift || true

exec "${BASH}" "$SCRIPT_DIR/_spec_creator.sh" "$TARGET_DIR" --create-spec "$@"
