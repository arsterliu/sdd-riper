#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$REPO_ROOT"

# S1: review-execute basic
echo "=== S1 ==="
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
bash sdd.sh init "$T" --mode standard > /dev/null
bash sdd.sh discover "$T" --task-name "qa-test-task" --requirement "QA smoke test" > /dev/null
bash sdd.sh review-execute "$T" > s1.out
cat s1.out | grep -q "## REVIEW EXECUTE PROMPT" && echo "S1: PASS" || echo "S1: FAIL"

# S2: review-execute with nonexistent dir
echo "=== S2 ==="
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
bash sdd.sh review-execute /tmp/nonexistent-dir 2> s2.out || true
cat s2.out | grep -q "ERROR" && echo "S2: PASS" || echo "S2: FAIL"

# S3: debug basic
echo "=== S3 ==="
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
bash sdd.sh init "$T" --mode standard > /dev/null
bash sdd.sh discover "$T" --task-name "qa-test-task" --requirement "QA smoke test" > /dev/null
bash sdd.sh debug "$T" > s3.out
cat s3.out | grep -q "## DEBUG PROMPT" && echo "S3: PASS" || echo "S3: FAIL"

# S4: debug with error message
echo "=== S4 ==="
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
bash sdd.sh init "$T" --mode standard > /dev/null
bash sdd.sh discover "$T" --task-name "qa-test-task" --requirement "QA smoke test" > /dev/null
bash sdd.sh debug "$T" --error "NullPointerException: line 42" > s4.out
cat s4.out | grep -q "NullPointerException: line 42" && echo "S4: PASS" || echo "S4: FAIL"

# S5: create-codemap
echo "=== S5 ==="
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
bash sdd.sh init "$T" --mode standard > /dev/null
bash sdd.sh discover "$T" --task-name "qa-test-task" --requirement "QA smoke test" > /dev/null
bash sdd.sh create-codemap "$T" > s5.out
cat s5.out | grep -q "## CREATE CODEMAP PROMPT" && echo "S5: PASS" || echo "S5: FAIL"

# S6: create-projectmap
echo "=== S6 ==="
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
bash sdd.sh init "$T" --mode standard > /dev/null
bash sdd.sh discover "$T" --task-name "qa-test-task" --requirement "QA smoke test" > /dev/null
bash sdd.sh create-projectmap "$T" > s6.out
cat s6.out | grep -q "## CREATE PROJECTMAP PROMPT" && echo "S6: PASS" || echo "S6: FAIL"

# S7: create-projectmap with existing projectmap
echo "=== S7 ==="
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
bash sdd.sh init "$T" --mode standard > /dev/null
bash sdd.sh discover "$T" --task-name "qa-test-task" --requirement "QA smoke test" > /dev/null
bash sdd.sh new-projectmap "$T" --repos "frontend,backend" > /dev/null
bash sdd.sh create-projectmap "$T" > s7.out 2>&1 || true
cat s7.out | grep -q -E "already exists|--force" && echo "S7: PASS" || echo "S7: FAIL"

# S8: create-projectmap with --force
echo "=== S8 ==="
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
bash sdd.sh init "$T" --mode standard > /dev/null
bash sdd.sh discover "$T" --task-name "qa-test-task" --requirement "QA smoke test" > /dev/null
bash sdd.sh new-projectmap "$T" --repos "frontend,backend" > /dev/null
bash sdd.sh create-projectmap "$T" --force > s8.out
cat s8.out | grep -q "## CREATE PROJECTMAP PROMPT" && echo "S8: PASS" || echo "S8: FAIL"

# S9: build-context-bundle
echo "=== S9 ==="
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
bash sdd.sh init "$T" --mode standard > /dev/null
bash sdd.sh discover "$T" --task-name "qa-test-task" --requirement "QA smoke test" > /dev/null
bash sdd.sh build-context-bundle "$T" > s9.out
cat s9.out | grep -q "## BUILD CONTEXT BUNDLE PROMPT" && echo "S9: PASS" || echo "S9: FAIL"

# S10: discover creates versioned spec file (v1.0-my-feature.md)
echo "=== S10 ==="
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
bash sdd.sh init "$T" --mode standard > /dev/null
bash sdd.sh discover "$T" --task-name "my-feature" --requirement "User login" --goal "Allow authentication" > s10.out
cat s10.out | grep -q "## SPEC CREATION PROMPT" && [ -f "$T/mydocs/specs/v1.0-my-feature.md" ] && echo "S10: PASS" || echo "S10: FAIL"

# Cleanup temp files
rm -f s*.out
