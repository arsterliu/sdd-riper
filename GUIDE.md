# SDD-RIPER 使用指南

这份指南是 README 的补充，覆盖工作流深入、CLI 命令全集、模式选择和常见问题。如果你刚接触，先看 README 的"30 秒上手"。

---

## RIPER 工作流深入

### 五个阶段做什么

**Research（研究）** — 搞清楚要做什么，不是猜。

Skill 加载后，AI 会按以下顺序执行：
1. 读取 `.sdd-config`，确定 docs 目录和模式
2. 检查 `codemap/_project.md` 是否存在：有就加载项目背景，没有就自动扫描技术栈和约定并创建
3. **Requirement Review**：跟你逐条确认需求理解是否正确，发现歧义或缺口主动追问
4. 读代码、查依赖、看历史 Spec，填写 Findings / Open Questions / Assumptions
5. 整合产出 **Confirmed Requirement**（研究校准版，不再是原始一句话需求）
6. **Mode Recommendation Gate**（micro 模式跳过）：用 5 个维度（Scope / Architecture impact / Cross-cutting / Test surface / Uncertainty）打分，推荐 micro / lite / standard，让你确认

**Innovate（方案）** — 列出 ≥2 个方案，对比优劣，等你选择（lite 模式下可跳过）。

**Plan（计划）** — 把方案拆成原子步骤。每步必须包含：完整文件路径 + 具体变更描述 + 可验证的验收条件。粒度控制在 2-5 分钟一步。

**这是唯一需要你明确操作的环节**：Plan 写好后，AI 会等你审批。你需要在 Spec 里填写 `Plan Approved By:` 和 `Approved At:`，AI 才能进入 Execute。

**Execute（执行）** — 按 Plan 严格执行，每条偏差记入 Execute Log。

有两条硬规则：
- **TDD**：写生产代码前必须先有失败测试。顺序是 RED（写失败测试）→ GREEN（写最少代码通过）→ REFACTOR（清理）
- **Subagent 路由**：Plan ≤ 5 步且单模块 → 当前上下文直接执行。Plan > 5 步或跨 2+ 模块 → 派发独立 subagent 执行，每步完成后强制走两轮审查（Spec Compliance + Code Quality）

**Review（审查）** — 四轴审计，不是简单 diff：

| 轴 | 检查内容 |
| :--- | :--- |
| Axis 0 — Invocation | 需求、目标、约束是否仍然对齐 |
| Axis 1 — Plan Coverage | Plan 步骤有没有落实 |
| Axis 2 — Code Diff | 代码改动是否越界（主审查） |
| Axis 3 — Execute Log | 日志和真实改动是否一致 |

Axis 2 是 primary，另外三轴是安全网。

### 遇到失败怎么办

不是"直接再改一次"，而是：

1. 先跑 `sdd debug`，在组件边界加诊断探针，逆向追踪数据流
2. 找到参考实现后完整阅读，列出每处差异
3. 一次只改一个变量验证一个假设，做最小修复
4. 同一个缺陷最多重试 3 次，仍无法收敛 → 升级人工介入

### Archive / Reopen：闭环管理

任务完成后用 `sdd archive` 归档。Spec 从 `specs/` 移入 `archive/`，并提取关键内容生成归档文件。

归档后发现缺陷，不要重新 `discover`，用 `sdd reopen`：

```bash
npx sdd-riper reopen <project-dir> <task-slug> --defect "缺陷描述"
```

`reopen` 会读取归档上下文，创建新的 patch Spec，把修复任务挂回原来的生命周期上。如果来源任务还没归档，`reopen` 会失败并提示你改用 `resume`。

### Subagent：不是为并行，是为保持主上下文干净

orchestrator 的上下文窗口是有限的。把读取量大、噪声多的工作派给一次性子 agent，主上下文只接收压缩后的结论。

四个高污染场景已纳入派发：
- **Debug 调查** — 返回 root cause + fix points
- **Research 代码扫描** — 返回 Findings 结论
- **Review 四轴** — 四个 Axis 各自独立调查
- **Execute 大改** — 单步需读 > 3 文件或 > 500 行时派发

orchestrator 永远自己跑三个关键 gate：Completion Verification、Plan Approval、Final Review verdict——子 agent 的成功报告不能替代亲自验证。详见 `protocols/subagent-dispatch.md`。

### Superpowers Vendoring

SDD-RIPER 把 6 个来自 [obra/superpowers](https://github.com/obra/superpowers) 的方法论 skill 物理 vendor 到 `vendored/superpowers/` 目录：

| Skill | 触点 |
| :--- | :--- |
| `writing-plans` | Plan → 步骤粒度规则 |
| `subagent-driven-development` | Execute → Subagent 路由 |
| `test-driven-development` | Execute → TDD 规则 |
| `systematic-debugging` | Execute → BUGFIX 循环 |
| `verification-before-completion` | Execute → 完成验证门禁 |
| `finishing-a-development-branch` | Archive → 归档前 Git 门禁 |

Fallback 顺序：编辑器全局 superpowers > vendored 副本 > SKILL.md 内联摘要。详见 `INTEGRATIONS.md`。

---

## CLI 命令全集

所有命令通过 `npx sdd-riper` 或 `sdd` 调用。

| 命令 | 作用 | 主要参数 |
| :--- | :--- | :--- |
| `init` | 初始化项目结构 | `<dir>` `--mode standard\|lite\|micro` `--docs-dir <name>` `--force` |
| `discover` | 创建新任务 Spec | `<dir>` `--task-name <name>` `--requirement <text>` `[--goal] [--constraints] [--context] [--version] [--mode]` |
| `resume` | 恢复任务上下文 | `<dir>` |
| `status` | 流程健康检查 | `<dir>` |
| `archive` | 归档已完成 Spec | `<dir>` `<spec-name>` `--force` |
| `reopen` | 基于归档创建修复 Spec | `<dir>` `<slug>` `--defect <text>` `[--mode]`（默认 micro） |
| `review-execute` | 生成四轴 Review Prompt | `--spec <path>` `--diff-base <rev>` |
| `create-codemap` | 生成 AI 创建/更新 CodeMap 的 Prompt | `<dir>` `--module <name>` |
| `new-codemap` | 从模板创建空白 CodeMap | `<dir>` `<module-name>` `--force` |
| `create-projectmap` | 生成 AI 填写 ProjectMap 的 Prompt | `<dir>` `--repos repo1,repo2` `--force` |
| `new-projectmap` | 从模板创建空白 ProjectMap | `<dir>` `--repos repo1,repo2` `--force` |
| `build-context-bundle` | 生成提炼上下文包的 Prompt | `<dir>` `--sources <dir>` `--out <name>` `--version vN.M` |
| `debug` | 生成根因分析 Prompt | `<dir>` `--log <file>` `--error <msg>` |

- `[]` 内为可选参数，不带方括号为必填
- `discover` 只需要 `--task-name` 和 `--requirement`，其他可后续补充
- `--mode` 不传时沿用 `.sdd-config` 的默认值

### 退出码

统一语义：

| 码 | 含义 |
| :--- | :--- |
| 0 | 成功 |
| 1 | 缺失资产或前置条件不满足 |
| 2 | 资源冲突（如文件已存在） |
| 3 | 参数错误或环境错误 |

### 几个易混淆的命令

**`create-codemap` vs `new-codemap`**
- `create-codemap`：输出 Prompt，让 AI 分析代码库并填写 CodeMap
- `new-codemap`：从模板创建一个空白 CodeMap 文件，不做扫描

`create-projectmap` 和 `new-projectmap` 同理。

**`discover` vs `resume`**
- `discover`：开始新任务，创建首个 Spec
- `resume`：恢复已有任务，不创建新 Spec

**`status` 不只是看目录在不在**

它会检查：docs 结构完整性、AI 配置文件、ProjectMap frontmatter 完整性、CodeMap 是否缺 `last-reason`、Spec 各区块是否为空或仍带待确认标记。它是一个流程健康检查，不是 `ls`。

**`resume` 输出什么**

```
DOCS_DIR          — docs 目录名
ACTIVE_SPECS      — 活跃 Spec 列表
LATEST_SPEC       — 最新 Spec
SPEC_STATUS       — 当前状态
HAS_CODEMAP       — 是否有 CodeMap
CODEMAP_MODULES   — CodeMap 模块列表（有的话）
HAS_PROJECTMAP    — 是否有 ProjectMap
PHASE_HINT        — AI 应该进入哪个阶段
SECTIONS_HINT     — 本次需要读的 Spec 区块
```

`PHASE_HINT` 的推断逻辑：

| Spec 状态 | PHASE_HINT |
| :--- | :--- |
| 无活跃 Spec | new_task |
| Plan 已批准，Review 有结论 | archive |
| Plan 已批准，Review 无结论 | execute |
| Plan 未批准 | research_or_plan |

---

## 三种模式

`init --mode` 支持三种模式，会写入 `.sdd-config`，后续所有任务默认使用。

### standard（完整流程）

适合新功能、重构、多模块变更。

完整 RIPER，所有门禁全开：Research Pre-load → Requirement Review → Findings → Confirmed Requirement → Alignment Check → Innovate ≥2 方案 → Plan（Coverage Gate 全量）→ Execute → Review 四轴 → Archive 四块摘要。

### lite（精简流程）

适合中小改动，熟悉代码库的团队。

Research 包含 Requirement Review，Innovate 可跳过，Coverage Gate 只检查 Invocation，Alignment Check 可选，Archive 摘要一句话即可。

### micro（极简流程）

适合单文件 bugfix、配置调整、文案修改。

Research / Innovate 整体跳过，直接 Plan → Execute → Review（仅 Axis 2）。

### 门禁对比

三种模式的核心门禁（Human Gate、Execute Log、debug-before-retry）都不可跳过。差异只在流程深度：

| 门禁 | standard | lite | micro |
| :--- | :---: | :---: | :---: |
| Requirement Review | ✓ | ✓ | ✗ |
| Research Pre-load | ✓ | ✓ | ✗ |
| Findings → Confirmed Requirement | ✓ | ✓ | ✗ |
| Alignment Check | ✓ | 可选 | ✗ |
| Innovate ≥2 方案 | ✓ | 可选 | ✗ |
| Coverage Gate | 全量 | 仅 Invocation | ✗ |
| Human Gate（Plan 审批） | ✓ | ✓ | ✓ |
| Execute Log | ✓ | ✓ | ✓ |
| Review 四轴 | ✓ | ✓ | 仅 Axis 2 |
| Subagent dispatch | ✓ | ✓ | ✗ |
| debug-before-retry | ✓ | ✓ | ✓ |
| Archive 摘要 | 四块 | 一句话 | 可省 |

---

## 配置与目录

### `.sdd-config`

`init` 会在项目根创建 `.sdd-config`，内容如：

```ini
DOCS_DIR="mydocs"
```

如需自定义 docs 目录名：

```bash
npx sdd-riper init my-project --docs-dir docsx
```

此后所有命令都会按 `.sdd-config` 解析 docs 根目录。`--docs-dir` 必须是普通目录名，不能带路径分隔符。

### 初始化后的目录结构

```text
<project>/
├─ .sdd-config
├─ AGENTS.md
├─ CLAUDE.md
├─ .cursorrules
├─ .github/
│  └─ copilot-instructions.md
└─ mydocs/
   ├─ specs/        # 活跃任务 Spec
   ├─ codemap/      # 模块架构地图
   ├─ context/      # 上下文包（Context Bundle）
   └─ archive/      # 已归档任务 + index.md
```

`archive/index.md` 由 `archive` 命令自动维护，每行一条归档记录（file / date / task / verdict）。AI 查历史上下文时先读 index，再按需打开具体文件。

---

## Windows 使用

推荐安装 [Git for Windows](https://git-scm.com/download/win)，用 Git Bash 运行所有命令。

`npx sdd-riper` 在 Windows 下的行为不是简单转发——它会自动查找 Git Bash 安装路径（先查注册表，再查 `bash` 命令），将命令转为 Git Bash 可执行的 Unix 风格路径。

如果在 PowerShell 中运行 `.ps1` 报权限错误，先执行：

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

---

## CodeMap / ProjectMap 治理规则

CodeMap 是模块级活文档，不是任务级产物。按模块维护，跨任务复用。

- **按需创建**：模块复杂、调用链不清晰时才建。不要每个任务都建一份
- **先复用，再判断**：进入 Research / Plan 前先加载已有 CodeMap，确认是否仍然准确
- **只在架构事实变化时更新**：入口点增删、模块边界变化、调用链结构改变、依赖变化、风险项出现或消失——这些情况才回写。内部实现细节变化不需要更新
- **任务收尾时做反向同步检查**：Review 完成前，判断本次任务是否改变了架构事实，是则更新 CodeMap 并记录 `updated-at` 和 `last-reason`

ProjectMap 同理，但维护频率更低——只在仓库边界、接口契约或职责分工变化时更新。

---

## FAQ

### discover 的 --requirement 可以为空吗？

CLI 不做非空校验。空字段会在 Spec 里留占位符，由 AI 在后续阶段补写。但如果走 Skill 路径（`/sdd`），AI 会主动追问直到你给齐关键信息。

### 为什么修复已归档任务不能用 discover？

因为会丢失归档任务的上下文链路。`reopen` 基于归档材料创建 patch Spec，把修复挂回原来的生命周期上。

### Context Bundle 什么时候需要？

手头有外部原始材料（UI 稿、PRD、会议记录）需要带入任务时，用 `build-context-bundle --sources <dir>`。没有外部材料直接跳过——AI 在 Research 阶段可以直接读 `specs/`、`codemap/`、`archive/` 等目录。

### 全局装了 superpowers 会不会跟 vendored 冲突？

不会。SDD-RIPER 优先用编辑器全局加载的 superpowers（更新、可能含自定义），只有未装时才回落 vendored 副本。两条路径遵循同一份契约。详见 `INTEGRATIONS.md`。

### init 的 --mode 和 discover 的 --mode 有什么区别？

`init --mode` 是项目默认值，写入 `.sdd-config`。`discover --mode` 只是对当前任务的**初始建议**——真正的 mode 由 Mode Recommendation Gate 在 Research 结束后根据 Confirmed Requirement 的实际复杂度决定，你会收到推荐并确认。

---

## 术语表

| 术语 | 说明 |
| :--- | :--- |
| **Spec** | 任务规格文档，包含需求、约束、研究、计划、执行日志、评审结论。所有参与者以 Spec 为准，不用翻聊天记录 |
| **CodeMap** | 模块级架构地图，覆盖入口点、模块边界、关键组件、调用链、依赖、风险。模块级活文档，跨任务复用 |
| **ProjectMap** | 多仓库协作的全局地图，定义边界、接口契约、职责分工 |
| **Context Bundle** | 外部材料的提炼包（PRD、设计稿等），压缩成结构化背景供 AI 快速理解 |
| **Human Gate** | 人工审批门禁。Plan 必须经人工批准才能进入 Execute |
| **PHASE_HINT** | `resume` 输出的阶段建议，告诉 AI 当前该进入哪个阶段 |
| **Execute Log** | 位于 Spec 中的执行日志区块，记录每一步的执行结果 |
| **四轴 Review** | 四个维度的质量审查：需求对齐、计划覆盖、代码边界、日志一致性 |
| **Subagent** | 一次性读取代理，吸收高噪声工作，只向 orchestrator 返回压缩结论 |
| **上下文卫生** | subagent 派发的设计原则：让主上下文保持高信号密度 |
| **RIPER** | Research → Innovate → Plan → Execute → Review |
| **归档 (Archive)** | 任务完成后将 Spec 移入 `archive/`，保留完整上下文供后续查阅或 reopen |
