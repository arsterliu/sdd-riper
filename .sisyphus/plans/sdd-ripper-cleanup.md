# SDD-RIPER 项目清理与修复计划

## TL;DR

> **Quick Summary**: 行为保留式清理——修复 4 个严重 Bug、提取共享函数库消除 4 处重复、修复 1 处设计错误、同步规范化 CLI help 文本与文档措辞、迁移 run_qa.sh 冒烟场景至 tests/。
>
> **Deliverables**:
> - `bin/_common.sh`：纯工具函数共享库（next_version、latest_spec 选择、find_source_spec）
> - 4 个严重 Bug 修复（run_qa S10、new-projectmap awk、create-codemap 路径、archive status writeback）
> - 4 处代码重复消除（4 个文件引用 _common.sh 替代内联实现）
> - `_workflow_core.sh` resume 逻辑迁移至 `resume.sh`
> - `SKILL.md` 变量引用矛盾修正
> - `discover.sh` help 补充 `--version`
> - `status.sh` `check_section_empty` 语义澄清
> - `tests/test_smoke.sh`：接收 run_qa.sh 冒烟场景，删除根目录 run_qa.sh
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 (\_common.sh) → Task 5-10 (各脚本引用) → Task 13 (run_qa 迁移)

---

## Context

### Original Request
对 sdd-riper 项目（Bash CLI + OpenCode Skill）进行详细 review，检查冗余设计和错误实现，并生成可执行的修复工作计划。

### Interview Summary
**Key Discussions**:
- **修复范围**：同步规范化——Bug 修复 + 文档/CLI help 措辞对齐
- **旧版兼容**：保留 + 警告，不做自动迁移
- **create-codemap 已有版本行为**：定向最新版本（UPDATE 模式）
- **_common.sh 范围**：纯工具函数，不放流程逻辑
- **run_qa.sh**：废弃，迁移到 tests/test_smoke.sh

### Metis Review
**Identified Gaps** (addressed):
- `create-codemap` UPDATE 模式检测路径需同步修复（不只是重命名）
- `archive.sh` status writeback 正则需精确（不 assert 注释文本）
- 需在 _common.sh 提取前先补 characterization tests 避免行为漂移
- SKILL.md 路径变量矛盾需同步修复
- `tests/` 中也可能有期望旧版无版本文件名的断言需修复

---

## Work Objectives

### Core Objective
修复所有已确认的 Bug 和代码重复，同步规范 CLI 文档，全程保持公共行为不变。

### Concrete Deliverables
- `bin/_common.sh` 新文件（纯工具函数）
- `bin/_workflow_core.sh` 精简（resume 逻辑迁出）
- `bin/resume.sh` 扩充（接收 resume 逻辑）
- `bin/create-codemap.sh` 路径与 UPDATE 模式修复
- `bin/archive.sh` status writeback 精简
- `bin/new-projectmap.sh` awk 逻辑明确化
- `bin/build-context-bundle.sh`, `bin/new-codemap.sh`, `bin/reopen.sh` 引用 _common.sh
- `bin/review-execute.sh`, `bin/debug.sh` 引用 _common.sh spec 选择逻辑
- `bin/discover.sh` help text 补 `--version`
- `bin/status.sh` check_section_empty 语义澄清
- `SKILL.md` Workflow Mode 变量引用修正
- `tests/test_smoke.sh` 新文件（接收 run_qa.sh 场景 + 修复 S10）
- `run_qa.sh` 删除

### Definition of Done
- [ ] `bash tests/run_all.sh` → exit 0，包含所有原有 + 新增测试
- [ ] `bash tests/test_smoke.sh` → 全 PASS，S10 测试 v1.0-my-feature.md 存在
- [ ] `bash sdd.sh discover --help` 输出包含 `--version`
- [ ] `create-codemap` 对已有版本模块输出 `## UPDATE CODEMAP PROMPT`
- [ ] `archive` 后 source spec `status: archived` 匹配正则 `^status: archived($|[[:space:]]+#)`
- [ ] 根目录不存在 `run_qa.sh`

### Must Have
- 所有现有 tests/ 测试继续通过
- `_common.sh` 提取不改变任何可观察的命令行输出
- Legacy unversioned 文件存在时输出 `[WARN]` 而非静默忽略

### Must NOT Have (Guardrails)
- 不修改任何公共命令名称或退出码
- 不引入新的 shell 特性（必须兼容 Git Bash / bash 4.x）
- `_common.sh` 不包含任何带输出副作用的流程函数（只放纯计算函数）
- 不自动迁移用户项目中的旧版无版本号文件
- 不修改 spec 模板格式或已有 spec 文件

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES（`tests/` 目录下 11 个测试套件 + `tests/run_all.sh`）
- **Automated tests**: Tests-after（先修复 Bug，同步更新/新增对应测试）
- **Framework**: bash 原生断言（exit code + grep）

### QA Policy
每个任务包含 agent-executed QA 场景，全部通过 Bash 工具执行（`mktemp` 临时目录，bash 命令断言）。

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (可立即并行):
├── Task 1: 创建 bin/_common.sh 共享工具库 [quick]
└── Task 2: 修复 run_qa.sh → tests/test_smoke.sh 迁移 + S10 Bug [quick]

Wave 2 (依赖 Task 1):
├── Task 3: 修复 new-projectmap.sh awk 逻辑 [quick]
├── Task 4: 修复 archive.sh status writeback [quick]
├── Task 5: 修复 create-codemap.sh 版本路径 + UPDATE 模式 [unspecified-high]
├── Task 6: 重构 build-context-bundle.sh + new-codemap.sh → 引用 _common.sh [quick]
├── Task 7: 重构 reopen.sh → 引用 _common.sh [quick]
└── Task 8: 重构 review-execute.sh + debug.sh → 引用 _common.sh spec 选择 [unspecified-high]

Wave 3 (依赖 Wave 2):
├── Task 9:  重构 _workflow_core.sh → resume 逻辑迁出到 resume.sh [deep]
├── Task 10: 修复 SKILL.md Workflow Mode 变量引用 [quick]
├── Task 11: 修复 discover.sh help text 补 --version [quick]
└── Task 12: 澄清 status.sh check_section_empty 语义 [quick]

Wave FINAL (所有任务完成后并行):
├── Task F1: Plan 合规 + 代码质量审计 [oracle]
├── Task F2: 执行 bash tests/run_all.sh + bash tests/test_smoke.sh [unspecified-high]
└── Task F3: 范围忠实度检查 [deep]
→ 展示结果 → 等待用户明确 OK
```

### Dependency Matrix
- Task 1: 无前置 → 被 Task 6, 7, 8, 9 依赖
- Task 2: 无前置 → 独立
- Task 3-8: 依赖 Task 1 完成（需引用 _common.sh）
- Task 9: 依赖 Task 1, 7（resume 逻辑需共享函数已稳定）
- Task 10-12: 无代码依赖，可在 Wave 2 完成后立即开始
- F1-F3: 依赖所有 Task 完成

### Agent Dispatch Summary
- Wave 1: Task 1 → `quick`, Task 2 → `quick`
- Wave 2: Task 3-4, 6-7 → `quick`, Task 5, 8 → `unspecified-high`
- Wave 3: Task 9 → `deep`, Task 10-12 → `quick`
- Final: F1 → `oracle`, F2 → `unspecified-high`, F3 → `deep`

---

## TODOs

- [x] 1. 创建 `bin/_common.sh` 纯工具函数共享库

  **What to do**:
  - 新建 `bin/_common.sh`，顶部加 `#!/usr/bin/env bash` 和 `set -euo pipefail`
  - 提取并导出 3 个纯函数（无 echo 输出副作用，只计算并 `echo` 返回值）：
    1. `_sdd_next_version <dir> <logical_name>` — 扫描 `<dir>` 下 `v{N}.{M}-<logical_name>.md`，返回下一个版本（`v1.0` 如无）；不存在目录时也正常返回 `v1.0`
    2. `_sdd_find_latest_spec <docs_dir>` — 找"最近修改任务的最高版本 spec"，返回文件路径或空字符串；legacy 无版本文件存在时输出 `[WARN]` 到 stderr 但不报错（保留 + 警告策略）
    3. `_sdd_find_source_spec <dir> <slug> [archived_only=false]` — 在 `<dir>` 内找 `v{N}.{M}-<slug>.md` 的最高版本；archived_only=true 时只考虑 `status: archived` 的文件
  - 函数体逻辑以 `_workflow_core.sh:43-64`（next_version）和 `_workflow_core.sh:272-307`（latest spec）为权威参考，**不改变行为**
  - 每个函数加注释说明参数和返回值

  **Must NOT do**:
  - 不放任何会打印非返回值内容的函数（no `echo "[CREATE]"` / `echo "[WARN]"` 在函数体内，除 legacy 警告到 stderr）
  - 不放任何依赖全局变量的代码
  - 不用 `local` 声明冲突 bash 4.x 关键字

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 6, 7, 8, 9
  - **Blocked By**: None

  **References**:
  - `bin/_workflow_core.sh:43-64` — `_sdd_next_version` 权威实现（作为提取源）
  - `bin/_workflow_core.sh:272-307` — latest spec 选择逻辑权威实现
  - `bin/reopen.sh:83-134` — `find_source_spec` + `next_version` 实现（对照确认一致性）
  - `bin/new-codemap.sh:37-57` — 另一份 `_next_version` 实现

  **Acceptance Criteria**:
  - [ ] `bin/_common.sh` 文件存在，可被 `source` 引入不报错
  - [ ] 新建临时目录 `$T`，`source bin/_common.sh; _sdd_next_version "$T/specs" "login"` 输出 `v1.0`
  - [ ] 创建 `$T/specs/v1.0-login.md` 后，`_sdd_next_version` 输出 `v1.1`
  - [ ] `_sdd_find_latest_spec "$T/mydocs"` 在无 spec 时返回空字符串

  **QA Scenarios**:
  ```
  Scenario: next_version 首次调用返回 v1.0
    Tool: Bash
    Steps:
      1. T=$(mktemp -d); mkdir -p "$T/specs"
      2. source bin/_common.sh
      3. result=$(_sdd_next_version "$T/specs" "login-flow")
      4. [ "$result" = "v1.0" ] && echo PASS || echo FAIL
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-1-next-version-init.txt

  Scenario: next_version 递增已存在版本
    Tool: Bash
    Steps:
      1. T=$(mktemp -d); mkdir -p "$T/specs"
      2. touch "$T/specs/v1.0-login-flow.md"
      3. source bin/_common.sh
      4. result=$(_sdd_next_version "$T/specs" "login-flow")
      5. [ "$result" = "v1.1" ] && echo PASS || echo FAIL
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-1-next-version-increment.txt

  Scenario: legacy 无版本文件存在时 _sdd_find_latest_spec 输出 WARN
    Tool: Bash
    Steps:
      1. T=$(mktemp -d); mkdir -p "$T/mydocs/specs"
      2. touch "$T/mydocs/specs/legacy-task.md"
      3. source bin/_common.sh
      4. result=$(_sdd_find_latest_spec "$T/mydocs" 2>/tmp/warn_out.txt)
      5. grep -q "WARN" /tmp/warn_out.txt && echo WARN_PRESENT || echo WARN_MISSING
    Expected Result: WARN_PRESENT
    Evidence: .sisyphus/evidence/task-1-legacy-warn.txt
  ```

  **Commit**: YES
  - Message: `fix(common): extract shared helpers to bin/_common.sh`
  - Files: `bin/_common.sh`

- [x] 2. 迁移 `run_qa.sh` → `tests/test_smoke.sh`，修复 S10 断言

  **What to do**:
  - 新建 `tests/test_smoke.sh`，将 `run_qa.sh` 的 S1–S10 全部场景迁入
  - 修复 S10（行 50-52）：将文件存在性断言从 `my-feature.md` 改为 `v1.0-my-feature.md`
  - 在 `tests/run_all.sh` 末尾添加：`run_suite "smoke tests" "$SCRIPT_DIR/test_smoke.sh"`
  - 删除根目录 `run_qa.sh`
  - `test_smoke.sh` 每个场景使用独立 `mktemp -d` 临时目录，`trap 'rm -rf "$T"' EXIT`

  **Must NOT do**:
  - 不修改 S1–S9 的测试逻辑（只修 S10）
  - 不改变 `tests/run_all.sh` 中其他套件的顺序

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: None（独立任务）
  - **Blocked By**: None

  **References**:
  - `run_qa.sh:1-52` — 全部源场景，直接迁入
  - `tests/run_all.sh:10-42` — `run_suite` 函数模式，在末尾追加同格式调用
  - `bin/_workflow_core.sh:125-137` — discover 创建的实际文件名格式（`v1.0-task-name.md`）

  **Acceptance Criteria**:
  - [ ] `ls run_qa.sh 2>&1` → "No such file"
  - [ ] `ls tests/test_smoke.sh` → 文件存在
  - [ ] `bash tests/test_smoke.sh` 全部输出 `S1: PASS` ... `S10: PASS`
  - [ ] `bash tests/run_all.sh` 包含 smoke suite 并通过

  **QA Scenarios**:
  ```
  Scenario: S10 断言正确的版本化文件名
    Tool: Bash
    Steps:
      1. T=$(mktemp -d)
      2. bash sdd.sh init "$T" --mode standard
      3. bash sdd.sh discover "$T" --task-name "my-feature" --requirement "test"
      4. ls "$T/mydocs/specs/v1.0-my-feature.md" && echo PASS || echo FAIL
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-2-s10-pass.txt

  Scenario: run_qa.sh 已删除
    Tool: Bash
    Steps:
      1. ls run_qa.sh 2>&1
    Expected Result: 输出包含 "No such file" 或 "not found"
    Evidence: .sisyphus/evidence/task-2-runqa-deleted.txt
  ```

  **Commit**: YES（与 Task 1 分开提交）
  - Message: `fix(tests): migrate run_qa.sh to tests/test_smoke.sh, fix S10 path assertion`
  - Files: `tests/test_smoke.sh` (new), `tests/run_all.sh` (+1 line), `run_qa.sh` (deleted)

- [x] 3. 修复 `new-projectmap.sh` awk 逻辑明确化

  **What to do**:
  - 将 `new-projectmap.sh` 行 61-66 的 awk 脚本修改，使"结束 repos 块"分支明确打印该行：
    ```awk
    found && !/^  - / { found=0; print; next }
    ```
    即：遇到非 `  - ` 开头的行，重置 found=0，**显式打印**，并 next 跳过通用 `{print}`
  - 同步在 `tests/test_new.sh` 或 `tests/test_create_projectmap.sh` 中增加断言：repos 替换后 `updated-at:` 字段仍然存在于输出文件

  **Must NOT do**:
  - 不改变功能行为（repos 块替换结果应和修复前完全一致）
  - 不修改 projectmap 模板

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6, 7, 8)
  - **Blocks**: None
  - **Blocked By**: None（Task 3 无需 _common.sh）

  **References**:
  - `bin/new-projectmap.sh:45-67` — 待修复的 awk 逻辑
  - `templates/projectmap.md` — 模板结构（确认 repos 块后有哪些字段）

  **Acceptance Criteria**:
  - [ ] `bash sdd.sh new-projectmap "$T" --repos "frontend,backend"` 成功
  - [ ] 生成文件中同时包含 `frontend` 和 `updated-at`（关键字段未丢失）

  **QA Scenarios**:
  ```
  Scenario: repos 替换后 updated-at 字段保留
    Tool: Bash
    Steps:
      1. T=$(mktemp -d); bash sdd.sh init "$T" --mode standard
      2. bash sdd.sh new-projectmap "$T" --repos "frontend,backend"
      3. grep -q "frontend" "$T/mydocs/projectmap.md" && echo frontend_ok || echo frontend_missing
      4. grep -q "updated-at" "$T/mydocs/projectmap.md" && echo updated_ok || echo updated_missing
    Expected Result: frontend_ok 且 updated_ok
    Evidence: .sisyphus/evidence/task-3-projectmap-fields.txt
  ```

  **Commit**: NO（与 Task 4 合并提交）

- [x] 4. 修复 `archive.sh` status writeback 正则，去除 hard-coded 注释

  **What to do**:
  - 修改 `archive.sh` 行 119 的 sed 命令，仅替换 status 值，不注入 hard-coded 注释：
    ```bash
    # 修复前
    sed -i.bak 's/^status: .*/status: archived   # draft | approved | done | archived/' "$SOURCE_SPEC"
    # 修复后
    sed -i.bak 's/^status:[[:space:]]*[^[:space:]#]*/status: archived/' "$SOURCE_SPEC"
    ```
    此正则匹配 `status:` 后的值部分（跳过空格直到 `#` 或行尾），仅替换值，保留行内注释（如果有）

  **Must NOT do**:
  - 不删除 `status` 行已有的行内注释（若原行是 `status: draft   # draft | approved | done | archived`，修复后应为 `status: archived   # draft | approved | done | archived`）
  - 不修改模板文件

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `bin/archive.sh:119` — 待修复的 sed 命令
  - `templates/spec.md:5` — status 字段格式：`status: draft   # draft | approved | done | archived`
  - `bin/_workflow_core.sh:316` — status 读取：`sed 's/status: *//; s/#.*$//'`（解析时去掉注释，说明保留注释是合理的）

  **Acceptance Criteria**:
  - [ ] archive 后 source spec status 行匹配 `^status: archived`
  - [ ] 若原 status 行有注释，注释被保留（`grep -E '^status: archived[[:space:]]+#' spec`）
  - [ ] `bash tests/test_archive.sh` 通过

  **QA Scenarios**:
  ```
  Scenario: archive 后 status 正确写回且注释保留
    Tool: Bash
    Steps:
      1. T=$(mktemp -d); bash sdd.sh init "$T" --mode standard
      2. bash sdd.sh discover "$T" --task-name "archive-test" --requirement "r" --goal "g"
      3. bash sdd.sh archive "$T" "archive-test"
      4. SPEC="$T/mydocs/specs/v1.0-archive-test.md"
      5. grep -E '^status: archived' "$SPEC" && echo STATUS_OK || echo STATUS_FAIL
      6. grep -E '#' "$SPEC" | grep status && echo COMMENT_KEPT || echo COMMENT_LOST
    Expected Result: STATUS_OK; COMMENT_KEPT
    Evidence: .sisyphus/evidence/task-4-archive-status.txt
  ```

  **Commit**: YES（合并 Task 3+4）
  - Message: `fix(bin): fix new-projectmap awk logic and archive status writeback regex`
  - Files: `bin/new-projectmap.sh`, `bin/archive.sh`

- [x] 5. 修复 `create-codemap.sh`：版本化路径 + UPDATE 模式定向最新版本

  **What to do**:
  - 修改 `OUTPUT_PATH` 计算逻辑（行 65-66）：
    1. 先扫描 `$TARGET_DIR/mydocs/codemap/` 目录，找到与 `$MODULE_SLUG` 匹配的最高版本文件 `v{N}.{M}-<module>.md`（调用 `_sdd_find_versioned_codemap`，可内联实现或加入 `_common.sh` 作为第 4 个工具函数）
    2. 若找到：设 `OUTPUT_PATH` 为该文件，进入 UPDATE 模式
    3. 若未找到：调用 `_sdd_next_version` 计算版本号，设 `OUTPUT_PATH` 为 `v1.0-<module>.md`，进入 CREATE 模式
    4. Legacy 无版本文件（如 `auth.md`）存在时：输出 `[WARN] Legacy unversioned codemap found: $f (ignored for UPDATE mode)` 到 stderr，按无版本处理（即走 CREATE 新版本流程）
  - 需要 `source "$SCRIPT_DIR/_common.sh"` 引入工具函数
  - 修复后 UPDATE 模式的 `OUTPUT_PATH` 指向已有版本文件，CREATE 模式指向 `vN.M-module.md`

  **Must NOT do**:
  - 不修改 UPDATE/CREATE prompt 文本本身
  - 不创建实际文件（`create-codemap` 只生成 prompt，不写文件）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: Task 1（需 _common.sh 中的 `_sdd_next_version`）

  **References**:
  - `bin/create-codemap.sh:44-119` — 完整文件，重点是行 64-73 的路径和模式检测
  - `bin/_common.sh` (Task 1 产出) — `_sdd_next_version` 函数
  - `bin/new-codemap.sh:59-79` — 版本化命名的权威参考
  - `tests/test_create_codemap.sh` — 需同步更新测试断言（改为期望版本化路径）

  **Acceptance Criteria**:
  - [ ] `init → new-codemap "$T" "auth" → create-codemap "$T" --module "auth"` 输出 `## UPDATE CODEMAP PROMPT`
  - [ ] UPDATE 模式输出的路径包含 `v1.0-auth.md`（或已有的最高版本）
  - [ ] 无已有 codemap 时输出 `## CREATE CODEMAP PROMPT` 且路径为 `v1.0-<module>.md`
  - [ ] `bash tests/test_create_codemap.sh` 通过

  **QA Scenarios**:
  ```
  Scenario: 已有 codemap 时触发 UPDATE 模式
    Tool: Bash
    Steps:
      1. T=$(mktemp -d); bash sdd.sh init "$T" --mode standard
      2. bash sdd.sh new-codemap "$T" "auth"
      3. bash sdd.sh create-codemap "$T" --module "auth" > /tmp/out.txt
      4. grep -q "UPDATE CODEMAP PROMPT" /tmp/out.txt && echo UPDATE_OK || echo UPDATE_FAIL
      5. grep -q "v1.0-auth" /tmp/out.txt && echo PATH_OK || echo PATH_FAIL
    Expected Result: UPDATE_OK 且 PATH_OK
    Evidence: .sisyphus/evidence/task-5-create-codemap-update.txt

  Scenario: 无 codemap 时触发 CREATE 模式，路径版本化
    Tool: Bash
    Steps:
      1. T=$(mktemp -d); bash sdd.sh init "$T" --mode standard
      2. bash sdd.sh create-codemap "$T" --module "payment" > /tmp/out2.txt
      3. grep -q "CREATE CODEMAP PROMPT" /tmp/out2.txt && echo CREATE_OK || echo CREATE_FAIL
      4. grep -q "v1.0-payment" /tmp/out2.txt && echo PATH_OK || echo PATH_FAIL
    Expected Result: CREATE_OK 且 PATH_OK
    Evidence: .sisyphus/evidence/task-5-create-codemap-create.txt
  ```

  **Commit**: YES
  - Message: `fix(create-codemap): versioned output path and UPDATE mode routing`
  - Files: `bin/create-codemap.sh`, `tests/test_create_codemap.sh`

- [x] 6. 重构 `build-context-bundle.sh` + `new-codemap.sh` → 引用 `_common.sh`

  **What to do**:
  - `build-context-bundle.sh`：删除内联 `_next_version_bundle` 函数（行 53-73），在文件顶部（SCRIPT_DIR 之后）加 `source "$SCRIPT_DIR/_common.sh"`，将调用替换为 `_sdd_next_version "$CONTEXT_DIR" "$BUNDLE_NAME"`
  - `new-codemap.sh`：删除内联 `_next_version` 函数（行 37-57），加 `source "$SCRIPT_DIR/_common.sh"`，将调用替换为 `_sdd_next_version "$CODEMAP_DIR" "$MODULE_NAME"`
  - 两个文件的可观察输出（stdout/stderr/exit code）必须与修改前完全一致

  **Must NOT do**:
  - 不修改这两个脚本的任何其他逻辑
  - 不改变输出格式

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: Task 1

  **References**:
  - `bin/build-context-bundle.sh:53-73` — 待删除的内联函数
  - `bin/new-codemap.sh:37-57` — 待删除的内联函数
  - `bin/_common.sh` (Task 1 产出) — `_sdd_next_version` 签名

  **Acceptance Criteria**:
  - [ ] `bash tests/test_build_context_bundle.sh` 通过
  - [ ] `bash tests/test_new.sh` 通过（包含 new-codemap 相关测试）
  - [ ] 两个文件中不再包含内联 next_version 实现（`grep "_next_version" bin/build-context-bundle.sh` 返回非零）

  **QA Scenarios**:
  ```
  Scenario: build-context-bundle 版本化正确
    Tool: Bash
    Steps:
      1. T=$(mktemp -d); bash sdd.sh init "$T" --mode standard
      2. bash sdd.sh build-context-bundle "$T" > /tmp/bcb.txt
      3. grep -q "SDD_OUTPUT_PATH" /tmp/bcb.txt && echo PASS || echo FAIL
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-6-build-context-bundle.txt
  ```

  **Commit**: NO（与 Task 7 合并）

- [x] 7. 重构 `reopen.sh` → 引用 `_common.sh`

  **What to do**:
  - `reopen.sh`：删除内联 `find_source_spec` 函数（行 83-108）和 `next_version` 函数（行 110-134）
  - 在文件顶部加 `source "$SCRIPT_DIR/_common.sh"`
  - 将所有调用替换为：
    - `find_source_spec "$SPECS_DIR" "$SPEC_SLUG"` → `_sdd_find_source_spec "$SPECS_DIR" "$SPEC_SLUG"`
    - `find_source_spec "$SPECS_DIR" "$SPEC_SLUG" "true"` → `_sdd_find_source_spec "$SPECS_DIR" "$SPEC_SLUG" true`
    - `next_version "$SPECS_DIR" "$task_slug"` → `_sdd_next_version "$SPECS_DIR" "$task_slug"`

  **Must NOT do**:
  - 不改变 reopen 命令的任何其他逻辑
  - `_common.sh` 的 `_sdd_find_source_spec` 必须支持 `archived_only` 参数（Task 1 中已确认）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 9（resume 重构前需 reopen 已稳定）
  - **Blocked By**: Task 1

  **References**:
  - `bin/reopen.sh:83-134` — 两个待删除内联函数
  - `bin/_common.sh` (Task 1 产出) — 函数签名

  **Acceptance Criteria**:
  - [ ] `bash tests/test_reopen.sh` 通过
  - [ ] `reopen.sh` 不再包含内联 `find_source_spec` 或 `next_version` 函数定义

  **QA Scenarios**:
  ```
  Scenario: reopen 归档任务创建 patch spec
    Tool: Bash
    Steps:
      1. T=$(mktemp -d); bash sdd.sh init "$T"
      2. bash sdd.sh discover "$T" --task-name "myfix" --requirement "r"
      3. bash sdd.sh archive "$T" "myfix"
      4. bash sdd.sh reopen "$T" "myfix" --defect "regression found"
      5. ls "$T/mydocs/specs/v1.1-myfix.md" && echo PASS || echo FAIL
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-7-reopen.txt
  ```

  **Commit**: YES（合并 Task 6+7）
  - Message: `refactor(bin): deduplicate via _common.sh in build-context-bundle, new-codemap, reopen`
  - Files: `bin/build-context-bundle.sh`, `bin/new-codemap.sh`, `bin/reopen.sh`

- [x] 8. 重构 `review-execute.sh` + `debug.sh` → 引用 `_common.sh` 的 latest spec 选择逻辑

  **What to do**:
  - `review-execute.sh`：删除行 55-93 的内联"最新 spec 选择"逻辑（`_TASK_MTIME` 关联数组 + 版本比较），加 `source "$SCRIPT_DIR/_common.sh"`，替换为 `SPEC_PATH="$(_sdd_find_latest_spec "$TARGET_DIR/mydocs")"`
  - `debug.sh`：删除行 57 的简化版 mtime 选择，替换为同样的 `_sdd_find_latest_spec` 调用；使 debug 的 spec 选择行为与 resume/review-execute **一致**
  - 两者均需处理 `_sdd_find_latest_spec` 返回空字符串的情况（`LATEST_SPEC` 为空时跳过相关段落）
  - 同步检查 `tests/test_review_execute.sh` 和 `tests/test_debug.sh` 是否有依赖旧逻辑的断言

  **Must NOT do**:
  - 不改变 review-execute 和 debug 的 stdout prompt 格式
  - 不修改 `_sdd_find_latest_spec` 已有的 legacy 警告输出

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: Task 1

  **References**:
  - `bin/review-execute.sh:54-93` — 待删除内联逻辑
  - `bin/debug.sh:57-58` — 待替换简化版
  - `bin/_workflow_core.sh:272-307` — 权威实现（已提取进 _common.sh）
  - `bin/_common.sh` (Task 1 产出) — `_sdd_find_latest_spec`

  **Acceptance Criteria**:
  - [ ] `bash tests/test_review_execute.sh` 通过
  - [ ] `bash tests/test_debug.sh` 通过
  - [ ] `review-execute.sh` 不再包含 `_TASK_MTIME` 关联数组（`grep "_TASK_MTIME" bin/review-execute.sh` 返回非零）

  **QA Scenarios**:
  ```
  Scenario: review-execute 选到正确的最新 spec
    Tool: Bash
    Steps:
      1. T=$(mktemp -d); bash sdd.sh init "$T"
      2. bash sdd.sh discover "$T" --task-name "rev-test" --requirement "r"
      3. bash sdd.sh review-execute "$T" > /tmp/rev.txt
      4. grep -q "REVIEW EXECUTE PROMPT" /tmp/rev.txt && echo PASS || echo FAIL
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-8-review-execute.txt
  ```

  **Commit**: YES
  - Message: `refactor(bin): deduplicate latest-spec selection via _common.sh in review-execute, debug`
  - Files: `bin/review-execute.sh`, `bin/debug.sh`

- [x] 9. 重构 `_workflow_core.sh`：resume 逻辑迁移至 `resume.sh`，`_workflow_core.sh` 精简为 discover-only

  **What to do**:
  - 将 `_workflow_core.sh` 行 247-376（resume 分支，从 `TARGET_DIR="${1:-}"` 到 `exit 0`）整体迁移至 `resume.sh`（替换当前的 3 行 exec wrapper）
  - `resume.sh` 变为独立的完整脚本，`source "$SCRIPT_DIR/_common.sh"`，将内部的 spec 选择逻辑替换为 `_sdd_find_latest_spec` 调用
  - `_workflow_core.sh` 保留 `--create-spec` 模式代码（行 73-245），删除 resume 分支代码（行 247-376），并删除顶部针对无 `--create-spec` 情况的 TARGET_DIR 解析（行 247-257）
  - `discover.sh` 保持不变（仍 exec 到 `_workflow_core.sh --create-spec`）
  - `_workflow_core.sh` 也需 `source "$SCRIPT_DIR/_common.sh"`，将内联 `_sdd_next_version` + `_codemap_hint_if_needed` 替换为共享版本（hint 函数可内联保留，但 next_version 必须替换）
  - 确保迁移后 resume 的 stdout 输出格式（`LATEST_SPEC:`, `PHASE_HINT:` 等字段）完全不变

  **Must NOT do**:
  - 不改变 `discover.sh` 的 `exec` 调用方式
  - 不修改任何 resume/discover 命令的对外接口（参数、退出码、输出字段）
  - 不将 `_codemap_hint_if_needed` 放进 `_common.sh`（含输出副作用，属流程函数）

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None（Wave 3 中最复杂，优先开始）
  - **Blocked By**: Tasks 1, 7（_common.sh 稳定后再迁移）

  **References**:
  - `bin/_workflow_core.sh:1-376` — 完整文件（discover 部分: 73-245; resume 部分: 247-376）
  - `bin/resume.sh:1-31` — 当前薄 wrapper，将被替换为完整实现
  - `bin/_common.sh` (Task 1 产出) — `_sdd_next_version`, `_sdd_find_latest_spec`
  - `tests/test_discover_resume.sh` — 需验证迁移后行为不变

  **Acceptance Criteria**:
  - [ ] `bash tests/test_discover_resume.sh` 通过
  - [ ] `bash sdd.sh resume "$T"` 输出与迁移前完全相同（含 `PHASE_HINT:`, `HAS_CODEMAP:` 等字段）
  - [ ] `_workflow_core.sh` 中不再包含 `PHASE_HINT=` 赋值（已迁出）
  - [ ] `resume.sh` 中包含 `PHASE_HINT=` 赋值

  **QA Scenarios**:
  ```
  Scenario: resume 迁移后输出格式不变
    Tool: Bash
    Steps:
      1. T=$(mktemp -d); bash sdd.sh init "$T"
      2. bash sdd.sh discover "$T" --task-name "resume-test" --requirement "r"
      3. bash sdd.sh resume "$T" > /tmp/resume.txt
      4. grep -q "PHASE_HINT" /tmp/resume.txt && echo HINT_OK || echo HINT_FAIL
      5. grep -q "LATEST_SPEC" /tmp/resume.txt && echo SPEC_OK || echo SPEC_FAIL
    Expected Result: HINT_OK 且 SPEC_OK
    Evidence: .sisyphus/evidence/task-9-resume.txt
  ```

  **Commit**: YES
  - Message: `refactor(workflow): split resume logic out of _workflow_core.sh into resume.sh`
  - Files: `bin/_workflow_core.sh`, `bin/resume.sh`

- [x] 10. 修复 `SKILL.md` Workflow Mode 中的变量引用

  **What to do**:
  - 定位 `SKILL.md` 行 114：`bash "$SDD_ROOT/sdd.sh" resume "$_PROJECT_ROOT"`
  - 修改为：描述 AI 应使用字面量路径，加注释/斜体提示：
    ```
    Run: `bash "<SDD_ROOT>/sdd.sh" resume "<PROJECT_ROOT>"`
    > ⚠️ 使用 preamble 输出的实际路径替换 `<SDD_ROOT>` 和 `<PROJECT_ROOT>`。
    ```
  - 同时检查 Workflow Mode 中其他 `$_PROJECT_ROOT` 引用（如 BUGFIX 循环的 debug 命令行），统一加同类提示

  **Must NOT do**:
  - 不修改 SKILL.md 的其他内容（Workflow 流程逻辑、门禁规则等）
  - 不修改 Setup Mode（仅修 Workflow Mode 中的变量引用）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `SKILL.md:33-42` — PATH SUBSTITUTION RULE（准则，需与 Workflow Mode 一致）
  - `SKILL.md:113-115` — Workflow Mode Step 1（待修复）
  - `SKILL.md:244-247` — BUGFIX loop debug 命令（检查是否有同类问题）

  **Acceptance Criteria**:
  - [ ] `grep -n '\$_PROJECT_ROOT' SKILL.md` 返回 0 结果（所有实例均已改为字面量占位符写法）
  - [ ] `grep -n '\$SDD_ROOT' SKILL.md` 在非 preamble 区域返回 0 结果

  **QA Scenarios**:
  ```
  Scenario: SKILL.md 中无裸变量引用
    Tool: Bash
    Steps:
      1. grep -n '\$_PROJECT_ROOT' SKILL.md | grep -v "preamble\|Preamble\|PATH SUBSTITUTION"
    Expected Result: 无输出（0 匹配）
    Evidence: .sisyphus/evidence/task-10-skill-vars.txt
  ```

  **Commit**: NO（与 Task 11、12 合并）

- [x] 11. `discover.sh` help text 补充 `--version` 参数说明

  **What to do**:
  - 修改 `discover.sh` 行 13-22 的 `print_usage` heredoc，在 Options 中添加：
    ```
    --version v{N}.{M}    Override auto-incremented version (e.g. v2.0)
    ```
  - 放在 `--context` 之后

  **Must NOT do**:
  - 不修改 discover.sh 的任何其他内容

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `bin/discover.sh:7-22` — 待修改的 help text
  - `bin/_workflow_core.sh:102` — `--version` 参数实现位置（确认参数名）

  **Acceptance Criteria**:
  - [ ] `bash sdd.sh discover --help` 输出包含 `--version`

  **QA Scenarios**:
  ```
  Scenario: discover --help 包含 --version
    Tool: Bash
    Steps:
      1. bash sdd.sh discover --help > /tmp/help.txt
      2. grep -q "\-\-version" /tmp/help.txt && echo PASS || echo FAIL
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-11-discover-help.txt
  ```

  **Commit**: NO（与 Task 10、12 合并）

- [x] 12. 澄清 `status.sh` `check_section_empty` 函数语义，添加注释

  **What to do**:
  - 在 `status.sh` 行 98 的 `check_section_empty` 函数定义前添加注释：
    ```bash
    # check_section_empty <file> <section-pattern>
    # Returns 0 (true) if the named section exists but contains no non-comment content.
    # Returns 1 (false) if the section has content or does not exist.
    # Usage: if check_section_empty "$spec" "Research Findings"; then WARN+=...
    ```
  - 将函数重命名为 `_section_is_empty`（内部函数命名约定，`_` 前缀），所有调用处同步更新
  - 或者（更激进但更清晰）：改为正向语义函数 `_section_has_content`，返回 0 表示有内容，调用处改为 `if ! _section_has_content ...`；选择哪种方案取决于执行 agent 的判断，但必须保持行为不变

  **Must NOT do**:
  - 不改变 `status.sh` 的任何检查逻辑或输出格式

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `bin/status.sh:98-116` — 函数定义
  - `bin/status.sh:134-188` — 所有调用位置

  **Acceptance Criteria**:
  - [ ] `bash tests/test_status.sh` 通过
  - [ ] 函数有明确注释说明退出码语义

  **QA Scenarios**:
  ```
  Scenario: status 检查空 section 正确报 WARN
    Tool: Bash
    Steps:
      1. T=$(mktemp -d); bash sdd.sh init "$T"
      2. bash sdd.sh discover "$T" --task-name "status-test" --requirement "r"
      3. bash sdd.sh status "$T" > /tmp/st.txt
      4. grep -q "Research" /tmp/st.txt && echo PASS || echo FAIL
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-12-status.txt
  ```

  **Commit**: YES（合并 Task 10+11+12）
  - Message: `docs: normalize SKILL.md path vars, discover --help, status.sh function semantics`
  - Files: `SKILL.md`, `bin/discover.sh`, `bin/status.sh`

---

## Final Verification Wave

> 3 个 review agent 并行运行，全部 APPROVE 后展示结果，等待用户明确 OK。

- [x] F1. **Plan Compliance Audit** — `oracle`
  读取计划全文，逐项检查 Must Have；搜索代码库确认 Must NOT Have 无违反（公共命令名/退出码不变、_common.sh 无副作用函数、无自动文件迁移）。
  Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Real QA Execution** — `unspecified-high`
  运行 `bash tests/run_all.sh`（含新增 test_smoke.sh），记录每个 suite 的输出。重点验证：S10 断言版本化路径、create-codemap UPDATE 模式、archive status writeback 正则。
  Output: `Suites [N/N pass] | VERDICT`

- [x] F3. **Scope Fidelity Check** — `deep`
  对比每个 Task 的"What to do"与实际 git diff——验证 1:1 覆盖，无超出范围的变更（不改命令名/退出码/模板格式），无跨任务污染。
  Output: `Tasks [N/N compliant] | VERDICT`

---

## Commit Strategy
- Wave 1: `fix(common): extract shared helpers to bin/_common.sh`
- Wave 2: `fix(bugs): fix run_qa S10, new-projectmap awk, create-codemap versioning, archive status`
- Wave 2 refactor: `refactor(bin): deduplicate via _common.sh in 5 scripts`
- Wave 3: `refactor(workflow): split resume logic out of _workflow_core.sh`
- Wave 3 docs: `docs: normalize CLI help, SKILL.md path var, status.sh semantics`

---

## Success Criteria

```bash
bash tests/run_all.sh        # Expected: exit 0, all suites PASS
bash tests/test_smoke.sh     # Expected: S1 PASS ... S10 PASS (全部)
bash sdd.sh discover --help  # Expected: output contains "--version"
bash sdd.sh create-codemap "$TMP" --module "auth"   # (after new-codemap) Expected: UPDATE CODEMAP PROMPT
ls run_qa.sh 2>&1            # Expected: No such file
```

### Final Checklist
- [ ] All Must Have present
- [ ] All Must NOT Have absent
- [ ] All tests pass
- [ ] run_qa.sh 不再存在于根目录
