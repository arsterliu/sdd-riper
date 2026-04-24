#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
SDD="$REPO_ROOT/sdd.sh"
PASS=0; FAIL=0; ERRORS=()
pass() { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); ERRORS+=("$1"); }
make_tmp() { local tmp="$REPO_ROOT/tmp/test-$$-$RANDOM"; mkdir -p "$tmp"; echo "$tmp"; }
cleanup_tmp() { rm -rf "$1"; }

# 1. happy path: init → build-context-bundle <dir> → exit 0, stdout contains ## BUILD CONTEXT BUNDLE PROMPT
tmp="$(make_tmp)"
echo "Test: happy path"
bash "$SDD" init "$tmp" --mode standard >/dev/null
out=$(bash "$SDD" build-context-bundle "$tmp") && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "build-context-bundle exits 0"; else fail "expected exit 0, got $exit_code"; fi
if echo "$out" | grep -q "## BUILD CONTEXT BUNDLE PROMPT"; then pass "output contains ## BUILD CONTEXT BUNDLE PROMPT"; else fail "missing ## BUILD CONTEXT BUNDLE PROMPT"; fi
if echo "$out" | grep -q "### mydocs 文件清单"; then pass "output contains ### mydocs 文件清单"; else fail "missing ### mydocs 文件清单"; fi
if echo "$out" | grep -q "### AI 指令"; then pass "output contains ### AI 指令"; else fail "missing ### AI 指令"; fi
cleanup_tmp "$tmp"

# 2. happy path with --out
tmp="$(make_tmp)"
echo "Test: happy path with --out"
bash "$SDD" init "$tmp" --mode standard >/dev/null
out=$(bash "$SDD" build-context-bundle "$tmp" --out "my-bundle") && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "--out exits 0"; else fail "--out expected exit 0, got $exit_code"; fi
if echo "$out" | grep -q "my-bundle"; then pass "output contains my-bundle"; else fail "missing my-bundle"; fi
cleanup_tmp "$tmp"

# 3. failure path: no mydocs → exit 1, [ERROR] in stderr
tmp="$(make_tmp)"
echo "Test: failure path (no mydocs)"
out=$(bash "$SDD" build-context-bundle "$tmp" 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 1 ]; then pass "no-mydocs exits 1"; else fail "no-mydocs expected exit 1, got $exit_code"; fi
if echo "$out" | grep -q "\[ERROR\]"; then pass "output contains [ERROR]"; else fail "missing [ERROR]"; fi
cleanup_tmp "$tmp"

# 4. no args → exit 3
echo "Test: no args"
out=$(bash "$SDD" build-context-bundle 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 3 ]; then pass "no-args exits 3"; else fail "no-args expected exit 3, got $exit_code"; fi

echo "tests/test_build_context_bundle.sh: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1