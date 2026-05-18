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

# 1. removed command guard
tmp="$(make_tmp)"
echo "Test: new-spec removed"
bash "$SDD" new-spec "$tmp" "checkout-retry" 2>&1 && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 3 ]; then pass "new-spec exits 3"; else fail "new-spec expected exit 3, got $exit_code"; fi
cleanup_tmp "$tmp"

# 2. new-codemap happy path
tmp="$(make_tmp)"
echo "Test: new-codemap happy path"
bash "$SDD" new-codemap "$tmp" "auth-flow" --version v1.0 && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "new-codemap exits 0"; else fail "new-codemap exited $exit_code"; fi

cm_file=$(ls "$tmp/mydocs/codemap/"*auth-flow*.md 2>/dev/null || true)
if [ -n "$cm_file" ] && [ -f "$cm_file" ]; then pass "codemap file created"; else fail "codemap file not created"; fi

# 3. new-codemap second call with explicit next version
echo "Test: new-codemap second version"
bash "$SDD" new-codemap "$tmp" "auth-flow" --version v1.1 && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "codemap v1.1 exits 0"; else fail "codemap v1.1 expected exit 0, got $exit_code"; fi
v11_file=$(ls "$tmp/mydocs/codemap/v1.1-auth-flow.md" 2>/dev/null || true)
if [ -n "$v11_file" ] && [ -f "$v11_file" ]; then pass "codemap v1.1 created"; else fail "codemap v1.1 not created"; fi

# 3b. new-codemap without --version fails
echo "Test: new-codemap missing --version"
out=$(bash "$SDD" new-codemap "$tmp" "auth-flow" 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 3 ]; then pass "new-codemap missing version exits 3"; else fail "new-codemap missing version expected exit 3, got $exit_code"; fi
cleanup_tmp "$tmp"

# 4. new-projectmap happy path
tmp="$(make_tmp)"
echo "Test: new-projectmap happy path"
bash "$SDD" new-projectmap "$tmp" --repos "frontend,backend" && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "new-projectmap exits 0"; else fail "new-projectmap exited $exit_code"; fi

pm_file="$tmp/mydocs/projectmap.md"
if [ -f "$pm_file" ]; then pass "projectmap file created"; else fail "projectmap file not created"; fi
if grep -q "^repos:" "$pm_file"; then pass "projectmap has repos frontmatter"; else fail "projectmap missing repos frontmatter"; fi

# 5. new-projectmap conflict
echo "Test: new-projectmap conflict"
bash "$SDD" new-projectmap "$tmp" --repos "frontend,backend" && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 1 ]; then pass "projectmap conflict exits 1"; else fail "projectmap conflict expected exit 1, got $exit_code"; fi
cleanup_tmp "$tmp"

echo "tests/test_new.sh: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
