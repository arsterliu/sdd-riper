#!/usr/bin/env bash
set -euo pipefail

# SDD-RIPER CLI Entry Point
# Dispatches to subcommands in bin/

print_usage() {
  cat <<'EOF'
SDD-RIPER CLI

Usage: sdd.sh <command> [options]

Commands:
  init              Initialize a new SDD-RIPER project
  discover          Start a new task (Pre-Research / first Spec creation)
  resume            Resume an existing task (context reload + phase hint)
  new-codemap       Create a new codemap document
  new-projectmap    Create a new project map document
  status            Check project status and readiness
  archive           Archive completed specifications
  reopen            Reopen an archived spec as a patch spec
  review-execute    Four-axis quality review (Spec vs Code vs Log vs Invocation)
  create-codemap    AI-driven codebase scan prompt generator
  build-context-bundle  AI context bundle extraction prompt
  debug             Debug prompt generator (log-driven root cause)
  create-projectmap  AI-driven projectmap generation prompt

Exit Codes:
  0                 Success
  1                 Missing asset
  2                 Broken reference
  3                 Parameter or environment error

Options:
  -h, --help        Show this help message

Examples:
  sdd.sh init
  sdd.sh discover my-project --task-name login
  sdd.sh resume my-project
  sdd.sh status
EOF
}

# Handle no arguments or help flags
if [[ $# -eq 0 ]] || [[ "$1" == "-h" ]] || [[ "$1" == "--help" ]]; then
  print_usage
  exit 0
fi

# Get the command
subcmd="$1"
shift || true

# Dispatch to subcommand
case "$subcmd" in
  init|discover|resume|new-codemap|new-projectmap|status|archive|reopen|review-execute|create-codemap|build-context-bundle|debug|create-projectmap)
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    bash "${script_dir}/bin/${subcmd}.sh" "$@"
    ;;
  *)
    echo "Unknown command: $subcmd" >&2
    exit 3
    ;;
esac
