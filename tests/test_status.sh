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

make_tmp() {
  local tmp="$REPO_ROOT/tmp/test-$$-$RANDOM"
  mkdir -p "$tmp"
  echo "$tmp"
}
cleanup_tmp() { rm -rf "$1"; }

# 1. full structure OK
tmp="$(make_tmp)"
echo "Test: full structure OK"
bash "$SDD" init "$tmp" --mode standard >/dev/null
bash "$SDD" new-projectmap "$tmp" --repos "frontend" >/dev/null
out=$(bash "$SDD" status "$tmp") && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "status OK exits 0"; else fail "status OK exited $exit_code"; fi
if echo "$out" | grep -q "Specs:.*active"; then pass "output contains OK"; else fail "output missing OK"; fi
if echo "$out" | grep -q "CodeMap:      OK (none"; then pass "status reports no codemap as OK"; else fail "status missing codemap OK"; fi
cleanup_tmp "$tmp"

# 2. missing dirs -> exit 1
tmp="$(make_tmp)"
echo "Test: missing dirs"
out=$(bash "$SDD" status "$tmp") && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 1 ]; then pass "missing dirs exits 1"; else fail "missing dirs expected exit 1, got $exit_code"; fi
if echo "$out" | grep -q "MISSING"; then pass "output contains MISSING"; else fail "output missing MISSING"; fi
cleanup_tmp "$tmp"

# 3. broken projectmap -> exit 2
tmp="$(make_tmp)"
echo "Test: broken projectmap"
bash "$SDD" init "$tmp" --mode standard >/dev/null
bash "$SDD" new-projectmap "$tmp" --repos "frontend" >/dev/null
echo "broken" > "$tmp/mydocs/projectmap.md"
out=$(bash "$SDD" status "$tmp") && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 2 ]; then pass "broken projectmap exits 2"; else fail "broken projectmap expected exit 2, got $exit_code"; fi
if echo "$out" | grep -qE "ERROR.*broken"; then pass "output contains ERROR"; else fail "output missing ERROR"; fi
cleanup_tmp "$tmp"

# 4. no args -> exit 3
echo "Test: no args"
out=$(bash "$SDD" status 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 3 ]; then pass "no args exits 3"; else fail "no args expected exit 3, got $exit_code"; fi

# 5. codemap missing last-reason -> WARN
tmp="$(make_tmp)"
echo "Test: codemap missing last-reason"
bash "$SDD" init "$tmp" --mode standard >/dev/null
bash "$SDD" new-codemap "$tmp" "auth-flow" >/dev/null
cm_file="$tmp/mydocs/codemap/auth-flow.md"
grep -v '^last-reason:' "$cm_file" > "$tmp/auth-flow.stripped.md"
mv "$tmp/auth-flow.stripped.md" "$cm_file"
out=$(bash "$SDD" status "$tmp") && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "status with codemap warn exits 0"; else fail "status with codemap warn exited $exit_code"; fi
if echo "$out" | grep -q "CodeMap:      WARN"; then pass "status reports codemap WARN"; else fail "status missing codemap WARN"; fi
cleanup_tmp "$tmp"

# 6. empty review section -> WARN
tmp="$(make_tmp)"
echo "Test: review warning"
bash "$SDD" init "$tmp" --mode standard >/dev/null
bash "$SDD" discover "$tmp" --task-name "checkout-retry" --version v1.0 --requirement "status test task" >/dev/null
out=$(bash "$SDD" status "$tmp") && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "status with empty review exits 0"; else fail "status with empty review exited $exit_code"; fi
if echo "$out" | grep -q "Review:       WARN"; then pass "status reports review WARN"; else fail "status missing review WARN"; fi
cleanup_tmp "$tmp"

echo "tests/test_status.sh: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
