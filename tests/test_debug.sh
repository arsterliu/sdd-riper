#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
SDD="$REPO_ROOT/sdd.sh"
PASS=0; FAIL=0; ERRORS=()
pass() { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); ERRORS+=("$1"); }

mkdir -p "$REPO_ROOT/tmp"
make_tmp() { mktemp -d "$REPO_ROOT/tmp/test-XXXXXX"; }
cleanup_tmp() { [[ -n "${1:-}" ]] && rm -rf "$1"; }

# 1. happy path
tmp="$(make_tmp)"
echo "Test: happy path"
bash "$SDD" init "$tmp" --mode standard >/dev/null
bash "$SDD" discover "$tmp" --task-name "test-task" --version v1.0 --requirement "debug test task" >/dev/null
out=$(bash "$SDD" debug "$tmp") && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "debug exits 0"; else fail "expected exit 0, got $exit_code"; fi
if echo "$out" | grep -q "## DEBUG PROMPT"; then pass "output contains ## DEBUG PROMPT"; else fail "missing ## DEBUG PROMPT"; fi
if echo "$out" | grep -q "### 错误信息"; then pass "output contains ### 错误信息"; else fail "missing ### 错误信息"; fi
if echo "$out" | grep -q "### AI 指令"; then pass "output contains ### AI 指令"; else fail "missing ### AI 指令"; fi
if echo "$out" | grep -q "禁止在未明确 Root Cause"; then pass "output contains 禁止在未明确 Root Cause"; else fail "missing 禁止在未明确 Root Cause"; fi
cleanup_tmp "$tmp"

# 2. happy path with --error
tmp="$(make_tmp)"
echo "Test: happy path with --error"
bash "$SDD" init "$tmp" --mode standard >/dev/null
out=$(bash "$SDD" debug "$tmp" --error "TypeError: Cannot read property") && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "debug with error exits 0"; else fail "expected exit 0, got $exit_code"; fi
if echo "$out" | grep -q "TypeError: Cannot read property"; then pass "output contains TypeError: Cannot read property"; else fail "missing TypeError: Cannot read property"; fi
cleanup_tmp "$tmp"

# 3. failure path: no mydocs -> exit 1, [ERROR] in stderr
tmp="$(make_tmp)"
echo "Test: failure path (no mydocs)"
out=$(bash "$SDD" debug "$tmp" 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 1 ]; then pass "no-mydocs exits 1"; else fail "no-mydocs expected exit 1, got $exit_code"; fi
if echo "$out" | grep -q "\[ERROR\]"; then pass "output contains [ERROR]"; else fail "missing [ERROR]"; fi
cleanup_tmp "$tmp"

# 4. no args -> exit 3
echo "Test: no args"
out=$(bash "$SDD" debug 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 3 ]; then pass "no-args exits 3"; else fail "no-args expected exit 3, got $exit_code"; fi

echo "tests/test_debug.sh: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
