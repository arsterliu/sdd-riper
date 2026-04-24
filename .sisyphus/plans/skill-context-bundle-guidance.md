# SKILL.md Setup Mode step 5: Context Bundle 引导

## TL;DR

> **Quick Summary**: 修改 `SKILL.md` Setup Mode step 5 内部逻辑，在收集完 discover 参数之后、执行 `discover` 之前，检查 `mydocs/context/` 是否为空，若为空则询问用户是否先构建 Context Bundle，构建成功后将路径作为 `--context` 传入 `discover`。
>
> **Deliverables**:
> - `SKILL.md` — Setup Mode step 5 内部扩展（约 10 行）
> - `C:\Users\liuyl\.config\opencode\skills\sdd-riper\SKILL.md` — 安装副本同步
>
> **Estimated Effort**: Quick  
> **Parallel Execution**: NO  
> **Critical Path**: 修改 SKILL.md → 同步安装副本 → grep 验证

---

## Context

### Original Request
`build-context-bundle` 目前只在命令参考区出现，没有任何触发时机。用户希望在 discover 流程中，若 `context/` 为空，AI 能主动询问是否构建，并将结果注入 `--context`。

### Confirmed Decisions
- 触发条件：`mydocs/context/` 不存在 或 下面无 `.md` 文件（`.gitkeep` 不算）
- 交互方式：`AskUserQuestion`，可选
- 同意：执行 `build-context-bundle`；成功后将输出文件路径作为 `--context` 传入 `discover`；失败则继续 `discover` 不带 `--context`
- 拒绝：`discover` 不带 `--context`
- 当前 `discover` 调用本来就无 `--context`，bundle 是唯一注入途径，无手动 context 冲突

---

## Work Objectives

### Core Objective
让 `/sdd-riper` Setup Mode 能全程引导用户完成 context 沉淀，而不是让 `build-context-bundle` 成为死角命令。

### Concrete Deliverables
- `SKILL.md` Setup Mode step 5 扩展：
  - 收集参数后 → 检查 `context/` → AskUserQuestion → 可选 `build-context-bundle` → 执行 `discover`（含或不含 `--context`）

### Definition of Done
- [ ] step 5 内有 `mydocs/context/` 检查说明
- [ ] 明确 `.gitkeep` 不算有效文件
- [ ] 有 `AskUserQuestion` 引导
- [ ] 同意路径：执行 `build-context-bundle`，输出路径传入 `--context`
- [ ] 失败路径：继续 `discover` 不带 `--context`
- [ ] 拒绝路径：直接执行 `discover` 不带 `--context`
- [ ] 安装副本同步

### Must Have
- 决策树顺序：收集参数 → 检查 context/ → 可选 bundle → 执行 discover
- 失败分支明确

### Must NOT Have
- 不修改 shell 脚本
- 不修改 Workflow Mode
- 不修改 step 4（CodeMap 引导）
- 不强制构建 context bundle（必须是可选）

---

## Execution Strategy

```
Wave 1 (顺序执行):
├── Task 1: 修改 SKILL.md — step 5 内部扩展
└── Task 2: 同步安装副本

Wave FINAL:
└── F1: grep 验证关键内容
```

---

## TODOs

- [ ] 1. 修改 `SKILL.md` — Setup Mode step 5 内部扩展

  **What to do**:

  将当前 step 5（line 57-60）：
  ```
  5. Use `AskUserQuestion`: "Create your first Spec now?"
     - If yes: Use `AskUserQuestion` to ask for task name, requirement (what needs to be built), goal, and constraints (optional).
        Then run: `bash "$SDD_ROOT/sdd.sh" discover <dir> --task-name "<name>" --requirement "<req>" --goal "<goal>" --constraints "<constraints>"`
        Read the `## SPEC CREATION PROMPT` output and the created Spec file. Help the user fill in Research Findings and initial Open Questions.
  ```

  替换为：
  ```
  5. Use `AskUserQuestion`: "Create your first Spec now?"
     - If yes:
       a. Use `AskUserQuestion` to ask for task name, requirement (what needs to be built), goal, and constraints (optional).
       b. **Context Bundle 引导**: Check whether `$_PROJECT_ROOT/mydocs/context/` exists and contains any `.md` files (excluding `.gitkeep`).
          - If context dir is missing or has **no** `.md` files: use `AskUserQuestion`:
            > 当前 context/ 目录为空。
            > 如果你有历史 Spec、旧设计文档或 PRD 等背景材料，可以先构建 Context Bundle 提炼为结构化上下文，再注入本次任务。
            > 是否现在构建 Context Bundle？
            > A) 是，立即构建
            > B) 否，跳过
            - If user selects A: run `bash "$SDD_ROOT/sdd.sh" build-context-bundle "$_PROJECT_ROOT"`. Read the output to get the generated bundle file path (`mydocs/context/<name>.md`). If command succeeds, pass the path as `--context "<path>"` in the discover command below. If command fails, explain the error and proceed without `--context`.
            - If user selects B: proceed without `--context`.
          - If context dir **already has** `.md` files: skip this prompt and use the most recent `.md` file path as `--context` in the discover command.
       c. Run: `bash "$SDD_ROOT/sdd.sh" discover <dir> --task-name "<name>" --requirement "<req>" --goal "<goal>" --constraints "<constraints>" [--context "<context-path-or-text>"]`
          (omit `--context` if no bundle was built and user declined)
          Read the `## SPEC CREATION PROMPT` output and the created Spec file. Help the user fill in Research Findings and initial Open Questions.
  ```

  **Must NOT do**:
  - 不修改 step 6 及之后的任何内容
  - 不修改 step 4（CodeMap 引导）
  - 不修改 Workflow Mode

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: None
  - **Blocks**: Task 2

  **References**:
  - `SKILL.md:57-60` — 当前 step 5，插入/替换目标
  - `SKILL.md:191-194` — `build-context-bundle` 命令说明

  **Acceptance Criteria**:

  ```
  Scenario: step 5 中有 context 检查说明
    Tool: Grep
    Steps:
      1. grep -n "mydocs/context/" SKILL.md
         Expected: 命中行位于 step 5 区域（Setup Mode 内，Workflow Mode 之前）
      2. grep -n "\.gitkeep" SKILL.md
         Expected: 在 step 5 区域内有一行提到排除 .gitkeep
      3. grep -n "build-context-bundle" SKILL.md
         Expected: 至少 2 处（step 5 内新增 + 命令参考区原有）
      4. grep -n "\-\-context" SKILL.md
         Expected: 在 step 5 区域内有 --context 参数使用说明
      5. grep -n "AskUserQuestion" SKILL.md
         Expected: step 5 区域内有新的 AskUserQuestion 调用
    Evidence: .sisyphus/evidence/task-1-skill-context-grep.txt

  Scenario: 验证 Workflow Mode 未被修改
    Tool: Grep
    Steps:
      1. grep -n "Workflow Mode" SKILL.md
         Expected: 仍在 line 63 附近
    Evidence: .sisyphus/evidence/task-1-workflow-intact.txt
  ```

  **Commit**: NO

---

- [ ] 2. 同步到安装副本

  ```powershell
  Copy-Item "D:\workspace\canway\other\sdd-riper\SKILL.md" "C:\Users\liuyl\.config\opencode\skills\sdd-riper\SKILL.md" -Force
  $r1 = Get-Content "D:\workspace\canway\other\sdd-riper\SKILL.md" -Raw
  $r2 = Get-Content "C:\Users\liuyl\.config\opencode\skills\sdd-riper\SKILL.md" -Raw
  if ($r1 -eq $r2) { "IDENTICAL" } else { "DIFFER" }
  ```

  **Recommended Agent Profile**: `quick`

  **Parallelization**: NO / Blocked By: Task 1

  **Acceptance Criteria**:
  ```
  Expected: IDENTICAL
  Evidence: .sisyphus/evidence/task-2-context-sync.txt
  ```

  **Commit**: NO

---

## Final Verification Wave

- [ ] F1. **内容核查** — `quick`

  ```bash
  grep -n "mydocs/context/"   SKILL.md   # step 5 区域内
  grep -n "build-context-bundle" SKILL.md  # 至少 2 处
  grep -n "\-\-context"       SKILL.md   # step 5 内有使用说明
  grep -n "gitkeep"           SKILL.md   # step 5 内有排除说明
  grep -n "Workflow Mode"     SKILL.md   # 仍在 line 63 附近
  ```

---

## Success Criteria

- [ ] step 5 决策树完整（收集 → 检查 context/ → 可选 bundle → discover）
- [ ] 三条路径都有说明（context 已有 / 为空且同意 / 为空且拒绝）
- [ ] 失败分支明确（bundle 失败 → 继续 discover 不带 --context）
- [ ] Workflow Mode 未受影响
- [ ] 安装副本与 repo 一致
