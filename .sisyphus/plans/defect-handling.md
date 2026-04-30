# Defect Handling — SDD-RIPER 全生命周期缺陷闭环

## TL;DR

> **Quick Summary**: 在 SDD-RIPER 协议中引入统一的"缺陷"概念，覆盖 Execute 阶段内部自治修复、Review FAIL_CODE 有据重入、Archive 后人工触发 reopen 三条路径，同时对齐 spec status 状态机。
>
> **Deliverables**:
> - SKILL.md：Execute/Review/Archive/Workflow/AI驱动命令 五处协议更新
> - templates/spec.md：status 字段补全 `archived`
> - bin/reopen.sh：新增 CLI 子命令
> - sdd.sh：注册 reopen 子命令

> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 → Task 5 → Task 7 → F1-F4

---

## Context

### Original Request
归档后人工测试发现任务缺陷，如何在流程内闭环？

### Interview Summary
- 三个独立缺口：Execute阶段无 BUGFIX 概念、Review FAIL_CODE 盲重试、Archive后无回溯路径
- `debug` 命令存在但未织入任何阶段指令
- `spec status: archived` 在 resume.sh 中被检查但模板未定义
- **责任边界**：Execute/Review 阶段 BUGFIX 为 AI 自治行为；只有 BUGFIX_ESCALATED、DEVIATED_MAJOR、FAIL_CODE_ESCALATED、reopen 才是人工介入点
- **BUGFIX 自治上限**：3次，与 Review FAIL_CODE 重试机制对称
- **FAIL_CODE 自治上限**：Review → debug → Execute 最多 3 个闭环；超限 → `FAIL_CODE_ESCALATED`
- **状态持久化**：BUGFIX/BUGFIX_ESCALATED 不写入 frontmatter，仅追加到 execute.log（`[BUGFIX]`/`[BUGFIX_ESCALATED]` 标签）
- **reopen 冲突策略**：patch spec 已存在则拒绝，exit 1，提示 `sdd resume`
- **debug 调用时机**：每次 BUGFIX retry 前都重新运行
- **BUGFIX 边界判定**：仅允许修改当前 Plan Step 显式声明的文件/目录范围；任何超出该范围的修复都升级为 `DEVIATED_MAJOR`
- **reopen 上下文降级**：优先注入 archive `_llm.md`；若缺失则回退到 `_human.md`；若两者都缺失则失败退出

### Metis Review（已处理）
- 补充了缺陷 vs 计划偏差 vs 新需求的分类规则
- 补充了 `reopen` 拒绝条件和边界约束
- 补充了 `debug` 失败时的降级路径

---

## Work Objectives

### Core Objective
将"缺陷"作为一等公民引入 SDD-RIPER，让三类缺陷发现场景都有显式、可审计的处理路径，同时保持人工介入最小化。

### Concrete Deliverables
- SKILL.md 中的 Execute Phase Instructions 含完整 BUGFIX 子流程
- SKILL.md 中的 Review Phase Instructions FAIL_CODE 路径强制先 debug
- SKILL.md 中的 Archive Phase Instructions 末尾写入 `status: archived`
- SKILL.md 中的 Workflow Mode 含 reopen 分支指引
- SKILL.md 中的 AI 驱动命令章节含 reopen 命令说明，debug 说明更新
- `templates/spec.md` status 注释含 `archived`
- `bin/reopen.sh` 可执行，逻辑完整
- `sdd.sh` dispatch 注册 reopen

### Must Have
- 缺陷分类规则（defect / deviation / enhancement）在 SKILL.md 中明确定义
- BUGFIX 路径：debug 每次 retry 前强制执行
- BUGFIX 路径：仅限当前 Step 显式声明的文件/目录范围；跨范围影响 → DEVIATED_MAJOR
- BUGFIX 路径：3次上限；超限 → BUGFIX_ESCALATED → 人工介入
- FAIL_CODE 路径：Review → debug → Execute 最多 3 次；超限 → FAIL_CODE_ESCALATED → 人工介入
- reopen：patch spec 已存在则拒绝，exit 1
- reopen：非 archived spec 拒绝，exit 1
- reopen：自动注入 archive `_llm.md` 为 context
- reopen：若 `_llm.md` 缺失则降级注入 `_human.md`；若两者都缺失则失败退出
- reopen：patch spec 写入 `reopened-from: vN.M` 元数据

### Must NOT Have（Guardrails）
- BUGFIX 不能成为跨 Step 重构的借口
- reopen 不能修改已归档文件
- reopen 不能被用于新功能（仅限 intent-preserving 的缺陷修复）
- 不引入 issue tracking 系统或严重程度分级
- 不新增 RIPER 阶段（BUGFIX 是 Execute 内部子流程）

### State Transition Rules
- **Defect**：实现结果与预期行为不符，但原始任务意图与当前 Plan Step 仍成立。Defect 进入 BUGFIX 或 FAIL_CODE 路径。
- **Deviation**：实现要继续推进就必须偏离已批准 Plan，或修复所需改动超出当前 Step 显式文件/目录范围。Deviation 一律升级为 `DEVIATED_MAJOR`。
- **Enhancement / New Requirement**：请求改变原始任务意图、扩大归档任务范围、或增加新验收项。不得通过 BUGFIX / reopen 混入，必须走新任务或重新 Plan。
- **BUGFIX 入口**：Execute 阶段当前 Step 的命令、测试、断言、运行结果暴露 defect，且当前 Step 目标仍有效。
- **BUGFIX Step Scope Rule**：Plan Step 必须显式声明文件路径、目录边界或模块边界；BUGFIX 仅可修改该边界内内容。若当前 Step 未声明边界，则 Plan 本身不合格，需先回 Plan 补齐。
- **FAIL_CODE 入口**：Review Verdict 为 `FAIL_CODE`。
- **FAIL_CODE 上限**：同一 defect finding 最多允许 3 次 Review → debug → Execute 闭环；第 4 次仍未通过时输出 `FAIL_CODE_ESCALATED`，停止等待人工决策。
- **reopen 入口**：仅允许人工对 `status: archived` 的任务触发；reopen 创建新的 patch spec，不得原地修改 archived spec 或 archive 产物。

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: NO（shell 脚本项目，无单测框架）
- **Automated tests**: None（通过 bash 命令验证 CLI 行为）
- **Agent-Executed QA**: Bash (exit code + stdout/stderr assertions)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1（可立即并行开始，互不依赖）:
├── Task 1: templates/spec.md — 补全 status: archived [quick]
├── Task 2: SKILL.md Execute Phase — 新增 BUGFIX 子流程 [unspecified-high]
├── Task 3: SKILL.md Review Phase — FAIL_CODE 强制 debug [quick]
├── Task 4: SKILL.md Archive Phase — 写入 status: archived [quick]
└── Task 5: bin/reopen.sh — 新增脚本 [unspecified-high]

Wave 2（Wave 1 完成后）:
├── Task 6: SKILL.md Workflow Mode + AI驱动命令 — reopen 分支 [unspecified-high]
└── Task 7: sdd.sh — 注册 reopen 子命令 [quick]

Wave FINAL（所有任务完成后并行审查）:
├── F1: 协议一致性审查 (oracle)
├── F2: CLI 功能验证 (unspecified-high)
├── F3: SKILL.md 全文通读 QA (unspecified-high)
└── F4: Scope 合规检查 (deep)
```

### Agent Dispatch Summary
- **Wave 1**: T1 → `quick`, T2 → `unspecified-high`, T3 → `quick`, T4 → `quick`, T5 → `unspecified-high`
- **Wave 2**: T6 → `unspecified-high`, T7 → `quick`
- **FINAL**: F1 → `oracle`, F2-F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] **Task 1 — 更新 spec 模板状态枚举**
  - 文件：`templates/spec.md`
  - 修改：将 status 注释从 `draft | approved | done` 扩为 `draft | approved | done | archived`
  - 验收：模板可直接表达 archived；与 `resume.sh` 状态机一致

- [ ] **Task 2 — 在 SKILL.md 的 Execute Phase 定义 BUGFIX 子流程**
  - 修改点：Execute Phase Instructions
  - 必须包含：
    - defect / deviation / enhancement 三分类
    - BUGFIX 入口条件
    - 每次 retry 前必须运行 `debug`
    - BUGFIX Step Scope Rule（仅允许当前 Step 显式文件/目录范围）
    - BUGFIX 3 次上限与 `BUGFIX_ESCALATED`
    - `debug` inconclusive / 失败时的升级规则
  - 验收：Execute 阶段无需人工即可闭环普通 defect，但不会跨 Step 漂移

- [ ] **Task 3 — 在 SKILL.md 的 Review Phase 修正 FAIL_CODE 路由**
  - 修改点：Review Phase Instructions + FAIL_CODE Auto-Remediation Loop
  - 必须包含：
    - `FAIL_CODE` 后先 `debug` 再重入 Execute
    - 每次重试都重新运行 `debug`
    - 3 次上限后输出 `FAIL_CODE_ESCALATED`
  - 验收：Review 不再存在盲重试路径

- [ ] **Task 4 — 在 Archive Phase 明确写入 archived 状态**
  - 修改点：Archive Phase Instructions
  - 必须包含：
    - 归档完成后将 source spec 写为 `status: archived`
    - 该状态写入发生在 archive skeleton 生成并核对完成之后
  - 验收：`resume.sh` 可稳定读到 `PHASE_HINT=new_task`

- [ ] **Task 5 — 新增 `bin/reopen.sh`**
  - 参考：`bin/archive.sh` 的参数解析与版本选择模式
  - 必须包含：
    - 用法：`reopen.sh <project-dir> <spec-name> [--defect "..."]`
    - 仅接受 archived spec
    - 自动生成 `vN.M+1-<task>.md` patch spec
    - 写入 `reopened-from: vN.M`
    - 优先注入 archive `_llm.md`；缺失则回退 `_human.md`；两者都缺失则 exit 1
    - 已存在进行中的 patch spec 时拒绝创建，提示用户 `resume`
  - 验收：happy path / conflict / missing context / non-archived 均有确定行为

- [ ] **Task 6 — 在 SKILL.md 的 Workflow Mode 与 AI 驱动命令中织入 reopen**
  - 修改点：Workflow Mode、AI 驱动命令章节
  - 必须包含：
    - 归档后人工发现 defect 的唯一入口是 `reopen`
    - reopen 创建的是 patch spec，不是新功能入口
    - `debug` 语义更新为 BUGFIX / FAIL_CODE 的前置诊断步骤
  - 验收：协议层不再把 post-archive defect 当作普通 new_task 模糊处理

- [ ] **Task 7 — 在 `sdd.sh` 注册 reopen 子命令**
  - 修改：help 文本 + dispatch case
  - 验收：`./sdd.sh reopen --help` 可用，help 中有 reopen 描述

---

## Final Verification Wave

- [ ] F1. **协议一致性审查** — `oracle`
  读取 SKILL.md 全文，验证：BUGFIX / DEVIATED / FAIL_CODE / reopen 四条路径无交叉矛盾；状态转换完整；人工介入点恰好为四个（BUGFIX_ESCALATED / DEVIATED_MAJOR / FAIL_CODE_ESCALATED / reopen）。
  Output: `路径覆盖 [N/N] | 矛盾 [0] | VERDICT: APPROVE/REJECT`

- [ ] F2. **CLI 功能验证** — `unspecified-high`
  运行以下命令并断言结果：
  - `bash bin/reopen.sh --help` → exit 0, 含 Usage 说明
  - `bash bin/reopen.sh /tmp/no-such-dir spec-name` → exit 1
  - 创建 fixture 已归档 spec → `bash bin/reopen.sh <fixture> <spec>` → exit 0, patch spec 创建，含 reopened-from
  - 重复执行上行 → exit 1, 含"already exists"
  - 非 archived spec → exit 1, 含"must be archived"
  - 缺失 `_llm.md` 但有 `_human.md` → exit 0, 明确提示 fallback 到 `_human.md`
  - `_llm.md` 与 `_human.md` 都缺失 → exit 1, 含 clear error
  Output: `Scenarios [N/N pass] | VERDICT`

- [ ] F3. **SKILL.md 全文通读 QA** — `unspecified-high`
  通读 SKILL.md，验证：无孤立的 `debug` 引用（每处 debug 调用都有明确触发条件）；无遗留的旧 FAIL_CODE 描述（未加 debug 前置）；reopen 分支在 Workflow Mode 可达；Archive Phase 末尾有 status: archived 写入指令。
  Output: `检查项 [N/N] | VERDICT`

- [ ] F4. **Scope 合规检查** — `deep`
  对比 Must Have / Must NOT Have 列表，逐项检查 SKILL.md 和 reopen.sh 是否合规。确认未引入 issue tracking、新 RIPER 阶段、或允许跨 Step 修改的描述。
  Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT`

---

## Commit Strategy

- Wave 1: `feat(protocol): add BUGFIX sub-flow to Execute phase + spec status archived`
- Wave 2: `feat(cli): add reopen subcommand + wire into SKILL.md Workflow Mode`
- Final: `chore: post-review cleanup if needed`

---

## Success Criteria

```bash
# reopen 帮助可用
bash bin/reopen.sh --help  # exit 0

# Execute Phase 含 BUGFIX 子流程与上限
grep -n "BUGFIX_ESCALATED" SKILL.md

# Review Phase 含 FAIL_CODE_ESCALATED
grep -n "FAIL_CODE_ESCALATED" SKILL.md

# spec.md 含 archived
grep "archived" templates/spec.md  # 输出含 archived 的行

# sdd.sh 注册了 reopen
grep "reopen" sdd.sh  # 输出含 reopen 的行

# reopen fallback 规则被写入计划 / 协议
grep -n "_human.md" .sisyphus/plans/defect-handling.md
```
