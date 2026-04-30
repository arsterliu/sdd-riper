#!/bin/bash
echo "--- Test Suite ---"
bash tests/run_all.sh 2>&1

echo "--- S10 versioned path ---"
T=$(mktemp -d)
bash sdd.sh init "$T" --mode standard >/dev/null 2>&1
bash sdd.sh discover "$T" --task-name "my-feature" --requirement "User login" >/dev/null 2>&1
ls "$T/mydocs/specs/v1.0-my-feature.md" >/dev/null 2>&1 && echo "S10_PASS" || echo "S10_FAIL"

echo "--- create-codemap UPDATE mode ---"
T2=$(mktemp -d)
bash sdd.sh init "$T2" --mode standard >/dev/null 2>&1
bash sdd.sh new-codemap "$T2" "auth" >/dev/null 2>&1
bash sdd.sh create-codemap "$T2" --module "auth" > /tmp/cm.txt 2>&1
grep -q "UPDATE CODEMAP PROMPT" /tmp/cm.txt && echo "UPDATE_PASS" || echo "UPDATE_FAIL"
grep -q "v1.0-auth" /tmp/cm.txt && echo "PATH_PASS" || echo "PATH_FAIL"

echo "--- archive status writeback ---"
T3=$(mktemp -d)
bash sdd.sh init "$T3" --mode standard >/dev/null 2>&1
bash sdd.sh discover "$T3" --task-name "arch-test" --requirement "r" >/dev/null 2>&1
bash sdd.sh archive "$T3" "arch-test" >/dev/null 2>&1
SPEC="$T3/mydocs/specs/v1.0-arch-test.md"
if [ -f "$SPEC" ]; then
    grep -E "^status: archived" "$SPEC" >/dev/null 2>&1 && echo "ARCHIVE_PASS" || echo "ARCHIVE_FAIL"
    grep -E "^status: archived[[:space:]]+#" "$SPEC" >/dev/null 2>&1 && echo "COMMENT_KEPT" || echo "COMMENT_LOST"
else
    echo "ARCHIVE_FAIL (file missing)"
    echo "COMMENT_LOST (file missing)"
fi

echo "--- discover --help has --version ---"
bash sdd.sh discover --help 2>&1 | grep -q "\-\-version" && echo "HELP_PASS" || echo "HELP_FAIL"

echo "--- run_qa.sh deleted ---"
ls run_qa.sh >/dev/null 2>&1 && echo "DELETED_FAIL" || echo "DELETED_PASS"
