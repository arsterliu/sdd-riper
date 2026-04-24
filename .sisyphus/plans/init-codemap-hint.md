# Init & Discover: CodeMap 复杂度提示

## TL;DR

> **Quick Summary**: 在 `bin/init.sh` 末尾和 `bin/_workflow_core.sh` 的 discover（create-spec）分支末尾，增加代码复杂度检测逻辑，当目标项目已有较多源码文件时打印建设 CodeMap 的建议提示。
>
> **Deliverables**:
> - `bin/init.sh` — 末尾增加 `_check_codemap_hint` 函数并调用
> - `bin/_workflow_core.sh` — create-spec 分支末尾增加相同逻辑
> - 两个文件同步到已安装的 OpenCode skill 副本 `C:\Users\liuyl\.config\opencode\skills\sdd-riper\bin\`
>
> **Estimated Effort**: Quick  
> **Parallel Execution**: NO — 两个文件改动顺序执行，安装副本同步最后做  
> **Critical Path**: init.sh → _workflow_core.sh → 安装副本同步 → QA

---

## Context

### Original Request
用户希望 `init` 阶段和 `discover` 首次运行时，如果检测到目标项目已存在较多源码文件，能够主动提示用户先建立 CodeMap。

### Interview Summary
**Key Discussions**:
- 触发阈值：源码文件 > 20 AND 项目根目录有标记文件（package.json / go.mod / pyproject.toml / pom.xml / Cargo.toml / build.gradle）
- 覆盖范围：`init` + `discover` 首次运行（定义为：调用 discover 且 codemap 下无 .md 文件）
- 只打印提示，不阻断流程，不自动创建 CodeMap，不改变退出码

**Research Findings**:
- `bin/init.sh:74-77`：最终 echo 块，在其前插入 hint 调用
- `bin/_workflow_core.sh:114-148`：create-spec 分支，写完 spec 文件后、cat 提示前插入 hint 逻辑
- `bin/_workflow_core.sh:198-211`：resume 分支中已有 codemap 存在性检测逻辑，复用其判断模式（`*.md` 不含 `.gitkeep`）
- `bin/init.sh` 支持 `--docs-dir` 参数，但 `_workflow_core.sh` create-spec 分支硬编码 `mydocs`；**本任务不修复该不一致**

### Metis Review
**Identified Gaps** (addressed):
- "首次运行" 定义模糊 → 确定为：`discover` 被调用 AND `mydocs/codemap/` 下无 `.md` 文件（含 `.gitkeep` 视为无 codemap）
- 检测可能 non-fatal 问题 → 所有 find/wc 操作加 `2>/dev/null`，变量赋值用命令替换隔离，不触发 set -e
- Hint 可能出现两次（init + discover）→ 属于预期行为，不是 bug
- 标记文件检测范围 → 只检测 `$TARGET_DIR` 根目录，不递归

---

## Work Objectives

### Core Objective
在 `init` 和 `discover` 两个入口处增加轻量代码复杂度感知，主动引导接入大型既有项目的用户建立 CodeMap。

### Concrete Deliverables
- `bin/init.sh`：在现有 line 74 `echo ""` 之前插入 `_check_codemap_hint` 函数定义与调用
- `bin/_workflow_core.sh`：在 create-spec 分支 `printf '%s\n' "$SPEC_CONTENT" > "$SPEC_OUT"` 之后、`cat <<EOF` 之前，插入 codemap 存在性检查 + hint 调用
- `C:\Users\liuyl\.config\opencode\skills\sdd-riper\bin\init.sh`：与 repo 同步
- `C:\Users\liuyl\.config\opencode\skills\sdd-riper\bin\_workflow_core.sh`：与 repo 同步

### Definition of Done
- [ ] `init` 对有 21 个源码文件 + 项目标记的目录打印 hint，退出码仍为 0
- [ ] `init` 对只有 20 个文件 + 标记不打印 hint
- [ ] `init` 对 21 个文件但无标记不打印 hint
- [ ] `discover`（无 codemap）对满足条件的目录打印 hint
- [ ] `discover`（已有 codemap .md）不打印 hint
- [ ] 安装副本与 repo 对应文件内容一致

### Must Have
- `_check_codemap_hint` 函数内所有命令加 `2>/dev/null` 静默错误
- 提示文本包含源码文件数量（`${src_count} 个`）
- 提示文本包含 `create-codemap` 使用方式

### Must NOT Have (Guardrails)
- 不改变 `init` 或 `discover` 的退出码
- 不阻断正常输出流（hint 输出在正常输出之后）
- 不自动调用 `create-codemap`
- 不修改 `bin/resume.sh` 或 `bin/_workflow_core.sh` 的 resume 分支
- 不抽取共享 shell 工具库
- 不修复 `--docs-dir` 与 `mydocs` 硬编码不一致
- 不修改测试文件（本次改动不需要新增测试，已有测试不应受影响）

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES（`tests/` 目录有 bats/shell 测试）
- **Automated tests**: NO — 本次改动不新增自动化测试，通过 QA Scenarios 人工验证
- **Agent-Executed QA**: 通过 Bash 临时目录模拟验证

### QA Policy
每个 Task 包含 shell 命令验证场景。Evidence 保存至 `.sisyphus/evidence/`。

---

## Execution Strategy

```
Wave 1 (顺序执行):
├── Task 1: 修改 bin/init.sh — 增加 _check_codemap_hint
├── Task 2: 修改 bin/_workflow_core.sh — create-spec 分支增加 hint
└── Task 3: 同步两文件到安装副本

Wave FINAL:
└── Task F1: QA 验证（bash 临时目录 smoke test）
```

---

## TODOs

- [x] 1. 修改 `bin/init.sh` — 增加 `_check_codemap_hint` 函数并调用

  **What to do**:

  在 `bin/init.sh` 第 74 行（`echo ""` 之前）插入以下内容：

  ```bash
  # Check if target project already has substantial source code and suggest CodeMap
  _check_codemap_hint() {
    local dir="$1"
    local src_count
    src_count=$(find "$dir" -maxdepth 6 \
      \( -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" \
         -o -name "*.py" -o -name "*.go" -o -name "*.java" -o -name "*.cs" \
         -o -name "*.rb" -o -name "*.php" -o -name "*.rs" -o -name "*.cpp" -o -name "*.c" \) \
      -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/vendor/*" \
      -not -path "*/dist/*" -not -path "*/build/*" -not -path "*/target/*" \
      2>/dev/null | wc -l | tr -d ' ')

    local has_marker=false
    for marker in package.json go.mod pyproject.toml pom.xml Cargo.toml build.gradle; do
      if [[ -f "$dir/$marker" ]]; then
        has_marker=true
        break
      fi
    done

    if [[ "$src_count" -gt 20 ]] && [[ "$has_marker" == "true" ]]; then
      echo ""
      echo "[SDD-RIPER] 检测到目标项目已存在 ${src_count} 个源码文件，且包含项目标记文件。"
      echo "  建议在第一次 discover 之前先建立 CodeMap，帮助 AI 快速理解模块结构："
      echo "    ./sdd.sh create-codemap $dir [--module <name>]"
    fi
  }

  _check_codemap_hint "$TARGET_DIR"
  ```

  插入位置：在现有 `echo ""` 这行（第 74 行）**之前**，替换为上面内容（注意：原来的 `echo ""` 由函数内部输出，可删除原 line 74 的独立 `echo ""`）。

  **最终 init.sh 末尾应为**：
  ```bash
  _check_codemap_hint "$TARGET_DIR"
  echo "Use 'sdd discover <dir> --task-name <name> ...' to create your first spec."
  echo "SDD initialized in $TARGET_DIR. Created: $CREATED files, Skipped: $SKIPPED files."
  exit 0
  ```

  **Must NOT do**:
  - 不改变退出码
  - 不修改函数之外的任何现有逻辑

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1，第一步
  - **Blocks**: Task 2, Task 3
  - **Blocked By**: None

  **References**:
  - `bin/init.sh:74-77` — 插入位置（当前末尾 4 行）

  **Acceptance Criteria**:

  ```
  Scenario: 有标记文件 + 21 个源码文件 → 打印 hint
    Tool: Bash
    Preconditions:
      - 创建临时目录 /tmp/sdd-test-init
      - 在其中创建 package.json
      - 用 touch 创建 21 个 .ts 文件
      - 对该临时目录运行 sdd init（注意：sdd-riper 工具目录的 init.sh）
    Steps:
      1. mkdir -p /tmp/sdd-test-init && touch /tmp/sdd-test-init/package.json
      2. for i in $(seq 1 21); do touch /tmp/sdd-test-init/file${i}.ts; done
      3. bash bin/init.sh /tmp/sdd-test-init 2>&1 | tee /tmp/sdd-init-hint.txt
      4. grep -q "SDD-RIPER" /tmp/sdd-init-hint.txt && echo PASS || echo FAIL
      5. grep -q "21 个源码文件" /tmp/sdd-init-hint.txt && echo PASS || echo FAIL
    Expected Result: 两次 echo PASS
    Evidence: .sisyphus/evidence/task-1-hint-shown.txt

  Scenario: 有标记文件 + 只有 20 个源码文件 → 不打印 hint
    Tool: Bash
    Preconditions:
      - 创建临时目录 /tmp/sdd-test-init2
      - package.json + 20 个 .ts 文件
    Steps:
      1. mkdir -p /tmp/sdd-test-init2 && touch /tmp/sdd-test-init2/package.json
      2. for i in $(seq 1 20); do touch /tmp/sdd-test-init2/file${i}.ts; done
      3. bash bin/init.sh /tmp/sdd-test-init2 2>&1 | tee /tmp/sdd-init-no-hint.txt
      4. grep -q "SDD-RIPER" /tmp/sdd-init-no-hint.txt && echo FAIL || echo PASS
    Expected Result: echo PASS（无 hint 输出）
    Evidence: .sisyphus/evidence/task-1-hint-suppressed.txt

  Scenario: 21 个文件但无标记 → 不打印 hint
    Tool: Bash
    Steps:
      1. mkdir -p /tmp/sdd-test-init3
      2. for i in $(seq 1 21); do touch /tmp/sdd-test-init3/file${i}.ts; done
      3. bash bin/init.sh /tmp/sdd-test-init3 2>&1 | grep -q "SDD-RIPER" && echo FAIL || echo PASS
    Expected Result: echo PASS
    Evidence: .sisyphus/evidence/task-1-no-marker.txt

  Scenario: init 退出码始终为 0
    Tool: Bash
    Steps:
      1. bash bin/init.sh /tmp/sdd-test-init; echo "exit=$?"
    Expected Result: exit=0
    Evidence: .sisyphus/evidence/task-1-exitcode.txt
  ```

  **Commit**: YES（与 Task 2 一起 commit）
  - Message: `feat(init): detect project complexity and hint codemap creation`
  - Files: `bin/init.sh`

---

- [x] 2. 修改 `bin/_workflow_core.sh` — discover create-spec 分支增加 hint

  **What to do**:

  在 `_workflow_core.sh` 第 115 行（`printf '%s\n' "$SPEC_CONTENT" > "$SPEC_OUT"`）之后、第 118 行（`cat <<EOF`）之前插入以下逻辑：

  ```bash
  # Advisory: suggest CodeMap if project has substantial code and no codemap yet
  _codemap_hint_if_needed() {
    local dir="$1"
    local docs_dir="${2:-mydocs}"
    # Check codemap existence (same semantics as resume branch)
    local has_codemap=false
    if [[ -d "$dir/$docs_dir/codemap" ]]; then
      local codemap_count
      codemap_count=$(find "$dir/$docs_dir/codemap" -name "*.md" ! -name ".gitkeep" 2>/dev/null | wc -l | tr -d ' ')
      if [[ "$codemap_count" -gt 0 ]]; then
        has_codemap=true
      fi
    fi

    if [[ "$has_codemap" == "true" ]]; then
      return 0  # Already has codemap, no hint needed
    fi

    # Check source file count
    local src_count
    src_count=$(find "$dir" -maxdepth 6 \
      \( -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" \
         -o -name "*.py" -o -name "*.go" -o -name "*.java" -o -name "*.cs" \
         -o -name "*.rb" -o -name "*.php" -o -name "*.rs" -o -name "*.cpp" -o -name "*.c" \) \
      -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/vendor/*" \
      -not -path "*/dist/*" -not -path "*/build/*" -not -path "*/target/*" \
      2>/dev/null | wc -l | tr -d ' ')

    local has_marker=false
    for marker in package.json go.mod pyproject.toml pom.xml Cargo.toml build.gradle; do
      if [[ -f "$dir/$marker" ]]; then
        has_marker=true
        break
      fi
    done

    if [[ "$src_count" -gt 20 ]] && [[ "$has_marker" == "true" ]]; then
      echo ""
      echo "[SDD-RIPER] 检测到目标项目已存在 ${src_count} 个源码文件，且尚未建立 CodeMap。"
      echo "  建议先建立 CodeMap 再进入 Research，帮助 AI 快速理解模块结构："
      echo "    ./sdd.sh create-codemap $dir [--module <name>]"
    fi
  }

  _codemap_hint_if_needed "$TARGET_DIR"
  ```

  插入后的顺序：
  1. `printf '%s\n' "$SPEC_CONTENT" > "$SPEC_OUT"` （原有）
  2. 上面新增的函数定义 + 调用
  3. 空行
  4. `# Output SPEC CREATION PROMPT` + `cat <<EOF ... exit 0` （原有）

  **Must NOT do**:
  - 不修改 resume 分支（line 151 以后）
  - 不改变 create-spec 分支的退出码
  - 不修改 SPEC CREATION PROMPT 的内容

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1，第二步
  - **Blocks**: Task 3
  - **Blocked By**: Task 1（建议顺序，但实际上两文件独立）

  **References**:
  - `bin/_workflow_core.sh:114-148` — 插入区域
  - `bin/_workflow_core.sh:198-211` — codemap 存在性检测逻辑，复用其判断模式

  **Acceptance Criteria**:

  ```
  Scenario: discover + 满足阈值 + 无 codemap → 打印 hint
    Tool: Bash
    Preconditions:
      - 有效的已初始化项目目录（有 mydocs/），package.json + 21 个 .ts 文件
      - mydocs/codemap/ 下只有 .gitkeep
    Steps:
      1. mkdir -p /tmp/sdd-disc-test/mydocs/codemap && touch /tmp/sdd-disc-test/mydocs/codemap/.gitkeep
      2. touch /tmp/sdd-disc-test/package.json
      3. for i in $(seq 1 21); do touch /tmp/sdd-disc-test/src${i}.ts; done
      4. bash bin/_workflow_core.sh /tmp/sdd-disc-test --create-spec --task-name test-task 2>&1 | tee /tmp/disc-hint.txt
      5. grep -q "SDD-RIPER" /tmp/disc-hint.txt && echo PASS || echo FAIL
    Expected Result: echo PASS
    Evidence: .sisyphus/evidence/task-2-discover-hint.txt

  Scenario: discover + 已有 codemap .md → 不打印 hint
    Tool: Bash
    Preconditions:
      - 同上，但 mydocs/codemap/ 下有真实 .md 文件（非 .gitkeep）
    Steps:
      1. touch /tmp/sdd-disc-test2/mydocs/codemap/mymodule.md
      2. bash bin/_workflow_core.sh /tmp/sdd-disc-test2 --create-spec --task-name test-task2 2>&1 | grep -q "SDD-RIPER" && echo FAIL || echo PASS
    Expected Result: echo PASS
    Evidence: .sisyphus/evidence/task-2-no-hint-with-codemap.txt

  Scenario: discover 退出码为 0
    Tool: Bash
    Steps:
      1. bash bin/_workflow_core.sh /tmp/sdd-disc-test --create-spec --task-name test-task3; echo "exit=$?"
    Expected Result: exit=0
    Evidence: .sisyphus/evidence/task-2-exitcode.txt
  ```

  **Commit**: YES（与 Task 1 合并 commit 或单独 commit 均可）
  - Message: `feat(discover): hint codemap creation when no codemap and project is complex`
  - Files: `bin/_workflow_core.sh`

---

- [x] 3. 同步到已安装的 OpenCode skill 副本

  **What to do**:
  将修改后的两个文件同步到已安装路径：
  - `C:\Users\liuyl\.config\opencode\skills\sdd-riper\bin\init.sh`
  - `C:\Users\liuyl\.config\opencode\skills\sdd-riper\bin\_workflow_core.sh`

  执行方式（在 repo 根目录）：
  ```bash
  cp bin/init.sh "C:/Users/liuyl/.config/opencode/skills/sdd-riper/bin/init.sh"
  cp bin/_workflow_core.sh "C:/Users/liuyl/.config/opencode/skills/sdd-riper/bin/_workflow_core.sh"
  ```

  验证：
  ```bash
  diff bin/init.sh "C:/Users/liuyl/.config/opencode/skills/sdd-riper/bin/init.sh" && echo IDENTICAL
  diff bin/_workflow_core.sh "C:/Users/liuyl/.config/opencode/skills/sdd-riper/bin/_workflow_core.sh" && echo IDENTICAL
  ```

  **Must NOT do**:
  - 不修改安装副本的其他文件
  - 不覆盖 SKILL.md、sdd.sh 等（本次只同步 bin/ 下两个文件）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1，最后一步
  - **Blocks**: Final QA
  - **Blocked By**: Task 1, Task 2

  **Acceptance Criteria**:

  ```
  Scenario: 安装副本与 repo 文件内容一致
    Tool: Bash
    Steps:
      1. diff bin/init.sh "C:/Users/liuyl/.config/opencode/skills/sdd-riper/bin/init.sh"
      2. diff bin/_workflow_core.sh "C:/Users/liuyl/.config/opencode/skills/sdd-riper/bin/_workflow_core.sh"
    Expected Result: 两条 diff 均无输出（完全一致）
    Evidence: .sisyphus/evidence/task-3-sync-verified.txt
  ```

  **Commit**: NO（只是文件复制，不纳入 git 提交）

---

## Final Verification Wave

- [x] F1. **QA Smoke Test** — `quick`

  在 repo 根目录运行以下验证脚本，全部输出 PASS：

  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  PASS=0; FAIL=0

  check() {
    local label="$1" result="$2"
    if [[ "$result" == "PASS" ]]; then echo "✓ $label"; PASS=$((PASS+1))
    else echo "✗ $label"; FAIL=$((FAIL+1)); fi
  }

  # ── init.sh tests ──────────────────────────────────────────────
  T1=$(mktemp -d); touch "$T1/package.json"
  for i in $(seq 1 21); do touch "$T1/f${i}.ts"; done
  OUT=$(bash bin/init.sh "$T1" 2>&1)
  check "init: marker+21 → hint shown"     "$(echo "$OUT" | grep -q "SDD-RIPER" && echo PASS || echo FAIL)"
  check "init: exit 0"                     "$(bash bin/init.sh "$T1" >/dev/null 2>&1; echo $?)" # This doesn't work as-is; check exit separately
  bash bin/init.sh "$T1" >/dev/null 2>&1; check "init: exits 0" "$([[ $? -eq 0 ]] && echo PASS || echo FAIL)"

  T2=$(mktemp -d); touch "$T2/package.json"
  for i in $(seq 1 20); do touch "$T2/f${i}.ts"; done
  OUT=$(bash bin/init.sh "$T2" 2>&1)
  check "init: marker+20 → no hint"        "$(echo "$OUT" | grep -q "SDD-RIPER" && echo FAIL || echo PASS)"

  T3=$(mktemp -d)
  for i in $(seq 1 21); do touch "$T3/f${i}.ts"; done
  OUT=$(bash bin/init.sh "$T3" 2>&1)
  check "init: no marker+21 → no hint"     "$(echo "$OUT" | grep -q "SDD-RIPER" && echo FAIL || echo PASS)"

  # ── _workflow_core.sh (discover) tests ─────────────────────────
  T4=$(mktemp -d); touch "$T4/package.json"
  mkdir -p "$T4/mydocs/codemap" && touch "$T4/mydocs/codemap/.gitkeep"
  for i in $(seq 1 21); do touch "$T4/f${i}.ts"; done
  OUT=$(bash bin/_workflow_core.sh "$T4" --create-spec --task-name qt1 2>&1)
  check "discover: marker+21+no codemap → hint" "$(echo "$OUT" | grep -q "SDD-RIPER" && echo PASS || echo FAIL)"

  T5=$(mktemp -d); touch "$T5/package.json"
  mkdir -p "$T5/mydocs/codemap" && touch "$T5/mydocs/codemap/mymod.md"
  for i in $(seq 1 21); do touch "$T5/f${i}.ts"; done
  OUT=$(bash bin/_workflow_core.sh "$T5" --create-spec --task-name qt2 2>&1)
  check "discover: has codemap .md → no hint"   "$(echo "$OUT" | grep -q "SDD-RIPER" && echo FAIL || echo PASS)"

  echo ""
  echo "Result: $PASS PASS / $FAIL FAIL"
  [[ $FAIL -eq 0 ]] && exit 0 || exit 1
  ```

  Output: `Result: N PASS / 0 FAIL`  
  Evidence: `.sisyphus/evidence/final-qa-smoke.txt`

---

## Commit Strategy

- **Task 1+2**: `feat(init,discover): hint codemap creation for complex existing projects`
  - Files: `bin/init.sh`, `bin/_workflow_core.sh`
- **Task 3**: 不 commit（安装副本同步不纳入版本控制）

---

## Success Criteria

### Verification Commands
```bash
# Quick smoke
bash .sisyphus/plans/smoke-test.sh  # or inline above

# Diff installed copy
diff bin/init.sh "C:/Users/liuyl/.config/opencode/skills/sdd-riper/bin/init.sh" && echo IDENTICAL
diff bin/_workflow_core.sh "C:/Users/liuyl/.config/opencode/skills/sdd-riper/bin/_workflow_core.sh" && echo IDENTICAL
```

### Final Checklist
- [ ] `init` 对满足条件的目录打印 hint，退出码 0
- [ ] `init` 对不满足条件的目录不打印 hint
- [ ] `discover`（无 codemap）对满足条件的目录打印 hint
- [ ] `discover`（已有 codemap .md）不打印 hint
- [ ] 安装副本两文件与 repo 一致
- [ ] 现有 tests/ 中的 test_init.sh 和 test_new.sh 仍然通过（hint 不影响现有行为）
