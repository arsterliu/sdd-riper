#!/usr/bin/env bash
set -euo pipefail

# IMPORTANT: All paths relative to repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
SDD="$REPO_ROOT/sdd.sh"

PASS=0
FAIL=0
ERRORS=()

pass() { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); ERRORS+=("$1"); }

mkdir -p "$REPO_ROOT/tmp"

# Helper: create isolated tmp dir for each test
make_tmp() {
  mktemp -d "$REPO_ROOT/tmp/test-XXXXXX"
}
# Helper: cleanup
cleanup_tmp() { [[ -n "${1:-}" ]] && rm -rf "$1"; }

# 1. fresh init standard
tmp="$(make_tmp)"
echo "Test: fresh init standard"
bash "$SDD" init "$tmp" --mode standard && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "init standard exits 0"; else fail "init standard exited $exit_code"; fi

missing=0
for d in specs codemap context archive; do
  [ -d "$tmp/mydocs/$d" ] || missing=1
done
if [ "$missing" -eq 0 ]; then pass "all mydocs dirs exist"; else fail "some mydocs dirs missing"; fi

if [ -f "$tmp/AGENTS.md" ] && [ -f "$tmp/CLAUDE.md" ] && [ -f "$tmp/.cursorrules" ] && [ -f "$tmp/.github/copilot-instructions.md" ]; then pass "ai configs exist"; else fail "some ai configs missing"; fi
if [ ! -f "$tmp/mydocs/specs/example-spec.md" ]; then pass "init does not create example spec"; else fail "init should not create example spec"; fi

if grep -q "No Spec, No Code" "$tmp/AGENTS.md"; then pass "AGENTS.md contains standard text"; else fail "AGENTS.md missing standard text"; fi
if grep -q "Plan Approved" "$tmp/CLAUDE.md"; then pass "CLAUDE.md contains standard text"; else fail "CLAUDE.md missing standard text"; fi
cleanup_tmp "$tmp"

# 2. fresh init lite
tmp2="$(make_tmp)"
echo "Test: fresh init lite"
bash "$SDD" init "$tmp2" --mode lite && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "init lite exits 0"; else fail "init lite exited $exit_code"; fi
if [ -f "$tmp2/AGENTS.md" ]; then pass "AGENTS.md exists"; else fail "AGENTS.md missing"; fi
# check for micro-spec or lite or 轻量
if grep -qE "micro-spec|lite|轻量" "$tmp2/AGENTS.md"; then pass "AGENTS.md contains lite text"; else fail "AGENTS.md missing lite text"; fi
cleanup_tmp "$tmp2"

# 3. rerun idempotency
tmp="$(make_tmp)"
echo "Test: rerun idempotency"
bash "$SDD" init "$tmp" --mode standard >/dev/null
bash "$SDD" init "$tmp" --mode standard && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "idempotent init exits 0"; else fail "idempotent init exited $exit_code"; fi
if [ ! -f "$tmp/mydocs/specs/example-spec.md" ]; then pass "idempotent init still has no example spec"; else fail "idempotent init recreated example spec"; fi
cleanup_tmp "$tmp"

# 4. --force overwrite
tmp="$(make_tmp)"
echo "Test: force overwrite"
bash "$SDD" init "$tmp" --mode lite >/dev/null
bash "$SDD" init "$tmp" --mode standard --force && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "force overwrite exits 0"; else fail "force overwrite exited $exit_code"; fi
cleanup_tmp "$tmp"

# 5. path with spaces
tmp_space="$REPO_ROOT/tmp/test with spaces $$-$RANDOM"
echo "Test: path with spaces"
bash "$SDD" init "$tmp_space" --mode standard && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "path with spaces exits 0"; else fail "path with spaces exited $exit_code"; fi
if [ -d "$tmp_space/mydocs" ]; then pass "dir with spaces created"; else fail "dir with spaces not created"; fi
cleanup_tmp "$tmp_space"

echo "tests/test_init.sh: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
