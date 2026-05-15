#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
SDD="$REPO_ROOT/sdd.sh"

mkdir -p "$REPO_ROOT/tmp"

PASS=0; FAIL=0; ERRORS=()
pass() { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); ERRORS+=("$1"); }
make_tmp() { mktemp -d "$REPO_ROOT/tmp/test-XXXXXX"; }
cleanup_tmp() { [[ -n "${1:-}" ]] && rm -rf "$1"; }

# 1. discover happy path
tmp="$(make_tmp)"
echo "Test: discover happy path"
bash "$SDD" init "$tmp" --mode standard >/dev/null
out=$(bash "$SDD" discover "$tmp" --task-name "login-flow" --requirement "支持登录" --goal "完成认证") && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "discover exits 0"; else fail "discover exited $exit_code"; fi
if echo "$out" | grep -q "## SPEC CREATION PROMPT"; then pass "discover outputs spec prompt"; else fail "discover missing spec prompt"; fi
if [ -f "$tmp/mydocs/specs/v1.0-login-flow.md" ]; then pass "discover created spec"; else fail "discover did not create spec"; fi
cleanup_tmp "$tmp"

# 2. discover missing task-name
tmp="$(make_tmp)"
echo "Test: discover missing task-name"
bash "$SDD" init "$tmp" --mode standard >/dev/null
out=$(bash "$SDD" discover "$tmp" --requirement "foo" 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 3 ]; then pass "discover missing task-name exits 3"; else fail "discover missing task-name expected 3, got $exit_code"; fi
cleanup_tmp "$tmp"

# 3. discover invalid task-name
tmp="$(make_tmp)"
echo "Test: discover invalid task-name"
bash "$SDD" init "$tmp" --mode standard >/dev/null
out=$(bash "$SDD" discover "$tmp" --task-name "../evil" 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 3 ]; then pass "discover invalid task-name exits 3"; else fail "discover invalid task-name expected 3, got $exit_code"; fi
if echo "$out" | grep -q "use only letters, numbers, hyphens, and underscores"; then pass "discover invalid task-name reports error"; else fail "discover invalid task-name missing message"; fi
cleanup_tmp "$tmp"

# 4. discover no mydocs
tmp="$(make_tmp)"
echo "Test: discover no mydocs"
out=$(bash "$SDD" discover "$tmp" --task-name "foo" 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 1 ]; then pass "discover no-mydocs exits 1"; else fail "discover no-mydocs expected 1, got $exit_code"; fi
cleanup_tmp "$tmp"

# 5. discover help
echo "Test: discover help"
out=$(bash "$SDD" discover --help 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "discover help exits 0"; else fail "discover help exited $exit_code"; fi
if echo "$out" | grep -q "Start a new task"; then pass "discover help text ok"; else fail "discover help text missing"; fi

# 6. resume happy path (no specs)
tmp="$(make_tmp)"
echo "Test: resume happy path (no specs)"
bash "$SDD" init "$tmp" --mode standard >/dev/null
out=$(bash "$SDD" resume "$tmp") && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "resume exits 0"; else fail "resume exited $exit_code"; fi
if echo "$out" | grep -q "ACTIVE_SPECS:"; then pass "resume outputs active specs"; else fail "resume missing active specs"; fi
cleanup_tmp "$tmp"

# 7. resume happy path (with spec)
tmp="$(make_tmp)"
echo "Test: resume happy path (with spec)"
bash "$SDD" init "$tmp" --mode standard >/dev/null
bash "$SDD" discover "$tmp" --task-name "test-feature" --requirement "resume test task" >/dev/null
out=$(bash "$SDD" resume "$tmp") && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "resume with spec exits 0"; else fail "resume with spec exited $exit_code"; fi
if echo "$out" | grep -q "LATEST_SPEC:.*\.md"; then pass "resume outputs latest spec"; else fail "resume latest spec missing"; fi
cleanup_tmp "$tmp"

# 8. resume uninit project
tmp="$(make_tmp)"
echo "Test: resume uninit project"
out=$(bash "$SDD" resume "$tmp" 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 1 ]; then pass "resume uninit exits 1"; else fail "resume uninit expected 1, got $exit_code"; fi
cleanup_tmp "$tmp"

# 8b. resume draft -> research_or_plan
tmp="$(make_tmp)"
echo "Test: resume draft -> research_or_plan"
bash "$SDD" init "$tmp" --mode standard >/dev/null
bash "$SDD" discover "$tmp" --task-name "draft-flow" --requirement "draft phase test" >/dev/null
out=$(bash "$SDD" resume "$tmp") && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "resume draft exits 0"; else fail "resume draft exited $exit_code"; fi
if echo "$out" | grep -q "PHASE_HINT: research_or_plan"; then pass "resume draft phase hint research_or_plan"; else fail "resume draft phase hint wrong"; fi
cleanup_tmp "$tmp"

# 9. resume with codemap
tmp="$(make_tmp)"
echo "Test: resume with codemap"
bash "$SDD" init "$tmp" --mode standard >/dev/null
bash "$SDD" new-codemap "$tmp" "auth-flow" >/dev/null
out=$(bash "$SDD" resume "$tmp") && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "resume with codemap exits 0"; else fail "resume with codemap exited $exit_code"; fi
if echo "$out" | grep -q "HAS_CODEMAP: yes"; then pass "resume has codemap"; else fail "resume missing has codemap"; fi
if echo "$out" | grep -q "CODEMAP_MODULES: v1.0-auth-flow"; then pass "resume codemap modules listed"; else fail "resume codemap modules missing"; fi
cleanup_tmp "$tmp"

# 10. resume no args
echo "Test: resume no args"
out=$(bash "$SDD" resume 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "resume no args shows help"; else fail "resume no args expected 0, got $exit_code"; fi
if echo "$out" | grep -q "Usage: resume.sh"; then pass "resume no args help text"; else fail "resume no args help missing"; fi

# 11. resume rejects create-spec
tmp="$(make_tmp)"
echo "Test: resume rejects create-spec"
bash "$SDD" init "$tmp" --mode standard >/dev/null
out=$(bash "$SDD" resume "$tmp" --create-spec 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 3 ]; then pass "resume rejects create-spec exits 3"; else fail "resume rejects create-spec expected 3, got $exit_code"; fi
if echo "$out" | grep -q "not valid for resume"; then pass "resume rejects create-spec message"; else fail "resume rejects create-spec missing message"; fi
cleanup_tmp "$tmp"

# 12. resume phase hint: review has content -> archive
tmp="$(make_tmp)"
echo "Test: resume review content -> archive"
bash "$SDD" init "$tmp" --mode standard >/dev/null
bash "$SDD" discover "$tmp" --task-name "approved-flow" --requirement "approved phase test" >/dev/null
spec_file=$(find "$tmp/mydocs/specs" -name "*approved-flow*.md" | head -1)
# Sign the plan inside ## Plan section, then add review verdict content
sed -i.bak 's/^Plan Approved By:$/Plan Approved By: Alice/' "$spec_file" && rm -f "$spec_file.bak"
sed -i.bak 's/^<!-- Spec vs Code.*$/Review Pass 1 — 2026-01-01T00:00:00Z — PASS/' "$spec_file" && rm -f "$spec_file.bak"
out=$(bash "$SDD" resume "$tmp") && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "resume archive exits 0"; else fail "resume archive exited $exit_code"; fi
if echo "$out" | grep -q "PHASE_HINT: archive"; then pass "resume review content phase hint archive"; else fail "resume review content phase hint wrong"; fi
cleanup_tmp "$tmp"

# 13. resume phase hint: plan signed, no review content -> execute
tmp="$(make_tmp)"
echo "Test: resume done -> archive"
bash "$SDD" init "$tmp" --mode standard >/dev/null
bash "$SDD" discover "$tmp" --task-name "done-flow" --requirement "done phase test" >/dev/null
spec_file=$(find "$tmp/mydocs/specs" -name "*done-flow*.md" | head -1)
sed -i.bak 's/^Plan Approved By:$/Plan Approved By: Alice/' "$spec_file" && rm -f "$spec_file.bak"
out=$(bash "$SDD" resume "$tmp") && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "resume done exits 0"; else fail "resume done exited $exit_code"; fi
if echo "$out" | grep -q "PHASE_HINT: execute"; then pass "resume done phase hint execute"; else fail "resume done phase hint wrong"; fi
cleanup_tmp "$tmp"

# 14. resume phase hint: approved plan -> execute
tmp="$(make_tmp)"
echo "Test: resume approved plan -> execute"
bash "$SDD" init "$tmp" --mode standard >/dev/null
bash "$SDD" discover "$tmp" --task-name "execute-flow" --requirement "execute phase test" >/dev/null
spec_file=$(find "$tmp/mydocs/specs" -name "*execute-flow*.md" | head -1)
sed -i.bak 's/^Plan Approved By:$/Plan Approved By: Alice/' "$spec_file" && rm -f "$spec_file.bak"
out=$(bash "$SDD" resume "$tmp") && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 0 ]; then pass "resume execute exits 0"; else fail "resume execute exited $exit_code"; fi
if echo "$out" | grep -q "PHASE_HINT: execute"; then pass "resume execute phase hint execute"; else fail "resume execute phase hint wrong"; fi
cleanup_tmp "$tmp"

# 15. _gen_ai_configs is not public
echo "Test: _gen_ai_configs not public"
out=$(bash "$SDD" _gen_ai_configs 2>&1) && exit_code=0 || exit_code=$?
if [ "$exit_code" -eq 3 ]; then pass "_gen_ai_configs hidden exits 3"; else fail "_gen_ai_configs hidden expected 3, got $exit_code"; fi
if echo "$out" | grep -q "Unknown command"; then pass "_gen_ai_configs hidden message"; else fail "_gen_ai_configs hidden missing message"; fi

echo "tests/test_discover_resume.sh: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
