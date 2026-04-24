# SKILL.md Setup Mode: CodeMap 引导步骤

## TL;DR

> **Quick Summary**: 在 `SKILL.md` 的 Setup Mode 第 3 步和第 4 步之间插入一个可选交互步骤：当 `init` 输出含 `[SDD-RIPER]` hint 时，AI 主动询问用户是否建立 CodeMap，确认后执行 `create-codemap`，拒绝则跳过。
>
> **Deliverables**:
> - `SKILL.md` — Setup Mode 步骤扩展（插入约 10 行指令）
> - `C:\Users\liuyl\.config\opencode\skills\sdd-riper\SKILL.md` — 安装副本同步
>
> **Estimated Effort**: Quick  
> **Parallel Execution**: NO — 顺序执行  
> **Critical Path**: 修改 SKILL.md → 同步安装副本 → 验证

---

## Context

### Original Request
用户希望 `/sdd-riper` Skill 模式下，`init` 后若检测到大型既有项目，AI 能主动询问用户是否建立 CodeMap，确认后直接执行，而不是只打印文字提示。

### Confirmed Decisions
- **触发信号**：`init` 输出中含 `[SDD-RIPER]`（即 init.sh 复杂度 hint 被打印）
- **已有 CodeMap 跳过**：若 `mydocs/codemap/` 下已有 `.md`（非 `.gitkeep`），不弹出提示
- **交互方式**：`AskUserQuestion`，可选，用户可拒绝
- **用户同意**：AI 可询问模块名（留空则不传 `--module`），然后执行 `bash "$SDD_ROOT/sdd.sh" create-codemap "$_PROJECT_ROOT" [--module <name>]`
- **用户拒绝**：跳过，继续原有「创建首个 Spec？」步骤
- **create-codemap 失败**：显示错误，继续到「创建首个 Spec？」步骤（不中断流程）

### Metis Review
**Identified Gaps** (addressed):
- 阈值未定义 → 以 `[SDD-RIPER]` 出现为信号（已内置阈值）
- 已有 CodeMap 重复提示 → 加检查：`mydocs/codemap/` 无 `.md` 才提示
- 失败处理未定义 → 显示错误后继续
- `--module` 使用规则 → 在同一 AskUserQuestion 中让用户填写（可留空）

---

## Work Objectives

### Core Objective
在 SKILL.md Setup Mode 的 init 完成后，为大型既有项目添加一个 AI 主动引导建立 CodeMap 的可选交互步骤，使 `/sdd-riper` 能够真正全程引导用户 onboarding。

### Concrete Deliverables
- `SKILL.md` Setup Mode：在第 3 步（"显示创建的文件"）后，第 4 步（`AskUserQuestion: 创建首个 Spec？`）前，插入新的可选步骤 3.5

### Definition of Done
- [ ] `SKILL.md` 在 Setup Mode step 3 和 step 4 之间有新步骤
- [ ] 新步骤明确说明触发条件（`[SDD-RIPER]` 在输出中 AND codemap 目录无 .md）
- [ ] 新步骤包含 `AskUserQuestion` 指令
- [ ] 同意路径明确说明运行 `create-codemap` 命令
- [ ] 拒绝路径明确说明跳过并继续原有步骤
- [ ] 失败处理明确说明
- [ ] 安装副本与 repo 内容一致

### Must Have
- 触发条件：`init` 输出含 `[SDD-RIPER]` **且** `mydocs/codemap/` 下无 `.md`（非 `.gitkeep`）
- `AskUserQuestion` 中说明用户可填写模块名（留空则不带 `--module`）
- 与现有 SKILL.md 文风一致（简洁的编号列表格式）

### Must NOT Have (Guardrails)
- 不修改 shell 脚本（`.sh` 文件）
- 不修改 Workflow Mode 或任何 Phase 指令
- 不自动运行 `create-codemap`（必须等待用户确认）
- 不改变 `create-codemap` 命令的语义
- 不在 SKILL.md 其他位置新增内容

---

## Verification Strategy

### Test Decision
- **Automated tests**: NO — SKILL.md 是 AI 指令文档，无运行时测试
- **Verification方式**: `grep` 验证关键词存在于 SKILL.md 的正确位置

---

## Execution Strategy

```
Wave 1 (顺序执行):
├── Task 1: 修改 SKILL.md — 插入 Setup Mode 3.5 步骤
└── Task 2: 同步到安装副本

Wave FINAL:
└── Task F1: grep 验证关键内容存在
```

---

## TODOs

- [x] 1. 修改 `SKILL.md` — 插入 Setup Mode 步骤 3.5

  **What to do**:

  在 `SKILL.md` 第 46 行（`3. Show created files.`）和第 47 行（`4. Use 'AskUserQuestion': "Create your first Spec now?"`）之间，插入以下内容：

  ```
  3.5. **CodeMap 引导（仅当满足条件时）**: 检查上一步 `init` 命令输出是否包含 `[SDD-RIPER]` 字样，并检查 `$_PROJECT_ROOT/mydocs/codemap/` 目录下是否已有 `.md` 文件（排除 `.gitkeep`）。
     - 若 init 输出**不含** `[SDD-RIPER]`，或 codemap 目录下**已有** `.md`：跳过本步骤，直接执行步骤 4。
     - 若 init 输出**含** `[SDD-RIPER]` 且 codemap 目录**无** `.md`：使用 `AskUserQuestion` 询问：
       > 检测到目标项目已有较多源码文件，尚未建立 CodeMap。
       > 是否现在建立 CodeMap 以帮助 AI 快速理解模块结构？
       > （可选）模块名称（留空则扫描整个项目）: ___
       > A) 是，立即建立
       > B) 否，跳过
     - 用户选 A：运行 `bash "$SDD_ROOT/sdd.sh" create-codemap "$_PROJECT_ROOT" [--module <name>]`（若模块名非空则附加 `--module`）。读取并展示命令输出。若命令失败，说明错误原因并继续步骤 4。
     - 用户选 B：直接继续步骤 4。
  ```

  **插入方式**：使用 Edit 工具，oldString 为 `3. Show created files.\n4. Use`，newString 在两者之间插入上述内容。

  **Must NOT do**:
  - 不修改步骤 1、2、3、4、5 的任何现有文字
  - 不修改 Workflow Mode 及以下任何内容
  - 不改变文件编码或行尾风格

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:
  - `SKILL.md:43-51` — Setup Mode 完整定义，插入位置在 line 46-47 之间
  - `SKILL.md:175-179` — `create-codemap` 命令说明，保持一致
  - `SKILL.md:16` — `AskUserQuestion` 已在 allowed-tools 列表

  **Acceptance Criteria**:

  ```
  Scenario: 验证步骤 3.5 存在于正确位置
    Tool: Bash (grep)
    Steps:
      1. grep -n "SDD-RIPER" SKILL.md
         Expected: 有一行位于 "Show created files" 和 "Create your first Spec now" 之间的行号范围内
      2. grep -n "AskUserQuestion" SKILL.md | head -5
         Expected: 至少两处（一处原有的 step 4，一处新增的 step 3.5）
      3. grep -n "create-codemap" SKILL.md
         Expected: step 3.5 区域内有 create-codemap 调用说明
      4. grep -n "跳过本步骤" SKILL.md 或 grep -n "直接继续步骤 4" SKILL.md
         Expected: 找到拒绝路径说明
    Evidence: .sisyphus/evidence/task-1-skill-grep.txt

  Scenario: 验证 Workflow Mode 未被修改
    Tool: Bash (grep)
    Steps:
      1. grep -n "Workflow Mode" SKILL.md
         Expected: 仍在 line 53 附近，内容与原文一致
    Evidence: .sisyphus/evidence/task-1-workflow-intact.txt
  ```

  **Commit**: NO（与 Task 2 一起）

---

- [x] 2. 同步到安装副本

  **What to do**:
  ```powershell
  Copy-Item "D:\workspace\canway\other\sdd-riper\SKILL.md" "C:\Users\liuyl\.config\opencode\skills\sdd-riper\SKILL.md" -Force
  ```

  验证：
  ```powershell
  $r1 = Get-Content "D:\workspace\canway\other\sdd-riper\SKILL.md" -Raw
  $r2 = Get-Content "C:\Users\liuyl\.config\opencode\skills\sdd-riper\SKILL.md" -Raw
  if ($r1 -eq $r2) { "IDENTICAL" } else { "DIFFER" }
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: Task 1

  **Acceptance Criteria**:

  ```
  Scenario: 安装副本内容一致
    Tool: Bash/PowerShell
    Expected: IDENTICAL
    Evidence: .sisyphus/evidence/task-2-sync-verified.txt
  ```

  **Commit**: NO

---

## Final Verification Wave

- [x] F1. **内容核查** — `quick`

  ```bash
  # 在 SKILL.md 中验证关键内容
  grep -n "\[SDD-RIPER\]" SKILL.md          # 应出现在 Setup Mode 范围内
  grep -n "create-codemap" SKILL.md          # 至少 2 处（步骤 3.5 + 命令参考区）
  grep -n "AskUserQuestion" SKILL.md         # 至少 2 处
  grep -c "Workflow Mode" SKILL.md           # 应为 1（未新增）
  ```

  Output: 所有 grep 命中且行号符合预期  
  Evidence: `.sisyphus/evidence/final-qa-skill.txt`

---

## Commit Strategy

完成后可选 commit：
- Message: `feat(skill): guide codemap creation in setup mode for complex projects`
- Files: `SKILL.md`

---

## Success Criteria

### Final Checklist
- [ ] SKILL.md Setup Mode 有步骤 3.5
- [ ] 触发条件（`[SDD-RIPER]` + 无 codemap .md）明确
- [ ] 同意/拒绝/失败三条路径都有说明
- [ ] Workflow Mode 未受影响
- [ ] 安装副本与 repo 一致
