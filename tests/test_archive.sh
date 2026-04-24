#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
SDD="$REPO_ROOT/sdd.sh"

PASS=0
FAIL=0
ERRORS=()

pass() { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); ERRORS+=("$1"); }

mkdir -p "$REPO_ROOT/tmp"

make_tmp() {
  local tmp
  tmp=$(mktemp -d "$REPO_ROOT/tmp/test-XXXXXX")
  bash "$SDD" init "$tmp" --mode standard >/dev/null
  echo "$tmp"
}
cleanup_tmp() { [[ -n "${1:-}" ]] && rm -rf "$1"; }

# 1. happy path
tmp="$(make_tmp)"
echo "Test: archive happy path"
bash "$SDD" discover "$tmp" --task-name "checkout-retry" --requirement "archive test task" >/dev/null
bash "$SDD" archive "$tmp" "checkout-retry" && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "archive exits 0"; else fail "archive exited $exit_code"; fi

spec_file=$(ls "$tmp/mydocs/specs/"*checkout-retry*.md 2>/dev/null || true)
if [ -n "$spec_file" ] && [ -f "$spec_file" ]; then pass "original spec preserved"; else fail "original spec missing"; fi

h_file=$(ls "$tmp/mydocs/archive/"*checkout-retry*_human.md 2>/dev/null || true)
l_file=$(ls "$tmp/mydocs/archive/"*checkout-retry*_llm.md 2>/dev/null || true)

if [ -n "$h_file" ] && [ -f "$h_file" ]; then pass "human archive exists"; else fail "human archive missing"; fi
if [ -n "$l_file" ] && [ -f "$l_file" ]; then pass "llm archive exists"; else fail "llm archive missing"; fi

# 2. conflict -> exit 1
echo "Test: archive conflict"
bash "$SDD" archive "$tmp" "checkout-retry" && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 1 ]; then pass "conflict exits 1"; else fail "conflict expected exit 1, got $exit_code"; fi

# 3. --force overwrite
echo "Test: archive force overwrite"
bash "$SDD" archive "$tmp" "checkout-retry" --force && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "force exits 0"; else fail "force expected exit 0, got $exit_code"; fi

cleanup_tmp "$tmp"

echo "tests/test_archive.sh: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
