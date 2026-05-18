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
out=$(bash "$SDD" build-context-bundle "$tmp" --version v1.0) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "build-context-bundle exits 0"; else fail "expected exit 0, got $exit_code"; fi
if echo "$out" | grep -q "## BUILD CONTEXT BUNDLE PROMPT"; then pass "output contains ## BUILD CONTEXT BUNDLE PROMPT"; else fail "missing ## BUILD CONTEXT BUNDLE PROMPT"; fi
if echo "$out" | grep -q "### mydocs 文件清单"; then pass "output contains ### mydocs 文件清单"; else fail "missing ### mydocs 文件清单"; fi
if echo "$out" | grep -q "### AI 指令"; then pass "output contains ### AI 指令"; else fail "missing ### AI 指令"; fi
cleanup_tmp "$tmp"

# 2. happy path with --out
tmp="$(make_tmp)"
echo "Test: happy path with --out"
bash "$SDD" init "$tmp" --mode standard >/dev/null
out=$(bash "$SDD" build-context-bundle "$tmp" --version v1.0 --out "my-bundle") && exit_code=0 || exit_code=$?
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

# 5. No --sources
tmp="$(make_tmp)"
echo "Test: No --sources"
bash "$SDD" init "$tmp" --mode standard >/dev/null
out=$(bash "$SDD" build-context-bundle "$tmp" --version v1.0) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "no --sources exits 0"; else fail "no --sources exited $exit_code"; fi
if echo "$out" | grep -q "Project Background"; then pass "no --sources stdout has Project Background"; else fail "no --sources missing Project Background"; fi
if ! echo "$out" | grep -q "^## Source Materials"; then pass "no --sources stdout no Source Materials"; else fail "no --sources should not have Source Materials"; echo "OUTPUT WAS: $out"; fi
cleanup_tmp "$tmp"

# 6. --sources mixed dir
tmp="$(make_tmp)"
echo "Test: --sources mixed dir"
bash "$SDD" init "$tmp" --mode standard >/dev/null
src_dir="$tmp/sources"
mkdir -p "$src_dir"
echo "md content" > "$src_dir/file.md"
echo "txt content" > "$src_dir/file.txt"
touch "$src_dir/image.png"
touch "$src_dir/doc.pdf"
out=$(bash "$SDD" build-context-bundle "$tmp" --version v1.0 --sources "$src_dir") && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "--sources mixed dir exits 0"; else fail "--sources mixed dir exited $exit_code"; fi
if echo "$out" | grep -q "^## Source Materials"; then pass "stdout has Source Materials"; else fail "missing Source Materials"; fi
if echo "$out" | grep -q "md content"; then pass "md content inlined"; else fail "md content not inlined"; fi
if echo "$out" | grep -q "txt content"; then pass "txt content inlined"; else fail "txt content not inlined"; fi
if echo "$out" | grep -q "\[image\] .*image\.png"; then pass "png listed path"; else fail "png path not listed"; fi
if ! echo "$out" | grep -q "doc\.pdf"; then pass "pdf omitted"; else fail "pdf should not appear"; fi
cleanup_tmp "$tmp"

# 7. --sources path not exist
tmp="$(make_tmp)"
echo "Test: --sources path not exist"
bash "$SDD" init "$tmp" --mode standard >/dev/null
out=$(bash "$SDD" build-context-bundle "$tmp" --version v1.0 --sources "$tmp/nonexistent" 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "--sources not exist exits 0"; else fail "--sources not exist exited $exit_code"; fi
if echo "$out" | grep -q "\[WARN\].*not found or not a directory"; then pass "stderr has WARN for not exist"; else fail "stderr missing WARN for not exist"; fi
cleanup_tmp "$tmp"

# 8. --sources pointing to a file
tmp="$(make_tmp)"
echo "Test: --sources pointing to a file"
bash "$SDD" init "$tmp" --mode standard >/dev/null
touch "$tmp/file.txt"
out=$(bash "$SDD" build-context-bundle "$tmp" --version v1.0 --sources "$tmp/file.txt" 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "--sources file exits 0"; else fail "--sources file exited $exit_code"; fi
if echo "$out" | grep -q "\[WARN\].*not found or not a directory"; then pass "stderr has WARN for file"; else fail "stderr missing WARN for file"; fi
cleanup_tmp "$tmp"

# 9. text file > 50KB
tmp="$(make_tmp)"
echo "Test: text file > 50KB"
bash "$SDD" init "$tmp" --mode standard >/dev/null
src_dir="$tmp/sources"
mkdir -p "$src_dir"
dd if=/dev/zero of="$src_dir/large.txt" bs=1024 count=60 2>/dev/null
out=$(bash "$SDD" build-context-bundle "$tmp" --version v1.0 --sources "$src_dir") && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "large text file exits 0"; else fail "large text file exited $exit_code"; fi
if echo "$out" | grep -q "\[文件过大，请 AI 自行读取"; then pass "large text file handled"; else fail "large text file missing warning"; fi
cleanup_tmp "$tmp"

# 10. --help
echo "Test: --help"
out=$(bash "$SDD" build-context-bundle --help) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "--help exits 0"; else fail "--help exited $exit_code"; fi
if echo "$out" | grep -q -- "--sources"; then pass "--help contains --sources"; else fail "--help missing --sources"; fi

# 11. context/ exclusion
tmp="$(make_tmp)"
echo "Test: context/ exclusion"
bash "$SDD" init "$tmp" --mode standard >/dev/null
mkdir -p "$tmp/mydocs/context"
echo "context md" > "$tmp/mydocs/context/should_be_excluded.md"
out=$(bash "$SDD" build-context-bundle "$tmp" --version v1.0) && exit_code=0 || exit_code=$?
if ! echo "$out" | grep -q "should_be_excluded\.md"; then pass "context file excluded"; else fail "context file should not be listed"; fi
cleanup_tmp "$tmp"

echo "tests/test_build_context_bundle.sh: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
echo "All tests passed."