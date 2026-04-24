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

# 1. happy path: init + discover → exit 0, stdout contains ## REVIEW EXECUTE PROMPT
tmp="$(make_tmp)"
echo "Test: happy path"
bash "$SDD" init "$tmp" --mode standard >/dev/null
bash "$SDD" discover "$tmp" --task-name "test-feature" --requirement "review execute test" >/dev/null
out=$(bash "$SDD" review-execute "$tmp") && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "review-execute exits 0"; else fail "expected exit 0, got $exit_code"; fi
if echo "$out" | grep -q "## REVIEW EXECUTE PROMPT"; then pass "output contains ## REVIEW EXECUTE PROMPT"; else fail "missing ## REVIEW EXECUTE PROMPT"; fi
if echo "$out" | grep -q "### 轴1：Spec Plan"; then pass "output contains 轴1 header"; else fail "missing 轴1 header"; fi
if echo "$out" | grep -q "### 轴2：Code Diff"; then pass "output contains 轴2 header"; else fail "missing 轴2 header"; fi
if echo "$out" | grep -q "### 轴3：Execute Log"; then pass "output contains 轴3 header"; else fail "missing 轴3 header"; fi
cleanup_tmp "$tmp"

# 2. failure path: no mydocs → exit 1, [ERROR] in stderr
tmp="$(make_tmp)"
echo "Test: failure path (no mydocs)"
out=$(bash "$SDD" review-execute "$tmp" 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 1 ]; then pass "no-mydocs exits 1"; else fail "no-mydocs expected exit 1, got $exit_code"; fi
if echo "$out" | grep -q "\[ERROR\]"; then pass "output contains [ERROR]"; else fail "missing [ERROR]"; fi
cleanup_tmp "$tmp"

# 3. no args → exit 3
echo "Test: no args"
out=$(bash "$SDD" review-execute 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 3 ]; then pass "no-args exits 3"; else fail "no-args expected exit 3, got $exit_code"; fi

echo "tests/test_review_execute.sh: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
