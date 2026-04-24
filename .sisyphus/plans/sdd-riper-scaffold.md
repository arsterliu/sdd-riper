# SDD-RIPER 团队落地脚手架

## TL;DR

> **Quick Summary**: 构建一个开箱即用的 SDD-RIPER 脚手架仓库，包含多平台 AI 配置文件、Shell CLI 工具集和完整文档模板，让前后端分离的多项目团队在一周内跑通大模型编程工作流。
>
> **Deliverables**:
> - `sdd.sh` + `bin/` — Shell CLI 工具集（init / new-spec / new-codemap / new-projectmap / status / archive）
> - `protocols/` — SDD-RIPER 标准版 + 轻量版协议文件
> - `templates/` — Spec / CodeMap / ProjectMap / Context Bundle / Archive 全套模板
> - `mydocs/` — 初始目录结构骨架
> - 多平台 AI 配置（AGENTS.md / CLAUDE.md / .cursorrules / .github/copilot-instructions.md）
> - `examples/` — 前后端分离多项目示例（含 ProjectMap 联动）
> - `tests/` — 所有 CLI 命令的自动化验证脚本
> - `README.md` + `TEAM-GUIDE.md` — 团队快速上手 + 一周落地 SOP
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: T1(sdd.sh骨架) → T4(init) + T5(new-*) + T6(status) + T7(archive) → T9(README) + T10(demo) + T11(tests)

---

## Context

### Original Request
用户希望基于《SDD-RIPER 团队落地指南》文章内容，构建一套可供团队直接使用的脚手架，包含：完整项目模板 + Shell CLI 脚本 + 多平台 AI 配置，支持前后端分离多项目通过 ProjectMap 联动，双轨（标准版 + 轻量版）并行。

### Interview Summary
**Key Discussions**:
- 脚手架形式：完整项目模板（开箱即用）+ 探索 CLI 是否适合用 Skill 承载 → 决定用 Shell 脚本
- AI 工具：多平台兼容（OpenCode / Cursor / Claude / Copilot）
- 技术栈：语言无关，前后端分离，多项目 ProjectMap 联动
- SDD-RIPER 版本：双轨并行（标准版 + 轻量版）
- 仓库结构：多仓库，每个子仓库独立维护，通过 ProjectMap 联动
- CLI 形式：Shell 脚本（无依赖）

### Metis Review
**Identified Gaps** (addressed):
- 已有文件冲突策略 → 默认 skip+warn，`--force` 可覆盖
- Shell 兼容目标 → bash（macOS/Linux）+ Git Bash/WSL（Windows）
- ProjectMap 结构 → Markdown + 固定 frontmatter + 必选 section（机器可校验）
- CLI enforcement level → 仅生成 + lint 警告，不做硬性 gate
- 双轨共享同一目录结构和命令接口，只改模板深度
- AI 配置文件采用"单一规范源 → 多平台派生"策略
- 完整验收标准 → 每个命令 happy path + conflict path + rerun path

---

## Work Objectives

### Core Objective
构建一个语言无关的 SDD-RIPER 团队脚手架，让任何规模的前后端分离多项目团队能在 5 分钟内完成初始化，在一周内完整跑通大模型编程工作流，并且质量可控、效果可量化。

### Concrete Deliverables
- `sdd.sh` — CLI 入口，支持 6 个子命令
- `bin/init.sh` — 初始化仓库（目录结构 + AI 配置）
- `bin/new-spec.sh` / `bin/new-codemap.sh` / `bin/new-projectmap.sh` — 创建文档
- `bin/status.sh` — 校验结构，报告 RIPER 阶段，返回精确 exit code
- `bin/archive.sh` — 归档完成的 Spec，产出 _human.md + _llm.md
- `bin/_gen_ai_configs.sh` — AI 配置文件生成助手（被 init 调用）
- `protocols/sdd-riper-one.md` — 标准协议（精炼嵌入版）
- `protocols/sdd-riper-one-light.md` — 轻量协议（极简版）
- `templates/spec.md` / `codemap.md` / `projectmap.md` / `context-bundle.md` / `archive-human.md` / `archive-llm.md`
- `examples/frontend-app/` + `examples/backend-api/` + `examples/projectmap.md`
- `tests/test_init.sh` / `test_new.sh` / `test_status.sh` / `test_archive.sh` / `run_all.sh`
- `README.md` + `TEAM-GUIDE.md`

### Definition of Done
- [ ] `bash sdd.sh init ./tmp/demo --mode standard` 成功创建完整目录和 AI 配置文件
- [ ] `bash sdd.sh status ./tmp/demo` 返回 exit code 0，输出结构摘要
- [ ] `bash tests/run_all.sh` 全部通过（0 failures）
- [ ] `grep -q "No Spec, No Code" ./tmp/demo/AGENTS.md` 为真
- [ ] examples/ 包含可直接参考的前后端 ProjectMap 联动示例

### Must Have
- 6 个 CLI 子命令全部实现，含精确 exit code（0/1/2/3）
- 多平台 AI 配置：4 种平台文件，内容来自同一规范源
- 双轨模式：`--mode standard|lite`，共享目录结构，模板深度不同
- 完整文档模板：6 类模板
- 冲突策略：默认 skip+warn，`--force` 覆盖
- 幂等性：所有命令安全重复执行
- ProjectMap 结构化：frontmatter + 固定 section，`status` 可校验
- 自动化测试：happy path + conflict + rerun 三类场景
- README + TEAM-GUIDE（中文）

### Must NOT Have (Guardrails)
- 不得生成语言/框架相关业务代码（Java/JS/Python 骨架）
- 不得引入 CI/CD 配置、Git hooks、PR 模板
- 不得做 API 直连、模型调用、向量库
- 不得做 Web UI / Dashboard
- `sdd status` 不得依赖模糊启发式扫描，必须基于约定检查
- CLI 不得变成工作流引擎（审批流、自动推进 RIPER）
- 默认不覆盖已有文件（`--force` 才可以）
- 不允许 AI 配置文件四份手写后漂移，必须单一规范源派生

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — 所有验收由 Agent 执行 Shell 命令完成。

### Test Decision
- **Infrastructure exists**: NO（新建项目）
- **Automated tests**: YES（Tests after）— `tests/` 目录下的 bash 测试脚本
- **Framework**: bash + test 命令 + exit code 校验

### QA Policy
- **CLI/Shell**: Bash (interactive_bash) — 执行命令，校验 exit code + 文件存在性 + 文件内容
- Evidence 保存到 `.sisyphus/evidence/task-{N}-{scenario-slug}.txt`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation, 可并行):
├── Task 1: sdd.sh CLI 入口 + bin/ 骨架 + 项目结构         [quick]
├── Task 2: protocols/ 协议文件（标准版 + 轻量版）          [unspecified-high]
└── Task 3: templates/ 文档模板（6 类）                    [unspecified-high]

Wave 2 (After Wave 1 — core commands, 可并行):
├── Task 4: bin/init.sh + bin/_gen_ai_configs.sh           [unspecified-high]
├── Task 5: bin/new-spec.sh + new-codemap.sh + new-projectmap.sh [unspecified-high]
├── Task 6: bin/status.sh                                  [unspecified-high]
└── Task 7: bin/archive.sh                                 [unspecified-high]

Wave 3 (After Wave 2 — integration + docs, 可并行):
├── Task 8: README.md + TEAM-GUIDE.md                     [writing]
├── Task 9: examples/ 前后端多项目示例                      [unspecified-high]
└── Task 10: tests/ 自动化验证脚本                         [unspecified-high]

Wave FINAL (After ALL — 并行四路 review):
├── F1: Plan 合规审计 (oracle)
├── F2: 代码质量审查 (unspecified-high)
├── F3: 实际 QA 执行 (unspecified-high)
└── F4: 范围合规检查 (deep)
→ 汇总结果 → 等待用户确认
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| T1 | — | T4, T5, T6, T7 |
| T2 | — | T4 (AI config content) |
| T3 | — | T4, T5, T7 |
| T4 | T1, T2, T3 | T9 (demo uses init) |
| T5 | T1, T3 | T10 (tests cover new-*) |
| T6 | T1 | T10 |
| T7 | T1, T3 | T10 |
| T8 | T1-T7 | — |
| T9 | T3, T4 | T10 |
| T10 | T4-T7, T9 | F-wave |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1→`quick`, T2→`unspecified-high`, T3→`unspecified-high`
- **Wave 2**: 4 tasks — T4→`unspecified-high`, T5→`unspecified-high`, T6→`unspecified-high`, T7→`unspecified-high`
- **Wave 3**: 3 tasks — T8→`writing`, T9→`unspecified-high`, T10→`unspecified-high`
- **Final**: 4 tasks — F1→`oracle`, F2→`unspecified-high`, F3→`unspecified-high`, F4→`deep`

---

## TODOs

- [x] 1. CLI 入口 + 项目骨架

  **What to do**:
  - 创建顶层文件结构：`sdd.sh`（CLI 入口）、`bin/`（子命令目录）、`protocols/`、`templates/`、`mydocs/`（含 specs/ codemap/ context/ archive/ evidence/ 各含 .gitkeep）、`examples/`、`tests/`
  - `sdd.sh` 实现参数分发：读取第一个参数为子命令名，转发给 `bin/<subcmd>.sh`，并处理 `--help` / 无参数
  - 支持的子命令：`init` / `new-spec` / `new-codemap` / `new-projectmap` / `status` / `archive`
  - 全局 exit code 约定：0=成功，1=缺失必需资产，2=引用损坏，3=参数/环境错误
  - 根目录 `.gitignore`（忽略 tmp/、.sisyphus/evidence/ 等临时产物）
  - 根目录 `LICENSE`（MIT）

  **Must NOT do**:
  - 不要在 sdd.sh 里实现命令逻辑，只做分发
  - 不要引入任何外部依赖（curl、python、node 等）
  - 不要生成任何业务代码

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 单纯的文件结构 + 简单 shell 分发脚本，无复杂逻辑
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1（与 Task 2、Task 3 并行）
  - **Blocks**: Task 4, 5, 6, 7（所有 bin/ 命令依赖此骨架）
  - **Blocked By**: None（可立即开始）

  **References**:
  - 文章三铁律：No Spec, No Code / Spec is Truth / Reverse Sync（需体现在帮助文档中）
  - 文章 mydocs/ 产出目录结构：specs/ codemap/ context/ archive/ evidence/

  **Acceptance Criteria**:

  ```
  Scenario: sdd.sh 骨架存在且可执行
    Tool: Bash
    Steps:
      1. test -f ./sdd.sh && echo PASS
      2. bash ./sdd.sh --help
    Expected Result: exit 0，打印使用说明（含6个子命令名称）
    Evidence: .sisyphus/evidence/task-1-help.txt

  Scenario: 目录骨架完整
    Tool: Bash
    Steps:
      1. for d in bin protocols templates mydocs/specs mydocs/codemap mydocs/context mydocs/archive mydocs/evidence examples tests; do test -d $d || echo "MISSING: $d"; done
    Expected Result: 无 MISSING 输出
    Evidence: .sisyphus/evidence/task-1-dirs.txt

  Scenario: 未知子命令返回 exit 3
    Tool: Bash
    Steps:
      1. bash ./sdd.sh unknowncmd ./tmp
      2. echo "exit: $?"
    Expected Result: exit 3，打印"Unknown command"提示
    Evidence: .sisyphus/evidence/task-1-unknown-cmd.txt
  ```

  **Commit**: YES（Wave 1 完成后统一提交）

- [x] 2. protocols/ 协议文件（标准版 + 轻量版）

  **What to do**:
  - 创建 `protocols/sdd-riper-one.md`：标准版协议精炼版，包含
    - 三铁律（No Spec, No Code / Spec is Truth / Reverse Sync）
    - RIPER 五阶段定义（Research / Innovate / Plan / Execute / Review）
    - 每阶段：做什么、产出物、禁止事项、完成标准
    - Pre-Research 阶段：
      - 明确输入语义：requirement = 当前执行口径；context = 支撑 requirement 的材料包
      - 强调 bootstrap 用 requirement 锚定方向、用 context 补足理解
      - 禁止把 context 直接当作当前 requirement 的权威定义
    - Research 阶段固定输出格式：
      1. 我对需求的复述（Requirement Restatement）
      2. 我当前不确定的点（Open Questions）
      3. 我已确认的事实（Confirmed Facts）
      4. 我建议回写到 Spec 的内容（Spec Writeback）
    - Innovate 阶段：至少给 2 个方案（复杂任务建议 3 个），每个方案需含 Pros / Cons / 风险 / 推荐理由；简单任务允许 `Innovate: Skipped, Reason: ...`
    - Plan 阶段：要求原子级拆解（文件路径 / 函数或接口签名 / 执行顺序 / 验收条件），并明确 `Plan Approved` 是人工门禁，不可由工具替代
    - Execute 阶段：要求记录 Execute Log / Change Summary / Deviations from Plan；若执行中发现 Plan 不成立，应回退到 Plan，而不是偷偷改方案
    - Review 阶段：要求 Spec vs Code 对照、偏差记录、剩余风险、最终 Verdict，禁止仅输出泛泛的“看起来没问题”
    - Archive 阶段：要求 _human 与 _llm 不是简单复制 Spec，而是分别面向人和模型做摘要与压缩
    - 团队使用规则：Plan Approved 才能动手、关闭全自动模式、发现回写 Spec
    - 三层上下文：Spec + CodeMap + ProjectMap
    - Pre-Research 命令说明：create_codemap / build_context_bundle / sdd_bootstrap
    - 明确 `sdd_bootstrap` 的输入语义：
      - `requirement` = 当前生效的任务定义（当前执行口径）
      - `context` = 支撑 requirement 的背景材料包（可含当前需求原始资料、历史资料、CodeMap、ProjectMap）
      - 若 context 与 requirement 冲突，以 requirement 为准，并在 Spec/Research 中记录
    - 归档规则：archive 产出 _human.md + _llm.md
    - 阶段自由度表（Research=中 / Innovate=高 / Plan=低 / Execute=零 / Review=中）
  - 创建 `protocols/sdd-riper-one-light.md`：轻量版协议，包含
    - 同样的三铁律和五阶段（精简描述）
    - micro-spec 概念：目标 / 范围 / 约束 / 风险 / Checklist（5 字段最小结构）
    - requirement/context 的最小定义：micro-spec 是 requirement，不等于 context
    - Lite 仅强制保留两个最小澄清动作：Requirement Restatement + Open Questions
    - Lite 的阶段约束：
      - Innovate 可跳过（需给 skipped reason）
      - Plan 允许 micro-plan（文件/改动点/验收）
      - Execute 只要求简短 Change Summary
      - Review 只要求 verdict + deviation summary
      - Archive 允许简版 summary，不要求完整双份深度沉淀
    - Fast / Standard / Deep 三档自动分流规则
    - 适用前提：需配合顶级模型，团队已熟悉 RIPER 各阶段
  - 两份文件都要包含"禁止事项"清单（护栏）

  **Must NOT do**:
  - 不要直接复制文章全文，需精炼为 AI 可消费的指令式语言
  - 不要让标准版和轻量版在目录约定上产生分歧
  - 不要超过合理长度（标准版 ≤400 行，轻量版 ≤150 行）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要深度理解 SDD-RIPER 方法论，精炼并重新表达为结构化 AI 指令
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1（与 Task 1、Task 3 并行）
  - **Blocks**: Task 4（init 生成 AI 配置时引用协议内容）
  - **Blocked By**: None

  **References**:
  - 文章原文核心章节：30秒读懂核心思想、RIPER完整实操教程、和AI协作的正确姿势
  - 文章三铁律、五阶段定义、阶段自由度表

  **Acceptance Criteria**:

  ```
  Scenario: 标准版协议文件存在且含必要关键词
    Tool: Bash
    Steps:
      1. test -f ./protocols/sdd-riper-one.md && echo PASS
      2. grep -q "No Spec, No Code" ./protocols/sdd-riper-one.md && echo "铁律1:PASS"
      3. grep -q "Plan Approved" ./protocols/sdd-riper-one.md && echo "门禁:PASS"
      4. grep -q "Research" ./protocols/sdd-riper-one.md && echo "阶段:PASS"
      5. wc -l ./protocols/sdd-riper-one.md  # 应 ≤400
    Expected Result: 所有 grep 返回 0，行数 ≤400
    Evidence: .sisyphus/evidence/task-2-protocol-standard.txt

  Scenario: 轻量版协议文件存在且含 micro-spec 定义
    Tool: Bash
    Steps:
      1. test -f ./protocols/sdd-riper-one-light.md && echo PASS
      2. grep -q "micro-spec" ./protocols/sdd-riper-one-light.md && echo PASS
      3. wc -l ./protocols/sdd-riper-one-light.md  # 应 ≤150
    Expected Result: grep 返回 0，行数 ≤150
    Evidence: .sisyphus/evidence/task-2-protocol-lite.txt
  ```

  **Commit**: YES（Wave 1 完成后统一提交）

- [x] 3. templates/ 文档模板（6 类）

  **What to do**:
  - `templates/spec.md` — 完整 Spec 模板，含以下 section：
    - frontmatter（date / task-name / mode: standard|lite / status: draft|approved|done）
    - 开头说明注释：
      - Requirement = 当前执行口径
      - Context = 背景材料与来源
      - Spec = requirement + context + research 收敛后的单一真相源
    - 标准版额外固定区块：
      - Requirement Restatement
      - Open Questions
      - Assumptions
      - Research Readiness Checklist
      - Innovate Options（至少2个方案，含 Pros / Cons / 风险 / 推荐）
      - Plan Readiness / Approval（含 `Plan Approved By` / `Approved At` 占位符）
      - Execute Log（含 Files Changed / Why Changed / Deviations from Plan）
      - Review Summary（含 Spec Fulfilled / Deviations / Remaining Risks / Verdict）
    - 轻量版最小固定区块：
      - Requirement Restatement
      - Open Questions
      - Micro Plan
      - Change Summary
      - Review Verdict
    - §1 目标（Goal）、§2 范围（Scope）、§3 约束（Constraints）、§4 风险（Risks）、§5 验收清单（Checklist）
    - §6 Research Findings（调研发现，含代码出处占位符）
    - §7 Innovate Options（方案对比，含 Pros/Cons 占位符）
    - §8 Plan（原子级清单，含文件路径+函数签名占位符）
    - §9 Execute Log（执行日志，含步骤打勾）
    - §10 Review Verdict（验收结论，含 Spec vs Code 对比）
    - 每个 section 含说明注释（<!-- 注释 -->）
  - `templates/codemap.md` — CodeMap 模板，含：
    - frontmatter（project / module / updated-at）
    - 入口点列表（含文件路径/函数名）
    - 核心调用链路（Mermaid flowchart 占位符）
    - 外部依赖（DB/RPC/MQ）
    - 风险点和不确定项
  - `templates/projectmap.md` — ProjectMap 模板，含：
    - frontmatter（name / repos: 数组 / updated-at）— 机器可解析
    - 仓库清单（每个仓库：名称、路径/URL、职责、技术栈、负责人）
    - 本次任务涉及的仓库（标记哪些需改动，哪些只是背景）
    - 核心接口契约（接口名、提供方、消费方、数据格式）
    - 跨仓库验证清单
  - `templates/context-bundle.md` — Context Bundle 模板（一次性），含：
    - 当前需求原始资料（PRD / 设计图 / 讨论记录）
    - 历史背景（旧 spec / 历史决策 / 旧方案）
    - 工程背景（CodeMap / ProjectMap / 模块说明）
    - 信息冲突记录（哪些材料与当前 requirement 冲突）
    - 说明注释：Context 是背景材料包，不是当前 requirement 的权威定义
  - `templates/archive-human.md` — 归档人类可读版模板
  - `templates/archive-llm.md` — 归档 AI 上下文恢复版模板（高密度，无冗余）
  - 两个 archive 模板都需明确“不是复制 spec 原文”，而是：
    - human 侧：决策、方案、结果、风险
    - llm 侧：约束、链路、数据结构、坑点

  **Must NOT do**:
  - 不要在模板里写具体业务内容，全用占位符
  - 不要让 projectmap 只是自由文本，frontmatter 必须有固定字段供 status 校验

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要深度理解 SDD-RIPER 每个阶段的产出物定义，设计出结构完整的模板
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1（与 Task 1、Task 2 并行）
  - **Blocks**: Task 4（init 复制模板）、Task 5（new-* 从模板生成）、Task 7（archive 用归档模板）
  - **Blocked By**: None

  **References**:
  - 文章 Step 0 Pre-Research 部分：三个命令的产出路径和性质
  - 文章 Step 3 Plan 阶段：原子级清单格式（文件路径 + 函数签名 + 执行顺序）
  - 文章 Step 6 Archive：_human.md（精炼方案）vs _llm.md（AI 上下文恢复钥匙）

  **Acceptance Criteria**:

  ```
  Scenario: 6 个模板文件全部存在
    Tool: Bash
    Steps:
      1. for f in spec codemap projectmap context-bundle archive-human archive-llm; do test -f ./templates/${f}.md && echo "${f}:OK" || echo "${f}:MISSING"; done
    Expected Result: 全部显示 OK
    Evidence: .sisyphus/evidence/task-3-templates.txt

  Scenario: spec 模板含所有必需 section
    Tool: Bash
    Steps:
      1. grep -c "^## §" ./templates/spec.md  # 应 ≥6（§1-§10）
      2. grep -q "status:" ./templates/spec.md && echo "frontmatter:PASS"
      3. grep -q "Plan Approved" ./templates/spec.md && echo "门禁提示:PASS"
      4. grep -q "Requirement = 当前执行口径" ./templates/spec.md && echo "requirement定义:PASS"
      5. grep -q "Execute Log" ./templates/spec.md && echo "执行日志:PASS"
      6. grep -q "Review Summary" ./templates/spec.md && echo "Review摘要:PASS"
    Expected Result: section 数 ≥6，frontmatter 和门禁提示存在
    Evidence: .sisyphus/evidence/task-3-spec-template.txt

  Scenario: projectmap 模板含机器可解析 frontmatter
    Tool: Bash
    Steps:
      1. grep -q "^repos:" ./templates/projectmap.md && echo "repos字段:PASS"
      2. grep -q "^name:" ./templates/projectmap.md && echo "name字段:PASS"
    Expected Result: 两个 grep 均返回 0
    Evidence: .sisyphus/evidence/task-3-projectmap.txt
  ```

  **Commit**: YES（Wave 1 完成后统一提交）

- [x] 4. bin/init.sh + bin/_gen_ai_configs.sh

  **What to do**:
  - `bin/init.sh <target-dir> [--mode standard|lite] [--force] [--docs-dir <name>]`
    - 创建 `<target-dir>/mydocs/`（或 --docs-dir 指定名）下的 specs/ codemap/ context/ archive/ evidence/ 各含 .gitkeep
    - 调用 `_gen_ai_configs.sh` 生成 4 种 AI 配置文件
    - 复制 `templates/spec.md` 到 mydocs/specs/ 作为示例
    - 冲突策略：已有文件默认 skip+打印 WARN，`--force` 时覆盖
    - 幂等性：重复执行 exit 0，已有文件输出 SKIP 提示
    - 成功后打印简短摘要（已创建文件数、已跳过文件数）
  - `bin/_gen_ai_configs.sh <target-dir> <mode> <force-flag>`
    - 规范源：`protocols/sdd-riper-one.md`（standard）或 `protocols/sdd-riper-one-light.md`（lite）
    - 生成 `AGENTS.md`：通用格式，引用协议核心规则，适配 OpenCode/Claude
    - 生成 `CLAUDE.md`：Claude 专属 Project Instructions 格式，含 memory 和 behavior 配置
    - 生成 `.cursorrules`：Cursor 格式（纯文本规则集）
    - 生成 `.github/copilot-instructions.md`：Copilot 格式，需先创建 .github/ 目录
    - 四个文件核心规则一致（来自同一协议源），格式适配各平台
    - 每个文件必须含：No Spec, No Code / Plan Approved / RIPER 阶段 / ProjectMap 引用说明

  **Must NOT do**:
  - 不要四份 AI 配置文件手工写不同内容（必须从协议源派生）
  - 不要默认覆盖已有文件
  - 不要在 init 里嵌入任何业务逻辑或代码生成

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Shell 脚本逻辑较复杂，涉及参数解析、冲突检测、多平台文件生成
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 T5、T6、T7 并行）
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 9（demo 使用 init）
  - **Blocked By**: Task 1（bin/ 骨架）、Task 2（协议文件内容）、Task 3（模板文件）

  **References**:
  - `protocols/sdd-riper-one.md` — 标准协议内容（生成 AI 配置的规范源）
  - `protocols/sdd-riper-one-light.md` — 轻量协议内容
  - `templates/spec.md` — 初始化时复制的示例 Spec

  **Acceptance Criteria**:

  ```
  Scenario: fresh init（标准模式）
    Tool: Bash
    Preconditions: ./tmp/demo 不存在
    Steps:
      1. mkdir -p ./tmp && bash ./sdd.sh init ./tmp/demo --mode standard
      2. echo "exit:$?"
      3. for d in mydocs/specs mydocs/codemap mydocs/context mydocs/archive mydocs/evidence; do test -d ./tmp/demo/$d && echo "$d:OK" || echo "$d:MISSING"; done
      4. for f in AGENTS.md CLAUDE.md .cursorrules .github/copilot-instructions.md; do test -f ./tmp/demo/$f && echo "$f:OK" || echo "$f:MISSING"; done
      5. grep -q "No Spec, No Code" ./tmp/demo/AGENTS.md && echo "规则:PASS"
      6. grep -q "Plan Approved" ./tmp/demo/CLAUDE.md && echo "门禁:PASS"
      7. grep -q "RIPER" ./tmp/demo/.cursorrules && echo "RIPER:PASS"
      8. grep -q "ProjectMap" ./tmp/demo/.github/copilot-instructions.md && echo "ProjectMap:PASS"
    Expected Result: exit 0，所有目录和文件 OK，所有关键规则存在
    Evidence: .sisyphus/evidence/task-4-init-standard.txt

  Scenario: 重复 init（幂等性）
    Tool: Bash
    Preconditions: ./tmp/demo 已由上一场景创建
    Steps:
      1. bash ./sdd.sh init ./tmp/demo --mode standard
      2. echo "exit:$?"
    Expected Result: exit 0，输出含 SKIP 或类似提示，无文件被覆盖
    Evidence: .sisyphus/evidence/task-4-init-rerun.txt

  Scenario: --force 覆盖已有文件
    Tool: Bash
    Steps:
      1. bash ./sdd.sh init ./tmp/demo --mode lite --force
      2. echo "exit:$?"
      3. grep -q "micro-spec" ./tmp/demo/AGENTS.md && echo "lite内容:PASS"
    Expected Result: exit 0，AI 配置文件被轻量版内容覆盖
    Evidence: .sisyphus/evidence/task-4-init-force.txt

  Scenario: 路径含空格
    Tool: Bash
    Steps:
      1. bash ./sdd.sh init "./tmp/demo with spaces" --mode standard
      2. echo "exit:$?"
      3. test -d "./tmp/demo with spaces/mydocs/specs" && echo "PASS"
    Expected Result: exit 0，目录正确创建
    Evidence: .sisyphus/evidence/task-4-init-spaces.txt
  ```

  **Commit**: YES（Wave 2 完成后统一提交）

- [x] 5. bin/new-spec.sh + new-codemap.sh + new-projectmap.sh

  **What to do**:
  - `bin/new-spec.sh <project-dir> <task-name> [--mode standard|lite]`
    - 命名：`mydocs/specs/YYYYMMDD_<task-name>.md`（task-name 中空格转下划线）
    - 内容：从 `templates/spec.md` 复制，替换占位符（date / task-name / mode）
    - 冲突：同名文件已存在则 exit 1（打印 ERROR，提示加 --force）
    - `--force`：覆盖已有文件
  - `bin/new-codemap.sh <project-dir> <module-name>`
    - 命名：`mydocs/codemap/<module-name>.md`
    - 内容：从 `templates/codemap.md` 复制，替换占位符（module / updated-at）
    - 冲突策略：同上
  - `bin/new-projectmap.sh <project-dir> [--repos repo1,repo2,...]`
    - 命名：`mydocs/projectmap.md`（固定名，一个项目一份 ProjectMap）
    - 内容：从 `templates/projectmap.md` 复制，填充 repos 列表（frontmatter）
    - 若已存在：exit 1（打印 ERROR，提示加 --force 或手动编辑）

  **Must NOT do**:
  - 不要硬编码日期格式以外的命名规则
  - 不要在创建文件时自动执行 AI 分析（只生成模板，由用户自行填写后交给 AI）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 三个脚本逻辑相近但各有差异，需统一参数风格和错误处理
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 T4、T6、T7 并行）
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 10（tests 覆盖 new-* 命令）
  - **Blocked By**: Task 1（bin/ 骨架）、Task 3（模板文件）

  **References**:
  - `templates/spec.md` — new-spec 的内容来源
  - `templates/codemap.md` — new-codemap 的内容来源
  - `templates/projectmap.md` — new-projectmap 的内容来源（frontmatter 字段需完整填充）

  **Acceptance Criteria**:

  ```
  Scenario: new-spec 创建文件（happy path）
    Tool: Bash
    Preconditions: ./tmp/demo 已 init
    Steps:
      1. bash ./sdd.sh new-spec ./tmp/demo "checkout-retry" --mode standard
      2. echo "exit:$?"
      3. ls ./tmp/demo/mydocs/specs/ | grep "checkout-retry"
      4. grep -q "checkout-retry" ./tmp/demo/mydocs/specs/*checkout-retry*.md && echo "名称替换:PASS"
      5. grep -q "status:" ./tmp/demo/mydocs/specs/*checkout-retry*.md && echo "frontmatter:PASS"
    Expected Result: exit 0，文件命名含日期和 task-name，frontmatter 正确
    Evidence: .sisyphus/evidence/task-5-new-spec.txt

  Scenario: new-spec 同名冲突
    Tool: Bash
    Steps:
      1. bash ./sdd.sh new-spec ./tmp/demo "checkout-retry"
      2. echo "exit:$?"
    Expected Result: exit 1，打印 ERROR 提示
    Evidence: .sisyphus/evidence/task-5-new-spec-conflict.txt

  Scenario: new-projectmap 创建并含 frontmatter
    Tool: Bash
    Steps:
      1. bash ./sdd.sh new-projectmap ./tmp/demo --repos "frontend-app,backend-api"
      2. echo "exit:$?"
      3. grep -q "^repos:" ./tmp/demo/mydocs/projectmap.md && echo "repos:PASS"
      4. grep -q "frontend-app" ./tmp/demo/mydocs/projectmap.md && echo "内容:PASS"
    Expected Result: exit 0，projectmap.md 存在且含 repos frontmatter
    Evidence: .sisyphus/evidence/task-5-projectmap.txt
  ```

  **Commit**: YES（Wave 2 完成后统一提交）

- [x] 6. bin/status.sh

  **What to do**:
  - `bin/status.sh <project-dir>`
  - 校验以下内容（全部基于约定检查，不做模糊扫描）：
    - 必需目录存在：mydocs/specs, codemap, context, archive, evidence
    - 至少一个 AI 配置文件存在（AGENTS.md 或 CLAUDE.md 或 .cursorrules）
    - 如有 mydocs/projectmap.md，检查其 frontmatter 含 `name:` 和 `repos:`
    - 如有任何 spec 文件，读取 frontmatter 的 `status:` 字段，汇总 draft/approved/done 计数
    - **轻内容检查（仅 WARN，不阻断）**：
      - Requirement Restatement 是否为空
      - Open Questions 是否为空
      - 是否存在 `[待确认]`
      - Research Findings 是否为空
      - Innovate Options 是否为空或是否显式写了 `Innovate: Skipped, Reason:`
      - Plan Approved 字段是否为空（仅提示，不替代人工批准）
      - Execute Log / Change Summary 是否为空
      - Review Summary / Review Verdict 是否为空
  - 输出格式（人类可读，同时机器可 grep）：
    ```
    [SDD Status] ./tmp/demo
      Structure:    OK / MISSING (list)
      AI Config:    OK (AGENTS.md found) / WARN (none found)
      ProjectMap:   OK / WARN (no projectmap) / ERROR (broken frontmatter)
      Specs:        3 total (1 draft, 1 approved, 1 done)
      Research:     WARN (empty restatement / unresolved questions / pending markers)
      Innovate:     WARN (missing options or skipped reason)
      Plan:         WARN (missing approval metadata)
      Execute:      WARN (missing execute log / change summary)
      Review:       WARN (missing review summary / verdict)
    ```
  - Exit codes：0=全部 OK，1=缺失必需目录，2=projectmap frontmatter 损坏，3=参数错误

  **Must NOT do**:
  - 不要扫描 git history 或做智能判断
  - 不要 exit 非 0 仅因为没有 projectmap（无 projectmap = WARN 不是 ERROR）
  - 不要把内容检查做成硬门禁（Open Questions 未清空、存在 `[待确认]` 时只能 WARN，不得阻断）
  - 不要尝试自动判断“Research 是否充分”或“Review 是否高质量”，只检查痕迹，不检查理解质量

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要精确的 exit code 设计和 frontmatter 解析逻辑
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 T4、T5、T7 并行）
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 10（tests 验证 status exit code）
  - **Blocked By**: Task 1（bin/ 骨架）

  **References**:
  - `templates/projectmap.md` — frontmatter 结构定义（name: / repos: 字段）
  - `templates/spec.md` — frontmatter 的 status: 字段定义

  **Acceptance Criteria**:

  ```
  Scenario: 完整结构返回 exit 0
    Tool: Bash
    Preconditions: ./tmp/demo 已 init 且含 projectmap
    Steps:
      1. bash ./sdd.sh status ./tmp/demo
      2. echo "exit:$?"
      3. bash ./sdd.sh status ./tmp/demo | grep "Structure:" | grep "OK"
    Expected Result: exit 0，Structure 行含 OK
    Evidence: .sisyphus/evidence/task-6-status-ok.txt

  Scenario: 缺失 mydocs/specs 返回 exit 1
    Tool: Bash
    Steps:
      1. mkdir -p ./tmp/broken && mkdir -p ./tmp/broken/mydocs/codemap
      2. bash ./sdd.sh status ./tmp/broken
      3. echo "exit:$?"
    Expected Result: exit 1，输出含 MISSING
    Evidence: .sisyphus/evidence/task-6-status-missing.txt

  Scenario: projectmap frontmatter 损坏返回 exit 2
    Tool: Bash
    Steps:
      1. echo "这是一个损坏的projectmap" > ./tmp/demo/mydocs/projectmap.md
      2. bash ./sdd.sh status ./tmp/demo
      3. echo "exit:$?"
    Expected Result: exit 2，输出含 ERROR (broken frontmatter)
    Evidence: .sisyphus/evidence/task-6-status-broken-pm.txt
  ```

  **Commit**: YES（Wave 2 完成后统一提交）

- [x] 7. bin/archive.sh

  **What to do**:
  - `bin/archive.sh <project-dir> <spec-name> [--force]`
  - `spec-name` 是不带日期前缀的名称（如 `checkout-retry`），脚本自动匹配 mydocs/specs/*<spec-name>*.md
  - 如果匹配到多个文件，exit 1 并提示用户指定完整文件名
  - 如果匹配到一个文件，读取其内容，产出：
    - `mydocs/archive/YYYYMMDD_<spec-name>_human.md`：人类可读归档（从 archive-human.md 模板填充）
      - 包含：目标 / 最终方案 / 关键决策 / 执行摘要 / Review 结论
    - `mydocs/archive/YYYYMMDD_<spec-name>_llm.md`：AI 上下文恢复版（从 archive-llm.md 模板填充）
      - 包含：项目背景 / 数据结构 / 核心约束 / 链路摘要（高密度，无叙事）
  - **不删除**原始 spec 文件（只归档，不移除）
  - 冲突：同名归档已存在则 exit 1（提示加 --force）
  - `--force`：覆盖已有归档文件

  **Must NOT do**:
  - 不要自动删除原始 spec
  - 不要在归档时调用 AI API（archive 是静态模板填充，内容由用户/AI 事先写好在 spec 里）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要设计可靠的文件匹配逻辑和模板填充机制
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 T4、T5、T6 并行）
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 10（tests 验证 archive 输出）
  - **Blocked By**: Task 1（bin/ 骨架）、Task 3（归档模板）

  **References**:
  - `templates/archive-human.md` — 人类可读归档模板
  - `templates/archive-llm.md` — AI 上下文恢复模板
  - 文章 Step 6 Archive 说明：_human.md 是"精炼方案"，_llm.md 是"AI 恢复上下文的钥匙"

  **Acceptance Criteria**:

  ```
  Scenario: archive 产出两个文件（happy path）
    Tool: Bash
    Preconditions: ./tmp/demo/mydocs/specs/ 含 *checkout-retry*.md
    Steps:
      1. bash ./sdd.sh archive ./tmp/demo "checkout-retry"
      2. echo "exit:$?"
      3. ls ./tmp/demo/mydocs/archive/ | grep "checkout-retry_human"
      4. ls ./tmp/demo/mydocs/archive/ | grep "checkout-retry_llm"
    Expected Result: exit 0，两个归档文件均存在
    Evidence: .sisyphus/evidence/task-7-archive.txt

  Scenario: 原始 spec 未被删除
    Tool: Bash
    Steps:
      1. ls ./tmp/demo/mydocs/specs/ | grep "checkout-retry"
    Expected Result: 原始 spec 文件仍然存在
    Evidence: .sisyphus/evidence/task-7-archive-original.txt

  Scenario: 重复归档（冲突）
    Tool: Bash
    Steps:
      1. bash ./sdd.sh archive ./tmp/demo "checkout-retry"
      2. echo "exit:$?"
    Expected Result: exit 1，打印 ERROR 提示
    Evidence: .sisyphus/evidence/task-7-archive-conflict.txt

  Scenario: --force 覆盖归档
    Tool: Bash
    Steps:
      1. bash ./sdd.sh archive ./tmp/demo "checkout-retry" --force
      2. echo "exit:$?"
    Expected Result: exit 0，归档文件被覆盖
    Evidence: .sisyphus/evidence/task-7-archive-force.txt
  ```

  **Commit**: YES（Wave 2 完成后统一提交）

- [x] 8. README.md + TEAM-GUIDE.md

  **What to do**:
  - `README.md` — 项目主文档，中文，包含：
    - 简介：这是什么、解决什么问题（对应文章四大痛点）
    - 快速开始（5分钟）：安装说明（克隆 + chmod + 配置 PATH 或直接用 bash sdd.sh）
    - 支持矩阵：macOS/Linux bash + Windows Git Bash / WSL（前置条件）
    - CLI 命令速查表（6个命令，参数，exit code，示例）
    - 双轨说明：standard vs lite 的区别和切换方式
    - 目录结构说明（mydocs/ 各目录用途）
    - 多项目协作说明（ProjectMap 的角色）
    - 常见问题（Q&A，参考文章 FAQ）
    - FAQ：为什么 `sdd_bootstrap` 需要同时输入 requirement 和 context
    - FAQ：Requirement / Context / Spec 的区别（Requirement 是执行口径，Context 是背景材料包，Spec 是收敛后的真相源）
    - FAQ：为什么 standard 更严格，而 lite 只保留最小澄清动作
    - FAQ：为什么 status 只做提示型校验，而不做硬门禁
    - 贡献指南
  - `TEAM-GUIDE.md` — 团队落地 SOP，中文，包含：
    - TL 决策速览（30秒版本）
    - 一周落地计划（Day1-2 试点 / Day3-4 复盘 / Day5-7 扩大）
    - 团队唯一规则：未经 Plan Approved，不得改代码
    - 角色分工：核心研发 vs 低经验同学 vs TL/主管
    - 与 AI 协作的正确姿势（意图分类表、阶段产出表、自由度表）
    - 方法论说明：Pre-Research 中 requirement 与 context 的职责分工
    - 方法论说明：`sdd_bootstrap` 是同时接收 requirement + context 建立工作底座，而不是二选一
    - 方法论说明：Research Guardrails 的折中策略（standard 中强治理，lite 极简治理，status 仅提示不阻断）
    - 方法论说明：其他阶段的折中策略（Innovate/Plan/Execute/Review/Archive 各自的增强与边界）
    - 效果量化方法（Bug率、需求周期的测量方式）
    - 常见坑和解决方案

  **Must NOT do**:
  - 不要写成纯技术手册，需要有团队视角
  - 不要省略 Windows 前置条件说明

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: 核心是高质量中文技术文档写作，面向团队 onboarding
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 T9、T10 并行）
  - **Parallel Group**: Wave 3
  - **Blocks**: 无
  - **Blocked By**: Task 1-7（需了解完整功能才能写文档）

  **References**:
  - 文章第三章"5分钟团队部署"、第四章"RIPER完整实操教程"、第五章"第一周怎么跑"
  - 文章第六章效果数据
  - `protocols/sdd-riper-one.md` + `protocols/sdd-riper-one-light.md`（双轨区别说明）

  **Acceptance Criteria**:

  ```
  Scenario: README 含 CLI 速查表
    Tool: Bash
    Steps:
      1. test -f ./README.md && echo PASS
      2. grep -q "sdd init" ./README.md && echo "init命令:PASS"
      3. grep -q "sdd status" ./README.md && echo "status命令:PASS"
      4. grep -q "Git Bash" ./README.md && echo "Windows说明:PASS"
      5. grep -q "Requirement / Context / Spec" ./README.md && echo "概念说明:PASS"
    Expected Result: 所有 grep 返回 0
    Evidence: .sisyphus/evidence/task-8-readme.txt

  Scenario: TEAM-GUIDE 含一周落地计划
    Tool: Bash
    Steps:
      1. test -f ./TEAM-GUIDE.md && echo PASS
      2. grep -q "Day" ./TEAM-GUIDE.md && echo "落地计划:PASS"
      3. grep -q "Plan Approved" ./TEAM-GUIDE.md && echo "团队规则:PASS"
      4. grep -q "sdd_bootstrap" ./TEAM-GUIDE.md && echo "bootstrap说明:PASS"
    Expected Result: 所有检查通过
    Evidence: .sisyphus/evidence/task-8-teamguide.txt
  ```

  **Commit**: YES（Wave 3 完成后统一提交）

- [x] 9. examples/ 前后端多项目示例

  **What to do**:
  - `examples/frontend-app/` — 前端项目示例，包含：
    - 已 init 的 SDD 结构（AGENTS.md / .cursorrules / mydocs/）
    - 一份填充好的示例 Spec（`mydocs/specs/20260416_user-login-page.md`）
    - 一份示例 CodeMap（`mydocs/codemap/auth-flow.md`）
  - `examples/backend-api/` — 后端项目示例，包含：
    - 已 init 的 SDD 结构
    - 一份填充好的示例 Spec（`mydocs/specs/20260416_login-api.md`）
    - 一份示例 CodeMap（`mydocs/codemap/auth-service.md`）
  - `examples/projectmap.md` — 跨仓库协作示例 ProjectMap，包含：
    - frontmatter（name: user-login-feature / repos: [frontend-app, backend-api]）
    - 两个仓库的职责说明和本次任务涉及范围
    - 核心接口契约（POST /api/login 请求/响应格式）
    - 跨仓库验证清单（前端调用成功 + 后端返回 JWT + 端到端冒烟）
  - `examples/README.md` — 示例说明（如何使用这些示例学习 SDD 协作模式）

  **Must NOT do**:
  - 示例 Spec 和 CodeMap 要写得足够真实，但不要绑定特定语言的代码
  - 不要把示例做成空模板（examples 的价值在于展示"填充后的样子"）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要写真实可信的示例内容，展示 SDD-RIPER 工作流的全貌
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 T8、T10 并行）
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 10（tests 可验证 examples 结构完整性）
  - **Blocked By**: Task 3（模板），Task 4（init 机制，示例由 init 生成后填充）

  **References**:
  - `templates/spec.md` — 示例 Spec 参考模板结构（填充所有 section）
  - `templates/codemap.md` — 示例 CodeMap 参考
  - `templates/projectmap.md` — 示例 ProjectMap 参考
  - 文章"三种常见协作模式"第一种：两个主项目并行协作

  **Acceptance Criteria**:

  ```
  Scenario: examples 目录结构完整
    Tool: Bash
    Steps:
      1. test -d ./examples/frontend-app/mydocs/specs && echo "前端specs:OK"
      2. test -d ./examples/backend-api/mydocs/specs && echo "后端specs:OK"
      3. test -f ./examples/projectmap.md && echo "ProjectMap:OK"
      4. grep -q "^repos:" ./examples/projectmap.md && echo "frontmatter:OK"
    Expected Result: 全部 OK
    Evidence: .sisyphus/evidence/task-9-examples.txt

  Scenario: 示例 Spec 内容真实可读
    Tool: Bash
    Steps:
      1. wc -l ./examples/frontend-app/mydocs/specs/*.md  # 应 >30 行（非空模板）
      2. grep -q "Research" ./examples/frontend-app/mydocs/specs/*.md && echo "阶段内容:PASS"
    Expected Result: Spec 行数 >30，含实际内容
    Evidence: .sisyphus/evidence/task-9-spec-content.txt
  ```

  **Commit**: YES（Wave 3 完成后统一提交）

- [x] 10. tests/ 自动化验证脚本

  **What to do**:
  - `tests/test_init.sh` — 测试 `sdd init`：
    - fresh init standard → exit 0 + 文件完整
    - fresh init lite → exit 0 + lite 内容
    - rerun（幂等）→ exit 0 + SKIP 提示
    - --force 覆盖 → exit 0 + 内容更新
    - 路径含空格 → exit 0
    - 已有冲突文件且无 --force → exit 0 + WARN（skip 策略）
  - `tests/test_new.sh` — 测试 `sdd new-spec / new-codemap / new-projectmap`：
    - happy path → exit 0 + 文件命名正确 + frontmatter 正确
    - 同名冲突 → exit 1
    - --force 覆盖 → exit 0
  - `tests/test_status.sh` — 测试 `sdd status`：
    - 完整结构 → exit 0
    - 缺失目录 → exit 1
    - 损坏 projectmap → exit 2
    - 无效参数 → exit 3
  - `tests/test_archive.sh` — 测试 `sdd archive`：
    - happy path → exit 0 + _human.md + _llm.md 存在
    - 原始 spec 未删除
    - 重复归档 → exit 1
    - --force 覆盖 → exit 0
  - `tests/run_all.sh` — 依次运行所有测试，汇总 PASS/FAIL，最终 exit 0（全过）或 exit 1（有失败）
  - 每个测试前自动创建隔离的 tmp 目录，测试后清理

  **Must NOT do**:
  - 不要测试依赖网络或 AI API 的行为
  - 不要让测试脚本修改 examples/ 或 templates/（只用 tmp/）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要全面覆盖各命令的三类场景，shell 测试设计有一定复杂度
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 T8、T9 并行）
  - **Parallel Group**: Wave 3
  - **Blocks**: Final 验证波（F3 直接运行 run_all.sh）
  - **Blocked By**: Task 4-7（所有命令实现完毕才能写测试）

  **References**:
  - `bin/init.sh` / `bin/new-spec.sh` / `bin/status.sh` / `bin/archive.sh` — 被测命令
  - Metis 分析中的验收标准清单（happy path + conflict + rerun 三类）

  **Acceptance Criteria**:

  ```
  Scenario: run_all.sh 全部通过
    Tool: Bash
    Steps:
      1. bash ./tests/run_all.sh
      2. echo "exit:$?"
    Expected Result: exit 0，输出 "All tests passed"（或类似）
    Evidence: .sisyphus/evidence/task-10-tests-run.txt

  Scenario: 单个测试失败时 run_all 返回 exit 1
    Tool: Bash
    Steps:
      1. 临时注释掉 bin/init.sh 中的目录创建代码
      2. bash ./tests/run_all.sh
      3. echo "exit:$?"
      4. 恢复 bin/init.sh
    Expected Result: exit 1，输出含 FAIL
    Evidence: .sisyphus/evidence/task-10-tests-fail.txt

  Scenario: 测试后 tmp/ 被清理
    Tool: Bash
    Steps:
      1. bash ./tests/run_all.sh
      2. ls ./tmp/ 2>/dev/null | wc -l
    Expected Result: 0（tmp 目录被清理）或不存在
    Evidence: .sisyphus/evidence/task-10-cleanup.txt
  ```

  **Commit**: YES（Wave 3 完成后统一提交）

---

## Final Verification Wave

> 4 路并行审查，全部 APPROVE 后等待用户明确确认。

- [x] F1. **Plan 合规审计** — `oracle`
  逐条核查 Must Have：6 个 CLI 命令存在且有 exit code；AI 配置来自单一源；双轨模式共享目录；ProjectMap 有 frontmatter；tests/ 覆盖三类场景。逐条核查 Must NOT Have：无业务代码、无 CI/CD、无 API 直连、status 不依赖模糊扫描。
  Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Shell 代码质量审查** — `unspecified-high`
  检查所有 .sh 文件：shellcheck 静态分析、路径引用正确性、exit code 一致性、幂等性实现、--force 标志处理、中文路径/空格路径安全性。
  Output: `Files [N clean/N issues] | Shellcheck [PASS/FAIL] | VERDICT`

- [x] F3. **实际 QA 执行** — `unspecified-high`
  运行 `bash tests/run_all.sh`，从零开始执行每个 CLI 命令的 happy path + conflict + rerun 场景，保存终端输出到 `.sisyphus/evidence/final-qa/`。
  Output: `Tests [N/N pass] | Scenarios [N/N] | VERDICT`

- [x] F4. **范围合规检查** — `deep`
  检查每个 task 的实际产出是否与 Plan 一一对应：没有遗漏、没有超出范围（无业务代码/CI/UI）。
  Output: `Tasks [N/N compliant] | Scope Violations [CLEAN/N] | VERDICT`

---

## Commit Strategy

- Wave 1 完成后：`feat(scaffold): add CLI entry point and protocol files`
- Wave 2 完成后：`feat(cli): implement all sdd subcommands with exit codes`
- Wave 3 完成后：`feat(docs): add README, team guide, examples and tests`

---

## Success Criteria

### Verification Commands
```bash
bash sdd.sh init ./tmp/demo --mode standard
# Expected: exit 0, mydocs/ + AGENTS.md + CLAUDE.md + .cursorrules + .github/copilot-instructions.md created

bash sdd.sh status ./tmp/demo
# Expected: exit 0, structure summary printed

bash tests/run_all.sh
# Expected: all tests pass, 0 failures

grep -q "No Spec, No Code" ./tmp/demo/AGENTS.md && echo PASS
# Expected: PASS

bash sdd.sh init ./tmp/demo          # rerun (existing)
# Expected: exit 0, skip existing files with warnings

bash sdd.sh init ./tmp/demo --force  # force overwrite
# Expected: exit 0, files overwritten
```

### Final Checklist
- [ ] 6 个 CLI 子命令全部可用
- [ ] 双轨模式正常切换（--mode standard / lite）
- [ ] 所有命令幂等，重复执行安全
- [ ] 4 种 AI 平台配置文件内容一致（来自同一源）
- [ ] ProjectMap 结构化，status 可校验
- [ ] tests/run_all.sh 全部通过
- [ ] README + TEAM-GUIDE 完整，中文
