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

echo "--- test_create_projectmap.sh ---"

# Test 1: Happy path
tmp1=$(make_tmp)
bash "$SDD" init "$tmp1" --mode standard >/dev/null
out=$(bash "$SDD" create-projectmap "$tmp1")
if echo "$out" | grep -q "## CREATE PROJECTMAP PROMPT" && \
   echo "$out" | grep -q "### 项目基础信息" && \
   echo "$out" | grep -q "### AI 指令"; then
  pass "Happy path outputs correct sections"
else
  fail "Happy path output missing sections. Got: $out"
fi
cleanup_tmp "$tmp1"

# Test 2: Already exists -> exit 1 (unified with new-projectmap which also uses exit 1)
tmp2=$(make_tmp)
bash "$SDD" init "$tmp2" --mode standard >/dev/null
bash "$SDD" new-projectmap "$tmp2" >/dev/null
set +e
out=$(bash "$SDD" create-projectmap "$tmp2" 2>&1)
code=$?
set -e
if [ $code -eq 1 ] && (echo "$out" | grep -q "already exists" || echo "$out" | grep -q "--force"); then
  pass "Already exists returns 1 with warning"
else
  fail "Already exists failed (code: $code, output: $out)"
fi

# Test 3: --force override
out=$(bash "$SDD" create-projectmap "$tmp2" --force)
if echo "$out" | grep -q "## CREATE PROJECTMAP PROMPT"; then
  pass "--force bypasses already exists error"
else
  fail "--force failed. Got: $out"
fi
cleanup_tmp "$tmp2"

# Test 4: Missing mydocs -> exit 1
tmp3=$(make_tmp)
set +e
out=$(bash "$SDD" create-projectmap "$tmp3" 2>&1)
code=$?
set -e
if [ $code -eq 1 ] && echo "$out" | grep -q "\[ERROR\]"; then
  pass "Missing mydocs returns 1 with error"
else
  fail "Missing mydocs failed (code: $code, output: $out)"
fi
cleanup_tmp "$tmp3"

# Test 5: No args -> exit 3
set +e
out=$(bash "$SDD" create-projectmap 2>&1)
code=$?
set -e
if [ $code -eq 3 ] && echo "$out" | grep -q "\[ERROR\] Usage:"; then
  pass "No args returns 3 with usage error"
else
  fail "No args failed (code: $code, output: $out)"
fi

echo "tests/test_create_projectmap.sh: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
