#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# Pre-clean any stale tmp dirs from previous interrupted runs
rm -rf "$REPO_ROOT/tmp/test-"* 2>/dev/null || true

TOTAL_PASS=0
TOTAL_FAIL=0

run_suite() {
  local name="$1"
  local file="$2"
  echo "Running: $name"
  if bash "$file"; then
    echo "  SUITE PASS: $name"
    TOTAL_PASS=$((TOTAL_PASS+1))
  else
    echo "  SUITE FAIL: $name"
    TOTAL_FAIL=$((TOTAL_FAIL+1))
  fi
  echo "----------------------------------------"
}

run_suite "init tests" "$SCRIPT_DIR/test_init.sh"
run_suite "new tests" "$SCRIPT_DIR/test_new.sh"
run_suite "status tests" "$SCRIPT_DIR/test_status.sh"
run_suite "discover/resume tests" "$SCRIPT_DIR/test_discover_resume.sh"
run_suite "archive tests" "$SCRIPT_DIR/test_archive.sh"
run_suite "reopen tests" "$SCRIPT_DIR/test_reopen.sh"
run_suite "review-execute tests" "$SCRIPT_DIR/test_review_execute.sh"
run_suite "create-codemap tests" "$SCRIPT_DIR/test_create_codemap.sh"
run_suite "build-context-bundle tests" "$SCRIPT_DIR/test_build_context_bundle.sh"
run_suite "debug tests" "$SCRIPT_DIR/test_debug.sh"
run_suite "create-projectmap tests" "$SCRIPT_DIR/test_create_projectmap.sh"
run_suite "smoke tests" "$SCRIPT_DIR/test_smoke.sh"
run_suite "docs-dir regression tests" "$SCRIPT_DIR/test_docs_dir.sh"

echo "Tests: $TOTAL_PASS passed, $TOTAL_FAIL failed"

# Cleanup test temp directories
if [[ -d "$REPO_ROOT/tmp" ]]; then
  rm -rf "$REPO_ROOT/tmp/test-"* 2>/dev/null || true
fi

if [ "$TOTAL_FAIL" -eq 0 ]; then
  exit 0
else
  exit 1
fi
