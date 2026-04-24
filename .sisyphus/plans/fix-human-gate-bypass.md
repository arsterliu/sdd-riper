# Fix: Human Gate Bypass in Setup Mode

## TL;DR

> **Quick Summary**: 修复 SKILL.md Setup Mode 中两个 bug：(1) TODO_CONTINUATION 绕过 AskUserQuestion 门禁导致 AI 自动执行 discover；(2) 后续命令错误使用 `$_PROJECT_ROOT` 而非用户选择的目标目录。
>
> **Deliverables**:
> - `SKILL.md`（repo）：Setup Mode 增加 anti-TodoWrite 指令、HUMAN GATE 标记、目录变量统一
> - `C:\Users\liuyl\.config\opencode\skills\sdd-riper\SKILL.md`（安装副本）：与 repo 保持一致
>
> **Estimated Effort**: Quick
> **Parallel Execution**: NO - sequential (one task only)
> **Critical Path**: Edit SKILL.md → Sync install copy → QA

---

## Context

### Original Request
截图显示：init 完成后 AI 询问了 4 项 Spec 元数据（task name / requirement / goal / constraints），但用户还未输入，`TODO_CONTINUATION` 系统指令就触发了，强制"Proceed without asking for permission"，AI 直接往下执行 discover。同样，Context Bundle 构建也没有等用户选择 A/B。

### Interview Summary
- **根因**：执行 AI 使用了 TodoWrite 注册流程步骤，导致 TODO_CONTINUATION 绕过 AskUserQuestion 门禁
- **Bug 1**：auto-advance，Setup Mode 每个 AskUserQuestion 后未强制 STOP
- **Bug 2**：wrong-directory，Post-init 操作使用 `$_PROJECT_ROOT` 而非用户在 Step 1 选择的 `<dir>`
- **覆盖范围**：需要覆盖 Mode Selection + Step 1 + Step 4 + Step 5 + Step 5a + Step 5b，不只是 5a/5b

### Metis Review
- **Gap 1**：原计划只覆盖 steps 4/5/5a/5b，漏掉了 Mode Selection 和 Step 1 门禁
- **Gap 2**：Setup Mode 中 `$_PROJECT_ROOT` 与用户选择的 `<dir>` 混用是独立的第二个 bug
- **Gap 3**：需要 transcript-based QA，不能用"看起来会等"这类模糊验证
- **Guardrail**：如果 doc-level 修复仍被系统指令绕过，需要将其提升为更强的 SYSTEM-LEVEL 指令语气

---

## Work Objectives

### Core Objective
修复 SKILL.md Setup Mode 中所有 AskUserQuestion 门禁被绕过的问题，以及目录变量使用不一致的问题。

### Concrete Deliverables
- `D:\workspace\canway\other\sdd-riper\SKILL.md` — Setup Mode 修改
- `C:\Users\liuyl\.config\opencode\skills\sdd-riper\SKILL.md` — 安装副本同步

### Definition of Done
- [ ] SKILL.md Setup Mode 开头有明确的 `NEVER use TodoWrite` 系统级指令
- [ ] Setup Mode 每个 AskUserQuestion 后有 `HUMAN GATE: STOP` 标记
- [ ] Setup Mode 所有后续操作使用 `TARGET_DIR`（用户在 Step 1 选择的目录），而非 `$_PROJECT_ROOT`
- [ ] 两份 SKILL.md 内容完全一致（diff 为空）

### Must Have
- Setup Mode 开头：`**⚠️ SYSTEM: Do NOT use TodoWrite anywhere in Setup Mode or Workflow Mode. Register NO todos. Every step requires human input — stop after each AskUserQuestion and wait for the user to respond before proceeding.**`
- 每个 AskUserQuestion 后：`**← HUMAN GATE: STOP. Make no further tool calls. Wait for user response before proceeding.**`
- 将 `$_PROJECT_ROOT` 的 post-step-1 用法替换为 `$TARGET_DIR`，并在 Step 1 明确说明 "store the user-selected dir as TARGET_DIR"

### Must NOT Have
- 不改动 Workflow Mode（B 路径）的逻辑
- 不改动任何 shell 脚本
- 不新增 CLI 命令
- 不改 Spec 模板

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (SKILL.md 是纯文档，无自动化测试框架)
- **Automated tests**: None
- **QA 方式**: 人工/Agent 读取 SKILL.md 内容验证关键字存在；diff 对比两份副本

### QA Policy
每个任务包含 Agent-Executable QA Scenarios。证据保存至 `.sisyphus/evidence/`。

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (仅一个任务):
└── Task 1: 修改 SKILL.md + 同步安装副本 [quick]

Wave FINAL:
└── F1: 验证修改正确性 + diff 对比两份副本 [quick]
```

### Agent Dispatch Summary
- **Wave 1**: 1 task → `quick`
- **FINAL**: 1 task → `quick`

---

## TODOs

- [x] 1. 修改 SKILL.md Setup Mode + 同步安装副本

  **What to do**:

  **1.1 Setup Mode 开头（`## Setup Mode (if A selected)` 正下方）插入系统级指令**：
  ```
  > ⚠️ **SYSTEM DIRECTIVE — NO AUTO-ADVANCE**
  > Do **NOT** use `TodoWrite` anywhere in this flow. Register **zero** todos.
  > Every step in Setup Mode is a human gate. After **each** `AskUserQuestion`, you MUST:
  > - Make **no further tool calls**
  > - Execute **no commands**
  > - Produce **no reasoning toward the next step**
  > - **STOP and wait** for the user to respond in a new turn.
  > Violating this rule causes all subsequent human gates to be bypassed by `TODO_CONTINUATION`.
  ```

  **1.2 Step 1 末尾（ask for target directory）加 HUMAN GATE 标记**：
  ```
  > **← HUMAN GATE**: STOP. Make no further tool calls. Wait for user to provide target directory and mode before continuing. Store the user-selected directory as `TARGET_DIR`.
  ```

  **1.3 将 Step 1 说明改为**：存储用户选择的目录为 `TARGET_DIR`（而非依赖 `$_PROJECT_ROOT`）
  - Step 2: `bash "$SDD_ROOT/sdd.sh" init "$TARGET_DIR" --mode <mode>`
  - Step 4: 检查 `$TARGET_DIR/mydocs/codemap/` （而非 `$_PROJECT_ROOT/mydocs/codemap/`）
  - Step 4-If A: `create-codemap "$TARGET_DIR"` （而非 `"$_PROJECT_ROOT"`）
  - Step 5b-check: `$TARGET_DIR/mydocs/context/` （而非 `$_PROJECT_ROOT/mydocs/context/`）
  - Step 5b-If A: `build-context-bundle "$TARGET_DIR"` （而非 `"$_PROJECT_ROOT"`）
  - Step 5c: `discover "$TARGET_DIR" ...` （已正确使用 `<dir>`，确认一致）

  **1.4 Mode Selection（`## Mode Selection`）正下方插入**：
  ```
  > ⚠️ **HUMAN GATE**: After presenting this question, make **no further tool calls**. STOP and wait for user's A/B response.
  ```

  **1.5 Step 4 的 CodeMap AskUserQuestion 后插入**：
  ```
  **← HUMAN GATE**: STOP. Make no further tool calls. Wait for user's A/B response.
  ```

  **1.6 Step 5（"Create your first Spec now?"）后插入**：
  ```
  **← HUMAN GATE**: STOP. Make no further tool calls. Wait for user's yes/no response.
  ```

  **1.7 Step 5a（ask for 4 items）后插入**：
  ```
  **← HUMAN GATE**: STOP. Make no further tool calls. Wait for user to provide all 4 items (task name, requirement, goal, constraints) before proceeding. If the user provides fewer than 4 items, re-ask for the missing ones — do NOT infer or skip.
  ```

  **1.8 Step 5b Context Bundle AskUserQuestion 后插入**：
  ```
  **← HUMAN GATE**: STOP. Make no further tool calls. Wait for user's A/B response before running any command.
  ```

  **1.9 同步安装副本**：
  ```bash
  cp "D:\workspace\canway\other\sdd-riper\SKILL.md" "C:\Users\liuyl\.config\opencode\skills\sdd-riper\SKILL.md"
  ```
  或 Windows 等效方式。

  **Must NOT do**:
  - 不改动 `## Workflow Mode (if B selected)` 及之后的内容
  - 不改动任何 shell 脚本
  - 不重新排版 SKILL.md 的其他部分

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 纯文档编辑，无代码逻辑，单文件 + 同步副本
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1（唯一任务）
  - **Blocks**: Final verification
  - **Blocked By**: None

  **References**:
  - `D:\workspace\canway\other\sdd-riper\SKILL.md:33-72` — Setup Mode 全文，修改目标范围
  - `D:\workspace\canway\other\sdd-riper\SKILL.md:43` — `## Setup Mode (if A selected)` 插入点
  - `D:\workspace\canway\other\sdd-riper\SKILL.md:33` — `## Mode Selection` 插入点
  - `C:\Users\liuyl\.config\opencode\skills\sdd-riper\SKILL.md` — 安装副本同步目标

  **Acceptance Criteria**:

  - [ ] `grep -c "SYSTEM DIRECTIVE" SKILL.md` → `1`（Setup Mode 开头存在系统指令）
  - [ ] `grep -c "HUMAN GATE" SKILL.md` → `≥ 6`（Mode Selection, Step1, Step4, Step5, Step5a, Step5b 各一处）
  - [ ] `grep -c "TARGET_DIR" SKILL.md` → `≥ 5`（Step1说明, Step2, Step4 check, Step4-IfA, Step5b-check, Step5b-IfA）
  - [ ] `grep -c "_PROJECT_ROOT" SKILL.md`（Setup Mode 内的 `$_PROJECT_ROOT` 用于 post-step-1 操作的数量）→ `0`
  - [ ] diff 两份 SKILL.md → 无差异

  **QA Scenarios**:

  ```
  Scenario: HUMAN GATE 标记存在性验证
    Tool: Bash (grep)
    Steps:
      1. grep -n "HUMAN GATE" "D:\workspace\canway\other\sdd-riper\SKILL.md"
      2. 断言输出行数 ≥ 6
      3. 确认每处都位于 AskUserQuestion 的下方
    Expected Result: 至少 6 行包含 "HUMAN GATE"
    Evidence: .sisyphus/evidence/task-1-human-gate-markers.txt

  Scenario: anti-TodoWrite 指令存在性验证
    Tool: Bash (grep)
    Steps:
      1. grep -n "SYSTEM DIRECTIVE" "D:\workspace\canway\other\sdd-riper\SKILL.md"
      2. 断言输出包含 "NO AUTO-ADVANCE" 或 "Do NOT use TodoWrite"
    Expected Result: 1 处命中，位于 Setup Mode 开头
    Evidence: .sisyphus/evidence/task-1-anti-todo-directive.txt

  Scenario: TARGET_DIR 替换验证
    Tool: Bash (grep)
    Steps:
      1. grep -n "TARGET_DIR" "D:\workspace\canway\other\sdd-riper\SKILL.md"
      2. 断言输出 ≥ 5 行
      3. grep -n "_PROJECT_ROOT" "D:\workspace\canway\other\sdd-riper\SKILL.md" | grep -v "^#" （注释除外）
      4. 断言 Setup Mode 范围（行 43-72）内无 "$_PROJECT_ROOT" 用于 post-step-1 命令
    Expected Result: TARGET_DIR 出现 ≥ 5 次；Setup Mode 内 post-step-1 命令无 $\_PROJECT_ROOT
    Evidence: .sisyphus/evidence/task-1-target-dir-check.txt

  Scenario: 两份 SKILL.md 一致性验证
    Tool: Bash (diff / fc)
    Steps:
      1. fc "D:\workspace\canway\other\sdd-riper\SKILL.md" "C:\Users\liuyl\.config\opencode\skills\sdd-riper\SKILL.md"
    Expected Result: "FC: no differences encountered" 或 diff 输出为空
    Evidence: .sisyphus/evidence/task-1-diff-check.txt
  ```

  **Commit**: YES
  - Message: `fix(skill): add human gate markers and fix TARGET_DIR in Setup Mode`
  - Files: `SKILL.md`
  - Pre-commit: N/A (no test framework)

---

## Final Verification Wave

- [x] F1. **内容 + 一致性审计** — `quick`
  读取 repo SKILL.md 和安装副本，对比 diff。验证所有 HUMAN GATE 标记和 SYSTEM DIRECTIVE 存在。检查 Setup Mode 内无 `$_PROJECT_ROOT` post-step-1 残留。
  Output: `HUMAN GATE [N/6+] | SYSTEM DIRECTIVE [1] | TARGET_DIR [N/5+] | DIFF [CLEAN] | VERDICT: APPROVE/REJECT`

---

## Commit Strategy

- **Task 1**: `fix(skill): add human gate markers and fix TARGET_DIR in Setup Mode` — `SKILL.md`

---

## Success Criteria

### Verification Commands
```bash
grep -c "HUMAN GATE" SKILL.md   # Expected: ≥ 6
grep -c "SYSTEM DIRECTIVE" SKILL.md  # Expected: 1
grep -c "TARGET_DIR" SKILL.md   # Expected: ≥ 5
fc SKILL.md "C:\Users\liuyl\.config\opencode\skills\sdd-riper\SKILL.md"  # Expected: no diff
```

### Final Checklist
- [ ] All HUMAN GATE markers present at correct positions
- [ ] Anti-TodoWrite SYSTEM DIRECTIVE present at Setup Mode header
- [ ] `$_PROJECT_ROOT` replaced with `TARGET_DIR` for all post-step-1 Setup Mode commands
- [ ] Install copy synced and matches repo copy
