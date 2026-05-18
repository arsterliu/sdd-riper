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

make_tmp() { mktemp -d "$REPO_ROOT/tmp/test-XXXXXX"; }
cleanup_tmp() { [[ -n "${1:-}" ]] && rm -rf "$1"; }

# 1. init creates custom docs-dir successfully
tmp="$(make_tmp)"
echo "Test: init creates custom docs-dir"
bash "$SDD" init "$tmp" --docs-dir docsx >/dev/null && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "init with custom docs-dir exits 0"; else fail "init with custom docs-dir exited $exit_code"; fi
if [ -d "$tmp/docsx/specs" ] && [ -d "$tmp/docsx/codemap" ] && [ -d "$tmp/docsx/context" ] && [ -d "$tmp/docsx/archive" ]; then
  pass "custom docs-dir structure created"
else
  fail "custom docs-dir structure missing"
fi
if [ ! -d "$tmp/mydocs" ]; then pass "default mydocs not created"; else fail "default mydocs should not exist"; fi
cleanup_tmp "$tmp"

# 2. resume supports custom docs-dir
tmp="$(make_tmp)"
echo "Test: resume supports custom docs-dir"
bash "$SDD" init "$tmp" --docs-dir docsx >/dev/null
out=$(bash "$SDD" resume "$tmp" 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "resume accepts custom docs-dir"; else fail "resume expected exit 0 on custom docs-dir, got $exit_code"; fi
if echo "$out" | grep -q "DOCS_DIR: docsx"; then pass "resume reports configured docs-dir"; else fail "resume missing configured docs-dir output"; fi
cleanup_tmp "$tmp"

# 3. status supports custom docs-dir
tmp="$(make_tmp)"
echo "Test: status supports custom docs-dir"
bash "$SDD" init "$tmp" --docs-dir docsx >/dev/null
out=$(bash "$SDD" status "$tmp" 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "status accepts custom docs-dir"; else fail "status expected exit 0 on custom docs-dir, got $exit_code"; fi
if echo "$out" | grep -q "Structure:    OK"; then pass "status reports healthy structure for custom docs-dir"; else fail "status missing OK structure output for custom docs-dir"; fi
cleanup_tmp "$tmp"

# 4. debug supports custom docs-dir
tmp="$(make_tmp)"
echo "Test: debug supports custom docs-dir"
bash "$SDD" init "$tmp" --docs-dir docsx >/dev/null
out=$(bash "$SDD" debug "$tmp" 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "debug accepts custom docs-dir"; else fail "debug expected exit 0 on custom docs-dir, got $exit_code"; fi
if echo "$out" | grep -q "## DEBUG PROMPT"; then pass "debug emits prompt for custom docs-dir"; else fail "debug missing prompt for custom docs-dir"; fi
cleanup_tmp "$tmp"

# 5. review-execute supports custom docs-dir
tmp="$(make_tmp)"
echo "Test: review-execute supports custom docs-dir"
bash "$SDD" init "$tmp" --docs-dir docsx >/dev/null
out=$(bash "$SDD" review-execute "$tmp" 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "review-execute accepts custom docs-dir"; else fail "review-execute expected exit 0 on custom docs-dir, got $exit_code"; fi
if echo "$out" | grep -q "## REVIEW EXECUTE PROMPT"; then pass "review-execute emits prompt for custom docs-dir"; else fail "review-execute missing prompt for custom docs-dir"; fi
cleanup_tmp "$tmp"

# 6. discover writes into custom docs-dir
tmp="$(make_tmp)"
echo "Test: discover supports custom docs-dir"
bash "$SDD" init "$tmp" --docs-dir docsx >/dev/null
out=$(bash "$SDD" discover "$tmp" --task-name "docs-dir-task" --version v1.0 --requirement "regression" 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "discover accepts custom docs-dir"; else fail "discover expected exit 0 on custom docs-dir, got $exit_code"; fi
if [ -f "$tmp/docsx/specs/v1.0-docs-dir-task.md" ]; then pass "discover creates spec under custom docs-dir"; else fail "discover missing spec under custom docs-dir"; fi
cleanup_tmp "$tmp"

echo "tests/test_docs_dir.sh: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
