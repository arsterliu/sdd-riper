#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

TMPDIR_QA=$(mktemp -d)
trap 'rm -rf "$TMPDIR_QA" s*.out' EXIT

bash sdd.sh init "$TMPDIR_QA" --mode standard > /dev/null
bash sdd.sh discover "$TMPDIR_QA" --task-name "qa-test-task" --requirement "QA smoke test" > /dev/null

echo "=== S1 ==="
bash sdd.sh review-execute "$TMPDIR_QA" > s1.out
cat s1.out | grep -q "## REVIEW EXECUTE PROMPT" && echo "S1: PASS" || echo "S1: FAIL"

echo "=== S2 ==="
bash sdd.sh review-execute /tmp/nonexistent-dir 2> s2.out || true
cat s2.out | grep -q "ERROR" && echo "S2: PASS" || echo "S2: FAIL"

echo "=== S3 ==="
bash sdd.sh debug "$TMPDIR_QA" > s3.out
cat s3.out | grep -q "## DEBUG PROMPT" && echo "S3: PASS" || echo "S3: FAIL"

echo "=== S4 ==="
bash sdd.sh debug "$TMPDIR_QA" --error "NullPointerException: line 42" > s4.out
cat s4.out | grep -q "NullPointerException: line 42" && echo "S4: PASS" || echo "S4: FAIL"

echo "=== S5 ==="
bash sdd.sh create-codemap "$TMPDIR_QA" > s5.out
cat s5.out | grep -q "## CREATE CODEMAP PROMPT" && echo "S5: PASS" || echo "S5: FAIL"

echo "=== S6 ==="
bash sdd.sh create-projectmap "$TMPDIR_QA" > s6.out
cat s6.out | grep -q "## CREATE PROJECTMAP PROMPT" && echo "S6: PASS" || echo "S6: FAIL"

echo "=== S7 ==="
bash sdd.sh new-projectmap "$TMPDIR_QA" --repos "frontend,backend" > /dev/null
bash sdd.sh create-projectmap "$TMPDIR_QA" > s7.out 2>&1 || true
cat s7.out | grep -q -E "already exists|--force" && echo "S7: PASS" || echo "S7: FAIL"

echo "=== S8 ==="
bash sdd.sh create-projectmap "$TMPDIR_QA" --force > s8.out
cat s8.out | grep -q "## CREATE PROJECTMAP PROMPT" && echo "S8: PASS" || echo "S8: FAIL"

echo "=== S9 ==="
bash sdd.sh build-context-bundle "$TMPDIR_QA" > s9.out
cat s9.out | grep -q "## BUILD CONTEXT BUNDLE PROMPT" && echo "S9: PASS" || echo "S9: FAIL"

echo "=== S10 ==="
bash sdd.sh discover "$TMPDIR_QA" --task-name "my-feature" --requirement "User login" --goal "Allow authentication" > s10.out
cat s10.out | grep -q "## SPEC CREATION PROMPT" && [ -f "$TMPDIR_QA/mydocs/specs/my-feature.md" ] && echo "S10: PASS" || echo "S10: FAIL"
