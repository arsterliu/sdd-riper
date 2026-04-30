#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
SDD="$REPO_ROOT/sdd.sh"
PASS=0; FAIL=0; ERRORS=()
pass() { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); ERRORS+=("$1"); }

git_init_repo() {
  local dir="$1"
  git -C "$dir" init -b main >/dev/null 2>&1 || {
    git -C "$dir" init >/dev/null 2>&1
    git -C "$dir" checkout -b main >/dev/null 2>&1 || true
  }
}

git_commit_all() {
  local dir="$1" message="$2"
  git -C "$dir" add -A >/dev/null 2>&1
  GIT_AUTHOR_NAME="SDD Test" \
  GIT_AUTHOR_EMAIL="sdd-test@example.com" \
  GIT_COMMITTER_NAME="SDD Test" \
  GIT_COMMITTER_EMAIL="sdd-test@example.com" \
  git -C "$dir" commit -m "$message" >/dev/null 2>&1
}

mkdir -p "$REPO_ROOT/tmp"
make_tmp() { mktemp -d "$REPO_ROOT/tmp/test-XXXXXX"; }
cleanup_tmp() { [[ -n "${1:-}" ]] && rm -rf "$1"; }

# 1. happy path: init + discover → exit 0, stdout contains 4-axis headers and typed verdicts
tmp="$(make_tmp)"
echo "Test: happy path"
bash "$SDD" init "$tmp" --mode standard >/dev/null
bash "$SDD" discover "$tmp" --task-name "test-feature" --requirement "review execute test" >/dev/null
stdout_file="$tmp/review.stdout"
stderr_file="$tmp/review.stderr"
bash "$SDD" review-execute "$tmp" >"$stdout_file" 2>"$stderr_file" && exit_code=0 || exit_code=$?
out="$(cat "$stdout_file")"
stderr_out="$(cat "$stderr_file")"
if [ "$exit_code" -eq 0 ]; then pass "review-execute exits 0"; else fail "expected exit 0, got $exit_code"; fi
if echo "$out" | grep -q "## REVIEW EXECUTE PROMPT (4-Axis)"; then pass "output contains 4-Axis header"; else fail "missing ## REVIEW EXECUTE PROMPT (4-Axis)"; fi
if echo "$out" | grep -q "### 轴0 — Invocation Integrity"; then pass "output contains 轴0 header"; else fail "missing 轴0 header"; fi
if echo "$out" | grep -q "### 轴1 — Spec Plan Coverage"; then pass "output contains 轴1 header"; else fail "missing 轴1 header"; fi
if echo "$out" | grep -q "### 轴2 — Code Diff Scope"; then pass "output contains 轴2 header"; else fail "missing 轴2 header"; fi
if echo "$out" | grep -q "### 轴3 — Execute Log Fidelity"; then pass "output contains 轴3 header"; else fail "missing 轴3 header"; fi
if echo "$out" | grep -q "FAIL_CODE"; then pass "output contains FAIL_CODE"; else fail "missing FAIL_CODE"; fi
if echo "$out" | grep -q "FAIL_PLAN"; then pass "output contains FAIL_PLAN"; else fail "missing FAIL_PLAN"; fi
if echo "$out" | grep -q "FAIL_SPEC"; then pass "output contains FAIL_SPEC"; else fail "missing FAIL_SPEC"; fi
if echo "$out" | grep -q "ALIGNED | DRIFTED | VIOLATED | UNVERIFIABLE"; then pass "output contains Axis 0 finding enum"; else fail "missing Axis 0 finding enum"; fi
if [ -z "$stderr_out" ]; then pass "stderr is empty on happy path"; else fail "unexpected stderr on happy path: $stderr_out"; fi
if echo "$stderr_out" | grep -q "command not found"; then fail "stderr contains command not found noise"; else pass "stderr contains no command-not-found noise"; fi
if echo "$out" | grep -q "\[INFO\]"; then fail "stdout should not contain [INFO] noise"; else pass "stdout contains no [INFO] noise"; fi
cleanup_tmp "$tmp"

# 1b. legacy spec fallback: spec with no Requirement Restatement section → UNVERIFIABLE warning
tmp="$(make_tmp)"
echo "Test: legacy spec fallback (no Requirement Restatement)"
bash "$SDD" init "$tmp" --mode standard >/dev/null
# Create a minimal spec without a Requirement Restatement section
mkdir -p "$tmp/mydocs/specs"
printf -- '---\ntask-name: legacy-task\nstatus: draft\n---\n\n## Plan\n- [ ] Step 1: do something\n' > "$tmp/mydocs/specs/v1.0-legacy-task.md"
out=$(bash "$SDD" review-execute "$tmp" 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "legacy-spec exits 0"; else fail "legacy-spec expected exit 0, got $exit_code"; fi
if echo "$out" | grep -q "\[WARN\] Invocation metadata not found"; then pass "legacy-spec outputs UNVERIFIABLE warning"; else fail "missing UNVERIFIABLE warning for legacy spec"; fi
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

# 4. multi-commit diff includes changes from more than HEAD~1
tmp="$(make_tmp)"
echo "Test: multi-commit diff coverage"
git_init_repo "$tmp"
bash "$SDD" init "$tmp" --mode standard >/dev/null
bash "$SDD" discover "$tmp" --task-name "diff-coverage" --requirement "review execute diff coverage" >/dev/null
printf 'base\n' > "$tmp/base.txt"
git_commit_all "$tmp" "main branch baseline"
git -C "$tmp" checkout -b feature/review-diff >/dev/null 2>&1
printf 'from commit b\n' > "$tmp/file_b.txt"
git_commit_all "$tmp" "add file b"
printf 'from commit c\n' > "$tmp/file_c.txt"
git_commit_all "$tmp" "add file c"
stdout_file="$tmp/multi.stdout"
stderr_file="$tmp/multi.stderr"
bash "$SDD" review-execute "$tmp" >"$stdout_file" 2>"$stderr_file" && exit_code=0 || exit_code=$?
out="$(cat "$stdout_file")"
stderr_out="$(cat "$stderr_file")"
if [ "$exit_code" -eq 0 ]; then pass "multi-commit review-execute exits 0"; else fail "multi-commit review-execute expected 0, got $exit_code"; fi
if echo "$out" | grep -q "file_b.txt"; then pass "multi-commit diff includes earlier commit changes"; else fail "multi-commit diff missing earlier commit changes"; fi
if echo "$out" | grep -q "file_c.txt"; then pass "multi-commit diff includes latest commit changes"; else fail "multi-commit diff missing latest commit changes"; fi
if [ -z "$stderr_out" ]; then pass "multi-commit stderr is empty"; else fail "unexpected multi-commit stderr: $stderr_out"; fi
cleanup_tmp "$tmp"

# 5. single-commit repo falls back gracefully
tmp="$(make_tmp)"
echo "Test: single-commit repo fallback"
git_init_repo "$tmp"
bash "$SDD" init "$tmp" --mode standard >/dev/null
bash "$SDD" discover "$tmp" --task-name "single-commit" --requirement "single commit diff" >/dev/null
git_commit_all "$tmp" "initial task commit"
stdout_file="$tmp/single.stdout"
stderr_file="$tmp/single.stderr"
bash "$SDD" review-execute "$tmp" >"$stdout_file" 2>"$stderr_file" && exit_code=0 || exit_code=$?
out="$(cat "$stdout_file")"
stderr_out="$(cat "$stderr_file")"
if [ "$exit_code" -eq 0 ]; then pass "single-commit review-execute exits 0"; else fail "single-commit review-execute expected 0, got $exit_code"; fi
if echo "$out" | grep -q "## REVIEW EXECUTE PROMPT (4-Axis)"; then pass "single-commit repo still emits prompt"; else fail "single-commit repo missing prompt"; fi
if echo "$out" | grep -q "(no git diff available)"; then pass "single-commit repo uses graceful no-diff fallback"; else fail "single-commit repo missing no-diff fallback"; fi
if [ -z "$stderr_out" ]; then pass "single-commit stderr is empty"; else fail "unexpected single-commit stderr: $stderr_out"; fi
cleanup_tmp "$tmp"

echo "tests/test_review_execute.sh: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
