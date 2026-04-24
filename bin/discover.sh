#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

print_usage() {
  cat <<'EOF'
Usage: discover.sh <project-dir> --task-name <name> [options]

Start a new task by creating the first Spec and generating the structured
Pre-Research prompt for AI.

Options:
  --task-name <name>    Task name (required)
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

exec bash "$SCRIPT_DIR/_workflow_core.sh" "$TARGET_DIR" --create-spec "$@"
