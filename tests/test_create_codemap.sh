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

# 1. happy path: init → create-codemap <dir> → exit 0, stdout contains ## CREATE CODEMAP PROMPT
tmp="$(make_tmp)"
echo "Test: happy path"
bash "$SDD" init "$tmp" --mode standard >/dev/null
# create dummy files
touch "$tmp/index.js" "$tmp/README.md"
out=$(bash "$SDD" create-codemap "$tmp") && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "create-codemap exits 0"; else fail "expected exit 0, got $exit_code"; fi
if echo "$out" | grep -q "## CREATE CODEMAP PROMPT"; then pass "output contains ## CREATE CODEMAP PROMPT"; else fail "missing ## CREATE CODEMAP PROMPT"; fi
if echo "$out" | grep -q "### 项目文件树"; then pass "output contains ### 项目文件树"; else fail "missing ### 项目文件树"; fi
if echo "$out" | grep -q "### AI 指令"; then pass "output contains ### AI 指令"; else fail "missing ### AI 指令"; fi
if echo "$out" | grep -q "v1.0-$(basename "$tmp").md"; then pass "output contains versioned codemap path"; else fail "missing versioned codemap path"; fi
cleanup_tmp "$tmp"

# 2. failure path: no mydocs → exit 1, [ERROR] in stderr
tmp="$(make_tmp)"
echo "Test: failure path (no mydocs)"
out=$(bash "$SDD" create-codemap "$tmp" 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 1 ]; then pass "no-mydocs exits 1"; else fail "no-mydocs expected exit 1, got $exit_code"; fi
if echo "$out" | grep -q "\[ERROR\]"; then pass "output contains [ERROR]"; else fail "missing [ERROR]"; fi
cleanup_tmp "$tmp"

# 3. update path: existing codemap → output switches to UPDATE mode
tmp="$(make_tmp)"
echo "Test: update path"
bash "$SDD" init "$tmp" --mode standard >/dev/null
bash "$SDD" new-codemap "$tmp" "$(basename "$tmp")" >/dev/null
touch "$tmp/index.js"
out=$(bash "$SDD" create-codemap "$tmp") && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "update path exits 0"; else fail "update path expected exit 0, got $exit_code"; fi
if echo "$out" | grep -q "## UPDATE CODEMAP PROMPT"; then pass "output contains ## UPDATE CODEMAP PROMPT"; else fail "missing ## UPDATE CODEMAP PROMPT"; fi
if echo "$out" | grep -q "last-reason"; then pass "update prompt includes existing codemap content"; else fail "update prompt missing existing codemap content"; fi
cleanup_tmp "$tmp"

# 4. invalid module path traversal → exit 3
tmp="$(make_tmp)"
echo "Test: invalid --module"
bash "$SDD" init "$tmp" --mode standard >/dev/null
out=$(bash "$SDD" create-codemap "$tmp" --module "../evil" 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 3 ]; then pass "invalid module exits 3"; else fail "invalid module expected exit 3, got $exit_code"; fi
if echo "$out" | grep -q "Invalid --module"; then pass "invalid module reports error"; else fail "invalid module missing message"; fi
cleanup_tmp "$tmp"

# 5. no args → exit 3
echo "Test: no args"
out=$(bash "$SDD" create-codemap 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 3 ]; then pass "no-args exits 3"; else fail "no-args expected exit 3, got $exit_code"; fi

echo "tests/test_create_codemap.sh: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
