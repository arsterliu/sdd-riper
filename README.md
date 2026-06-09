# SDD-RIPER：面向 AI 协作开发的治理协议与工具链

SDD-RIPER（Structured Driven Development - Research, Innovate, Plan, Execute, Review）不是一个”提示词模板集合”，而是一套把 **任务定义、阶段门禁、上下文恢复、执行证据和归档复盘** 落到文件系统里的工作流。

> **使用方式**：你不需要读懂这套工具的所有细节再上手。推荐的方式是——在支持 Skill 的 AI 工具（如 OpenCode）里输入 `/sdd` 或 `/sdd-riper`，由 AI 带着你一步步走完整个流程，包括初始化、创建任务、研究、计划审批、执行和归档。**你的主要工作是回答 AI 的问题、审批 Plan、在关键节点做决策**，其余的上下文加载、阶段判断、Spec 填写都由 AI 承担。

它要解决的不是”让 AI 多写一点代码”，而是下面这些在 AI 协作开发里反复出现的问题：

- **方案漂移**：对话拉长后，AI 逐渐偏离原始目标。
- **上下文爆炸**：历史聊天太长，真正重要的约束被淹没。
- **质量不可控**：改动为什么发生、是否偏离计划、有没有留下证据，很难追。
- **修复失焦**：遇到失败后，AI 很容易跳过根因分析直接乱试。

SDD-RIPER 的做法是：把任务收敛成 **Spec**，把架构事实沉淀成 **CodeMap / ProjectMap**，把执行痕迹直接写入 Spec 的 Execute Log 区块，再通过 CLI 和 Skill 把这些门禁真正执行起来。

---

## 1. 这套工具和普通 Prompt 模板有什么不同

普通 Prompt 模板通常只负责“怎么问 AI”。SDD-RIPER 额外提供了 4 个普通模板没有的能力：

1. **版本化任务生命周期**  
   `discover` 会创建版本化 Spec（如 `v1.0-user-login.md`），`archive` 会把已完成任务归档，`reopen` 会基于归档结果创建 patch Spec，而不是重新开一个失忆任务。

2. **人类门禁**  
   在 Skill 工作流里，Plan 阶段必须经过明确的人工批准，AI 不能自己跳过审批直接进入 Execute。

3. **状态感知的上下文恢复**  
   `resume` 会读取最新 Spec、状态、CodeMap / ProjectMap 存在情况，并输出 `PHASE_HINT`，让 AI 恢复到合适阶段，而不是靠聊天记录猜。

4. **流程健康检查**  
   `status` 不只是检查目录是否存在，还会检查研究区块是否为空、是否还有待确认标记、Plan 是否真的被批准、Review 是否留了结论等。

---

## 2. 核心规则

你可以把 SDD-RIPER 理解成下面几条工作约束：

- **No Spec, No Code**：没有 Spec，就不应该进入实现。
- **Plan needs a human gate**：Plan 没有明确批准，就不能进入 Execute。
- **No test, no production code**：执行阶段写生产代码前，必须先有失败测试（TDD）。
- **No root cause, no retry**：出现失败后，先跑 `debug` 找根因，再决定是否重试；针对同一缺陷最多重试 3 次，超出即升级人工介入。
- **No claim without verification**：宣布阶段完成前，必须新鲜运行命令并读取实际输出，不允许靠"应该能工作"来收工。
- **Spec is truth**：任务边界、约束和执行口径以 Spec 为准，不以聊天记忆为准。

这些规则不是 README 里的口号——前两条会被 `init` 写入 `AGENTS.md`、`CLAUDE.md`、`.cursorrules`、`.github/copilot-instructions.md`；后四条由 `SKILL.md` 在 AI 执行层强制执行。

---

## 3. 三个你最先要理解的产物

| 产物 | 作用 | 默认路径 |
| :--- | :--- | :--- |
| **Spec** | 当前任务的单一真相源：需求、约束、研究、计划、执行日志、评审结论都在这里 | `<docs-root>/specs/`（默认 `mydocs/specs/`） |
| **CodeMap** | 模块级架构地图：入口点、调用链、外部依赖、风险项 | `<docs-root>/codemap/`（默认 `mydocs/codemap/`） |
| **ProjectMap** | 多仓/多模块协作的全局地图：边界、接口契约、职责分工 | `<docs-root>/projectmap.md`（默认 `mydocs/projectmap.md`） |

另外还有两个重要目录：

- **`<docs-root>/context/`**：存放 Context Bundle，给新任务或跨阶段切换提供结构化背景材料。
- **`<docs-root>/archive/`**：存放归档文件 `vN.M-<task>.md`，兼顾人类阅读与 AI 上下文恢复，内容从源 Spec 的关键区块自动提取。同目录下的 `index.md` 由 `archive` 命令自动维护，每行一条归档记录（file / date / task / verdict），AI 查历史上下文时先读 index，再按需打开具体文件。

如果你是第一次用，记一句就够了：

- 先有 **Spec**
- 复杂模块再补 **CodeMap**
- 多仓协作再补 **ProjectMap**

---

## 4. 前置条件

### Bash 环境

- **macOS / Linux**：原生可用。
- **Windows**：推荐安装 [Git for Windows](https://git-scm.com/download/win)。
  - 可以直接用 **Git Bash** 跑 `./sdd.sh`
  - 也可以用仓库自带的 `sdd.ps1`

### OpenCode Skill（可选）

如果你想让 AI 自动驾驶整个流程，需要已安装 OpenCode，并把本仓库作为 Skill 放到：

```bash
cp -r sdd-riper ~/.config/opencode/skills/sdd-riper
```

或项目内分发：

```bash
mkdir -p .agents/skills
cp -r sdd-riper .agents/skills/sdd-riper
```

---

## 5. 30 秒选入口

### 路径 A：OpenCode Skill（推荐）

适合第一次上手、希望 AI 带着你按阶段走的人。

在对话中输入：

```text
/sdd-riper
```

也可以使用短触发词 `/sdd`。

Skill 会先判断项目是否已初始化：

- 没初始化 → 引导你走 Setup
- 已初始化 → 走 Workflow，读取当前 Spec 和阶段提示

它本质上还是在调用 `sdd.sh`，但会把人类 gate、阶段切换和 debug-before-retry 这些规则一起执行起来。

### 路径 B：Shell CLI

适合 CI、脚本集成、或者你想手动精确控制每一步。

第一次上手的最短路径就是两步：

```bash
./sdd.sh init my-project
./sdd.sh discover my-project --task-name my-task --requirement "我要做什么"
```

如果任务中断，再用：

```bash
./sdd.sh resume my-project
```

### 路径 C：Windows PowerShell

如果你在 PowerShell 里工作，优先用：

```powershell
.\sdd.ps1 init my-project
.\sdd.ps1 discover my-project --task-name my-task --requirement "我要做什么"
```

`sdd.ps1` 会优先从 Windows Registry 自动定位 Git Bash；找不到时再尝试 `Get-Command bash`。你不需要手动把路径转换成 MINGW 形式。

---

## 5.1 快速参考卡

| 场景 | 命令 |
| :--- | :--- |
| **初始化项目** | `./sdd.sh init <dir>` |
| **开始新任务** | `./sdd.sh discover <dir> --task-name xxx --requirement "..."` |
| **继续已有任务** | `./sdd.sh resume <dir>` |
| **检查项目健康度** | `./sdd.sh status <dir>` |
| **归档已完成任务** | `./sdd.sh archive <dir> <spec-name>` |
| **修复归档后的缺陷** | `./sdd.sh reopen <dir> <task-slug> --defect "..."` |

**核心规则速记**：
- `Plan 未批准` → 你需要先找人审批
- `Plan 已批准，无 Review 结论` → 进入开发阶段
- `任务完成，有 Review 结论` → 可以归档
- `遇到 bug` → 先跑 `debug` 定位根因，再决定是否重试

---

## 5.2 看看效果：一个真实的 Spec 文件

运行 `./sdd.sh discover` 后，会在 `mydocs/specs/` 下创建一个 Spec 文件，例如：

```markdown
---
date: 2026-05-15
task-name: user-login
mode: standard
status: draft
---

# User Login Spec

## Invocation
- **Requirement**: 用户可以通过邮箱和密码登录
- **Goal**: 完成安全的登录流程
- **Constraints**: 不引入新依赖

## Summary
当前阶段: Research
目标: 实现邮箱+密码登录功能
关键约束: 使用现有 AuthService，不引入新依赖
最新进展: 刚创建 Spec，等待 AI 填写 Research Findings

## Research
### Requirement Review
（AI 在此审查需求文本：歧义点、边界缺口、隐含假设、约束冲突；有阻碍项时先列出等待确认）

### Findings
（AI 在此填入调研结论：代码位置、调用链、依赖关系）

### Open Questions
（AI 在此列出技术未知点）

### Assumptions
（AI 在此记录暂未验证的假设）

### Requirement Restatement
（AI 用自己的话复述需求，确保理解一致）

## Innovate Options
（AI 在此列出 ≥2 个方案并对比）

## Plan
- [ ] Step 1: <文件路径> — <做什么> — <验收条件>
> Plan Approved By: ___ / At: ___

## Execute Log
（每个执行步骤的记录在此追加）

## Review Verdict
（四轴审查结论在此填写）
```

**一个 Spec 解决什么问题**：
- 所有参与者（人、AI）都以 Spec 为准，不用翻聊天记录
- 执行过程全部留痕，出了问题是可追溯的
- 人工审批必须明确，不能"AI 自己过了"

---

## 6. 5 分钟上手：真实主路径

> **如果你用的是 OpenCode Skill（路径 A），直接输入 `/sdd` 即可——AI 会引导你完成下面所有步骤，不需要手动执行这些命令。**  
> 本节面向路径 B/C（CLI 手动操作）或希望理解底层发生了什么的用户。

### 第一步：初始化项目

```bash
./sdd.sh init my-project --mode standard
```

这一步会做几件事：

- 创建 docs 根目录（默认 `mydocs/`）及其子目录：`specs/`、`codemap/`、`context/`、`archive/`
- 写入 `.sdd-config`，保存 docs 目录名
- 生成 AI 侧规则文件：
  - `AGENTS.md`
  - `CLAUDE.md`
  - `.cursorrules`
  - `.github/copilot-instructions.md`

如果目标项目已经有较多源码文件且存在项目标记文件（例如 `package.json`、`go.mod`、`pyproject.toml`），`init` 还会提示你先创建 CodeMap。

### 第二步：开始一个新任务

```bash
./sdd.sh discover my-project \
  --task-name "user-login" \
  --requirement "用户可以通过邮箱和密码登录" \
  --goal "完成安全的登录流程" \
  --constraints "不引入新依赖" \
  --context "项目已有 UserService"
```

这一步会：

- 在 `<docs-root>/specs/` 下创建版本化 Spec，例如 `v1.0-user-login.md`
- 自动填充你传入的 requirement / goal / constraints / context
- 输出 `## SPEC CREATION PROMPT`

版本号通过 `--version` 自行指定（必填），例如 `--version v1.0`。同名同版本已存在时会报错。

**`SPEC CREATION PROMPT` 输出后，你该做什么**：

把这段输出直接粘贴给 AI（或在 Skill 流程里 AI 会自动读取）。AI 会：

1. 读取刚创建的 Spec 文件
2. 先对需求做 **Requirement Review**——苏格拉底式追问，不接受需求的字面表述，逐一拆解每个陈述背后的假设（边界、异常路径、约束真实性、验收标准、内部冲突、真实目标）。**有未被显式回答的问题，AI 会停下来向你提问，等你确认后才继续**
3. 调研代码库，填写 Findings / Open Questions / Assumptions / Requirement Restatement
4. 提出 ≥2 个方案（Innovate），等你选择
5. 写出 Plan，**等你审批**（这是唯一需要你明确操作的门禁）

**你在这个阶段只需要**：回答 AI 的需求澄清问题，以及在 Plan 写好后签字审批（在 Spec 里填写 `Plan Approved By` 和 `Approved At`）。

### 第三步：恢复上下文

```bash
./sdd.sh resume my-project
```

`resume` 会输出：

- `DOCS_DIR`
- `ACTIVE_SPECS`
- `LATEST_SPEC`
- `SPEC_STATUS`
- `HAS_CODEMAP`
- `CODEMAP_MODULES`（存在 CodeMap 时）
- `HAS_PROJECTMAP`
- `PHASE_HINT`
- `SECTIONS_HINT`

其中 `PHASE_HINT` 告诉 AI 当前更适合进入哪个阶段，`SECTIONS_HINT` 告诉 AI 本次需要读取的 Spec 区块列表，两者配合实现按需加载，避免全量读取 Spec。

**阶段判断逻辑**（不需要记住，知道结果就行）：

| 当前状态 | AI 会建议进入 |
| :--- | :--- |
| Spec 状态为 archived，或没有活跃 Spec | 新任务（创建新 Spec） |
| Plan 已批准，且 Review 有结论 | 归档（任务完成） |
| Plan 已批准，但 Review 还没有结论 | 开发（Execute） |
| Plan 还没批准 | 研究或计划（Research / Plan） |

也就是说，`resume` 不是简单判断文件状态，而是先看 Plan 是否已批准，再看 Review 是否已有结论，从而给出下一步建议。

---

## 7. RIPER 工作流怎么落地

### 阶段顺序

SDD-RIPER 的核心阶段是：

```text
Research -> Innovate -> Plan -> Execute -> Review
```

围绕这五个阶段，还有两个关键生命周期动作：

```text
init -> discover -> RIPER -> archive
                      └-> reopen -> resume -> patch RIPER
```

### Human Gate：Plan 批准后才能执行

Plan 阶段不是”AI 列个 todo 就完了”。Skill 里，Plan 输出后必须经过人工确认，AI 才能进入 Execute。

Plan 步骤有格式要求——每步必须包含：**完整文件路径 + 具体变更描述（非”加验证”等模糊表达）+ 可运行的验收条件**；粒度控制在 2–5 分钟一步，若超出则拆分。`review-execute` 的 Axis 1 会在 Review 阶段对步骤格式做回溯检查，格式问题会作为 LOW 级别缺陷记录，形成反向压力。

这也是为什么 Spec 模板里有：

- `Plan Approved By:`
- `Approved At:`

如果这两个字段没有实质内容，流程就不应该继续执行。

### Execute：TDD + 按规模路由

Execute 阶段有两条执行规则：

**TDD 铁律**：写任何生产代码之前，必须先有一个失败测试。顺序强制为 RED（写失败测试并确认原因）→ GREEN（写最少代码通过）→ REFACTOR（清理，不新增行为）。若发现代码是在测试之前写的，必须删掉重来——不允许以”参考”为由保留。

**Subagent 路由**：根据 Plan 规模自动分流——
- Plan ≤ 5 步且改动集中在单一模块：当前上下文直接执行
- Plan > 5 步或跨 2 个以上模块：派发独立 subagent 逐步执行，每步完成后强制走 Spec Compliance Review → Code Quality Review 两轮，顺序不可跳过

**Completion Verification Gate**：宣布 Execute 完成前，必须新鲜运行测试套件并读取完整输出，确认零失败、零报错后才能继续。禁止用”should”、”probably”、”应该能工作”来替代实际验证。

### BUGFIX / FAIL_CODE：先 debug，再重试

当 Execute 阶段遇到缺陷，或者 Review 判定为 `FAIL_CODE` 时，规则不是”直接再改一次”，而是：

1. 先运行 `debug`，在每个组件边界加诊断探针，逆向追踪数据流
2. 找到可工作的参考实现后完整阅读（不略读），列出每处差异
3. 一次只改一个变量验证一个假设，只做最小修复
4. 针对同一个 defect instance，最多重试 3 次；仍无法收敛 → 升级为人工介入，不继续盲试

这里说的是**任务进行中**的修复重试；任务已 `archive` 完成后再发现缺陷，改用 `reopen` 创建 patch Spec。

### Subagent 上下文卫生

子 agent 在 SDD-RIPER 中**不是为并行**，而是为防止主 orchestrator 上下文腐朽：把读取量大、噪声多的工作（如 debug 调查、Research 代码扫描、Review 四轴）派给一次性子 agent 吸收，主上下文只接收压缩后的结论（verdict + summary + evidence pointer）。

四个高污染阶段当前已纳入派发：

- **Debug 调查**（BUGFIX loop / FAIL_CODE 重试）— Debug Investigator subagent，返回 root cause + fix_points
- **Research 代码扫描** — Codebase Scanner / Archive History Reader / Convention Checker，返回 Findings 结论
- **Review 四轴** — 四个 Axis Investigator 各自独立，orchestrator 聚合并自下 final verdict
- **Execute 大改** — 单步实现需读 > 3 文件或 > 500 行时也走 subagent

派发约定与例外详见 `protocols/subagent-dispatch.md`。orchestrator 永远自己跑三个关键 gate：Completion Verification、Plan Approval、Final Review verdict — 这是 Trust But Verify 原则，子 agent 的成功报告不能替代亲自验证。

### Superpowers Vendoring

SDD-RIPER 把 6 个来自 [obra/superpowers](https://github.com/obra/superpowers) 的方法论 skill **物理 vendor** 到 `vendored/superpowers/` 目录，作为执行质量层的副本。承担的契约关系是：**SDD-RIPER 提供工作流契约**（阶段、门禁、审计），**superpowers 提供关键节点的执行质量**（TDD 怎么写好、debug 怎么定位根因、verification 怎么真验完、等等）。

6 个 skill 与 SDD 触点对应：

- `writing-plans` → Plan > Step Granularity Rule
- `subagent-driven-development` → Execute > Subagent Routing
- `test-driven-development` → Execute > TDD Rule
- `systematic-debugging` → Execute > BUGFIX loop
- `verification-before-completion` → Execute > Completion Verification Gate
- `finishing-a-development-branch` → Archive > Pre-Archive Git Gate

**Fallback 顺序**：编辑器若已全局加载 superpowers → 直接 invoke；否则读 `vendored/superpowers/<skill>/SKILL.md`；最后才用 `SKILL.md` 里的内联摘要。详见 `INTEGRATIONS.md`（触点索引）与 `vendored/superpowers/SYNC.md`（维护手册）。

vendored 内容遵循上游 MIT license，原 LICENSE 副本保留在 `vendored/superpowers/LICENSE`。

### Archive / Reopen：闭环，而不是失忆重开

Spec 的状态机是：

```
draft → archived
```

`Plan Approved By:` 字段有内容是进入 Execute 的门禁信号；`resume` 根据该字段和 Review 区块内容组合推导 `PHASE_HINT`。

归档前，Skill 会先运行测试套件——测试失败则停止归档。测试全部通过后，向用户呈现分支处理选项（本地 merge / 推 PR / 保留 / 丢弃），确认后才执行 `archive` 命令。

`archive` 会从源 Spec 提取关键区块内容，生成单一归档文件 `vN.M-<task>.md`，并把来源 Spec 的 `status` 改成 `archived`。

归档后发现缺陷，不应该重新 `discover` 一个新任务，而应该用：

```bash
./sdd.sh reopen <project-dir> <task-slug> --defect "缺陷描述"
```

`reopen` 会读取 archive 里的上下文，创建新的 patch Spec，并写入 `reopened-from` 与 `context-source`。如果来源任务还没有归档，`reopen` 会直接失败，并提示你改用 `resume` 继续当前任务。

## 8. CLI 命令总览

`sdd.sh` 当前调度 13 个子命令：

| 命令 | 作用 | 关键参数 / 说明 |
| :--- | :--- | :--- |
| `init` | 初始化 docs 结构和 AI 配置文件 | `<project-dir>` `--mode standard\|lite\|micro` `--force` `--docs-dir <name>` |
| `discover` | 创建新任务的首个 Spec | `<project-dir>` `--task-name` `[--requirement] [--goal] [--constraints] [--context] [--version] [--mode standard\|lite\|micro]` |
| `resume` | 恢复当前任务上下文并输出 `PHASE_HINT` | `<project-dir>` |
| `status` | 检查结构完整性和流程健康度 | `<project-dir>` |
| `archive` | 归档已完成 Spec，提取内容生成单一归档文件 | `<project-dir>` `<spec-name>` `--force` |
| `reopen` | 基于已归档任务创建 patch Spec | `<project-dir>` `<task-slug>` `--defect <text>` `[--mode standard\|lite\|micro]`（默认 micro）|
| `review-execute` | 生成 **四轴** Review Prompt | `--spec <path>` `--diff-base <rev>` |
| `create-codemap` | 生成 AI 扫描代码库并创建 / 更新 CodeMap 的 Prompt | `<project-dir>` `--module <name>` |
| `build-context-bundle` | 生成提炼 Context Bundle 的 Prompt，并输出目标路径 | `<project-dir>` `--sources <dir>` `--out <name>` `--version vN.M` |
| `debug` | 生成基于错误信息和日志的 Root Cause 分析 Prompt | `<project-dir>` `--log <file>` `--error <msg>` |
| `create-projectmap` | 生成 AI 填写 ProjectMap 的 Prompt | `<project-dir>` `--repos repo1,repo2` `--force` |
| `new-codemap` | 从模板创建空白 CodeMap 文件 | `<project-dir>` `<module-name>` `--version vN.M` `--force` |
| `new-projectmap` | 从模板创建空白 ProjectMap 文件 | `<project-dir>` `--repos repo1,repo2` `--force` |

> **参数说明**：`[]` 内的为可选参数，必填参数不带方括号。
> `discover` 只需要 `--task-name` 和 `--requirement`，其他参数可以后续补充。`--mode` 不传时沿用项目 `.sdd-config` 的默认值。

### 退出码

CLI 的统一退出码语义是：

- `0`：成功
- `1`：缺失资产 / 前置条件不满足
- `2`：引用或资源冲突（例如某些命令上的已存在文件）
- `3`：参数错误或环境错误

> 注意：不是每个命令都会用到 0/1/2/3 的全部值，但整体约定是这一套语义。

---

## 9. 几个关键命令该怎么理解

### `status` 不只是“看目录在不在”

`status` 会检查：

- docs 目录结构是否完整
- AI 配置文件是否存在
- ProjectMap frontmatter 是否完整
- CodeMap 是否缺少 `last-reason`
- Spec 的 Research / Innovate / Plan / Execute / Review 区块是否为空或仍带待确认痕迹

所以它更像“流程健康检查”，而不是简单的 `ls`。

### `review-execute` 是四轴，不是简单 diff

它会生成 4 个维度的审查上下文：

1. **Axis 0 — Invocation Integrity**：需求 / 目标 / 约束是否仍然对齐
2. **Axis 1 — Spec Plan Coverage**：Plan 步骤有没有落实；同时回溯检查每步是否有完整文件路径、具体变更描述和可验证验收条件，格式缺陷记为 LOW 级别信息项
3. **Axis 2 — Code Diff Scope**：真实代码改动是否越界
4. **Axis 3 — Execute Log Fidelity**：执行日志和真实改动是否一致（日志位于 Spec `## Execute Log` 区块）

其中 Axis 2 是 primary，另外三轴是 confirmation safety net。Axis 0/1/3 出现 FAIL 时，除了判定 verdict，还会追加上游门禁失效警告，指出是哪个阶段的门控没拦住。

### `create-codemap` 和 `new-codemap` 不一样

- `create-codemap`：输出 Prompt，让 AI 分析代码库并写入 / 更新真正的 CodeMap
- `new-codemap`：只是从模板创建一个空白文件，不做扫描

`create-projectmap` 和 `new-projectmap` 也是同样的区别。

---

## 10. docs 根目录与 `.sdd-config`

默认 docs 根目录是 `mydocs/`。`init` 会把实际目录名写入项目根下的 `.sdd-config`：

```ini
DOCS_DIR="mydocs"
```

如果你希望换目录名，可以在初始化时指定：

```bash
./sdd.sh init my-project --docs-dir docsx
```

此后 `resume`、`status`、`review-execute`、`archive`、`reopen`、`build-context-bundle`、`create-codemap`、`create-projectmap`、`new-codemap`、`new-projectmap` 等命令都会按 `.sdd-config` 解析 docs 根目录，而不是硬编码只认 `mydocs/`。

`--docs-dir` 必须是一个普通目录名，不能带路径分隔符。

---

## 11. Standard、Lite 和 Micro 怎么选

`init --mode` 支持三种模式，选择后会写入 `.sdd-config`，后续所有 `discover` / `reopen` 命令都自动使用对应模板：

- **standard**：适合新功能开发、重构、多模块变更。完整 RIPER 流程：Research（Pre-load + Requirement Review + 四项输出 + Alignment Check）→ Innovate（≥2方案）→ Plan（Coverage Gate 全量）→ Execute → Review（四轴）→ Archive（四块摘要）。
- **lite**：适合中小改动，熟悉代码库的团队。Research 包含 Requirement Review；Innovate 可 Skipped；Coverage Gate 仅检查 Invocation；Alignment Check 可省略；Archive 摘要一句话即可。
- **micro**：适合单文件 bugfix、配置调整、文案修改等极轻量任务。Research / Innovate 整体跳过，直接 Plan → Execute → Review（仅 Axis2 — Code Diff Scope）→ Archive（摘要可省）。

三种模式所有核心门禁一致：**Human Gate（Plan 审批）、Execute Log、debug-before-retry** 均不可跳过。差异只在 Spec 模板结构和流程门禁密度。

| 门禁 | standard | lite | micro |
| :--- | :---: | :---: | :---: |
| Requirement Review | ✅ | ✅ | ❌ |
| Research Pre-load | ✅ | ✅ | ❌ |
| Findings → Restatement 顺序 | ✅ | ✅ | ❌ |
| Alignment Check | ✅ | ⚠️ 可省 | ❌ |
| Innovate ≥2 方案 | ✅ | ⚠️ 可 Skipped | ❌ |
| Coverage Gate | ✅ 全量 | ⚠️ 仅 Invocation | ❌ |
| Human Gate（Plan 审批） | ✅ | ✅ | ✅ |
| Execute Log | ✅ | ✅ | ✅ |
| Review 四轴 | ✅ | ✅ | ⚠️ 仅 Axis2 |
| Subagent dispatch（上下文卫生） | ✅ | ✅ | ❌ |
| debug-before-retry | ✅ | ✅ | ✅ |
| Archive 摘要 | ✅ 四块 | ⚠️ 一句话 | ❌ 可省 |

---

## 12. Windows 使用说明

如果你在 Windows 下工作：

- **推荐**：安装 Git for Windows，直接用 Git Bash 跑 `./sdd.sh`
- **PowerShell**：使用 `sdd.ps1`

例如：

```powershell
.\sdd.ps1 init my-project
.\sdd.ps1 resume my-project
```

`sdd.ps1` 的行为不是简单转发，它会：

1. 先从 `HKLM:\SOFTWARE\GitForWindows` / `HKCU:\SOFTWARE\GitForWindows` 查 Git Bash 安装路径
2. 如果注册表没找到，再尝试 `Get-Command bash`
3. 自动把 `sdd.sh` 转成 Git Bash 可执行的 Unix 风格路径

这也是 Windows 路径下的推荐入口。

---

## 13. 初始化后目录长什么样

默认情况下，`init` 后目标项目会得到：

```text
<target-dir>/
├─ .sdd-config
├─ AGENTS.md
├─ CLAUDE.md
├─ .cursorrules
├─ .github/
│  └─ copilot-instructions.md
└─ mydocs/                 # 或 .sdd-config 指定的目录
   ├─ specs/
   ├─ codemap/
   ├─ context/
   └─ archive/
```

每个目录的职责：

- `specs/`：活跃任务 Spec（含 Execute Log 区块）
- `codemap/`：模块地图
- `context/`：上下文包
- `archive/`：归档结果（Spec 移入 + summary 子节追加）

---

## 14. FAQ

### `discover` 和 `resume` 的区别是什么？

- `discover`：开始一个新任务，创建首个 Spec
- `resume`：恢复已有任务，不创建新 Spec

### CLI 不强制 `--requirement` 等字段非空，Skill 会追问吗？

CLI 只做参数存在性校验，不强制业务字段（`--requirement` / `--goal` / `--constraints` 等）非空。空字段会在 Spec 文件里留下 `<!-- 核心目标 -->` 占位符，由 AI 在后续阶段补写。**如果走 OpenCode Skill 路径**（路径 A），Setup Mode 的 AskUserQuestion 会要求一次给齐 5 项（task name / requirement / goal / constraints / mode），少一项会重新追问而不是推断；Workflow Mode 创建新任务时同理。CLI 路径（路径 B）则允许字段分次补齐，由 orchestrator 在每轮中决定是否继续。

### 为什么归档后修缺陷不能直接再 `discover`？

因为那样会丢失归档任务的上下文链路。`reopen` 的目的就是基于已完成任务的归档材料创建 patch Spec，把修复任务挂回原来的生命周期上。

### CodeMap 是不是每个任务都要建？

不是。只有当模块复杂、调用链不清，或者这次任务改变了入口点 / 核心调用链 / 外部依赖 / 风险项时，才值得创建或更新。

### Context Bundle 什么时候需要？

当你在开始一个新任务前，手头有外部原始材料（如 UI 稿、PRD、会议记录）需要一起带入任务背景时，就该用 `build-context-bundle --sources <dir>`。

Skill 会在每次创建 Spec 前主动询问你是否有这类材料，选"有"后提供目录路径即可自动触发构建。

如果没有外部材料，直接跳过即可——AI 在 Research 阶段可以直接读取 `specs/`、`codemap/`、`archive/` 等目录，不需要先提炼成 bundle。

### 我已经全局装了 superpowers，会不会跟 vendored 副本冲突？

不会。SDD-RIPER 的 fallback 顺序是：**编辑器全局加载的 superpowers > vendored 副本 > SKILL.md 内联摘要**。如果你的编辑器已经有 `obra/superpowers` 全局可用，AI 会优先用全局版本（更新、可能含你的自定义）；只有未装时才回落到 `vendored/superpowers/` 下的 pinned 副本。两条路径都遵循同一份 SDD-RIPER 契约，行为一致。详见 `INTEGRATIONS.md`。

---

## 15. 术语解释

| 术语 | 说明 |
| :--- | :--- |
| **Spec** | 任务规格文档，包含需求、约束、研究结论、计划、执行日志、评审结论。所有参与者以 Spec 为准，不用翻聊天记录。 |
| **CodeMap** | 模块级架构地图，用 Mermaid 展示入口点、调用链、外部依赖、风险项。新项目可以跳过，复杂模块建议创建。 |
| **ProjectMap** | 多仓库协作的全局地图，定义边界、接口契约、职责分工。只有多仓库协作时才需要。 |
| **Context Bundle** | 外部材料的提炼包（如 PRD、设计稿），把原始材料压缩成结构化背景，帮助 AI 快速理解任务上下文。 |
| **Human Gate** | 人工审批门禁。Plan 阶段必须经过人工批准，AI 才能进入 Execute。这不是流程的阻碍，而是质量的保障。 |
| **Phase / PHASE_HINT** | 当前所处的工作阶段（Research/Innovate/Plan/Execute/Review/Archive）。`resume` 命令会根据 Spec 内容推断当前阶段，给出下一步建议。 |
| **Execute Log** | 执行日志，位于 Spec 的 `## Execute Log` 区块。每个步骤的执行结果都记录在此，可追溯、可审计。 |
| **四轴 Review** | 四维度质量审查：轴0=需求对齐、轴1=计划覆盖、轴2=代码边界、轴3=日志一致性。轴2是主审查，轴0/1/3是安全网。 |
| **Subagent** | 一次性的**消耗即焚**读取代理。orchestrator 把读取量大或迭代探查的工作派给子 agent，仅接收压缩后的结论（verdict + summary + evidence pointer）。子 agent 不读 Spec、不写文件，仅返回 payload。详见 `protocols/subagent-dispatch.md` 与 `INTEGRATIONS.md` 的"Subagent Dispatch Contract Boundary"小节。 |
| **上下文卫生 (Context Hygiene)** | Subagent 派发的核心设计原则：让 orchestrator 主上下文保持高信号密度，把噪声（debug 调查、Research 代码扫描、Review 四轴）下沉到子 agent。并行是副产物，不是目标。 |
| **RIPER** | Research → Innovate → Plan → Execute → Review 的首字母缩写，SDD-RIPER 的核心流程。 |
| **归档 (Archive)** | 任务完成后，将 Spec 移入 `archive/` 目录并追加摘要，保留完整上下文供后续查阅或 reopen。 |

---

## 16. 贡献

欢迎提 Issue 和 PR。提交前至少建议做两件事：

```bash
./sdd.sh status <target-dir>
bash tests/run_all.sh
```

如果你要改的是协议、模板或命令行为，优先确保 README、SKILL、模板和脚本实现保持一致。

如果你需要把 `vendored/superpowers/` 同步到 upstream 新版本，参考 `vendored/superpowers/SYNC.md` 里的 sync 流程与 license 合规要求；不要直接修改 vendored 副本里的文件（会破坏未来 sync 的字节比对）。
