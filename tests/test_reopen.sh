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
echo "Test: reopen happy path"
bash "$SDD" discover "$tmp" --task-name "payment-retry" --version v1.0 --requirement "reopen test task" >/dev/null
bash "$SDD" archive "$tmp" "payment-retry" >/dev/null
out=$(bash "$SDD" reopen "$tmp" "payment-retry" --defect "manual regression" 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "reopen exits 0"; else fail "reopen exited $exit_code"; fi
patch_file=$(ls "$tmp/mydocs/specs/"*payment-retry*.md 2>/dev/null | sort | tail -1)
if [ -n "$patch_file" ] && [ -f "$patch_file" ]; then pass "reopen created patch spec"; else fail "reopen patch spec missing"; fi
if grep -q '^reopened-from: "v1.0"' "$patch_file"; then pass "patch has reopened-from"; else fail "patch missing reopened-from"; fi
if grep -q '^context-source: "mydocs/archive/v1.0-payment-retry.md"' "$patch_file"; then pass "patch has context-source"; else fail "patch missing context-source"; fi
if [ "$(grep -c '^reopened-from:' "$patch_file")" -eq 1 ]; then pass "patch has single reopened-from key"; else fail "patch has duplicate reopened-from keys"; fi
if [ "$(grep -c '^context-source:' "$patch_file")" -eq 1 ]; then pass "patch has single context-source key"; else fail "patch has duplicate context-source keys"; fi
if grep -q 'Reopened from archived context: mydocs/archive/v1.0-payment-retry.md | defect: manual regression' "$patch_file"; then pass "patch records archive note"; else fail "patch missing archive note"; fi
cleanup_tmp "$tmp"

# 2. source spec not archived
tmp="$(make_tmp)"
echo "Test: reopen non-archived spec"
bash "$SDD" discover "$tmp" --task-name "draft-reopen" --version v1.0 --requirement "draft reopen task" >/dev/null
out=$(bash "$SDD" reopen "$tmp" "draft-reopen" 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 1 ]; then pass "non-archived exits 1"; else fail "non-archived expected exit 1, got $exit_code"; fi
if echo "$out" | grep -q 'Source spec is not archived'; then pass "non-archived error message"; else fail "non-archived missing error message"; fi
cleanup_tmp "$tmp"

# 3. missing archive file
tmp="$(make_tmp)"
echo "Test: reopen missing archive context"
bash "$SDD" discover "$tmp" --task-name "missing-context" --version v1.0 --requirement "missing context task" >/dev/null
bash "$SDD" archive "$tmp" "missing-context" >/dev/null
rm -f "$tmp/mydocs/archive/v1.0-missing-context.md"
out=$(bash "$SDD" reopen "$tmp" "missing-context" 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 1 ]; then pass "missing context exits 1"; else fail "missing context expected exit 1, got $exit_code"; fi
if echo "$out" | grep -qE 'Archive context file not found|No versioned spec matching'; then pass "missing context error shown"; else fail "missing context error missing"; fi
cleanup_tmp "$tmp"

# 4. open patch already exists
tmp="$(make_tmp)"
echo "Test: reopen refuses existing open patch"
bash "$SDD" discover "$tmp" --task-name "existing-patch" --version v1.0 --requirement "existing patch task" >/dev/null
bash "$SDD" archive "$tmp" "existing-patch" >/dev/null
bash "$SDD" reopen "$tmp" "existing-patch" >/dev/null
out=$(bash "$SDD" reopen "$tmp" "existing-patch" 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 1 ]; then pass "existing patch exits 1"; else fail "existing patch expected exit 1, got $exit_code"; fi
if echo "$out" | grep -qE 'Open patch spec already exists|already exists in specs'; then pass "existing patch error shown"; else fail "existing patch error missing"; fi
if echo "$out" | grep -q 'resume'; then pass "existing patch resume hint shown"; else fail "existing patch resume hint missing"; fi
cleanup_tmp "$tmp"

# 5. no args -> help exit 0 via sdd dispatcher
echo "Test: reopen help"
out=$(bash "$SDD" reopen --help 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "reopen help exits 0"; else fail "reopen help exited $exit_code"; fi
if echo "$out" | grep -q 'Reopen an archived spec as a new patch spec'; then pass "reopen help text ok"; else fail "reopen help text missing"; fi

echo "tests/test_reopen.sh: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
