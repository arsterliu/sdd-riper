#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

print_usage() {
  cat <<'EOF'
Usage: resume.sh <project-dir>

Resume an existing task by loading the latest project context and phase hint.

Options:
  -h, --help            Show this help

Exit codes: 0=success, 1=missing asset, 3=param error
EOF
}

if [[ $# -eq 0 ]] || [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]]; then
  print_usage
  exit 0
fi

for arg in "$@"; do
  if [[ "$arg" == "--create-spec" || "$arg" == --create-spec=* ]]; then
    echo "[ERROR] --create-spec is not valid for resume. Use: sdd discover <dir> --task-name <name>" >&2
    exit 3
  fi
done

exec bash "$SCRIPT_DIR/_workflow_core.sh" "$@"
