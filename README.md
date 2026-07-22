# SDD-RIPER

Archive authorization rule: request explicit archive authorization from the current user when `NEXT_ACTION: request_archive_authorization` appears. Agents must not construct archive authorization parameters or infer permission from Ready, PASS, Plan Approval, Challenge, or prior authorization. A `human:<name>` record is an audit declaration, not identity authentication. 未获得当前用户明确授权时必须停止；`validate --archive-ready` 只证明完成条件满足，不授予归档许可。

SDD-RIPER 是一套把 AI 协作开发落到文件系统的工作流。它用 **Spec** 管任务目标和门禁，用 **Design** 管技术设计，用 **Execute Log** 管执行事实，用 **Learning Record** 管可复用经验，用 **CodeMap**（按需计算视图）管架构认知。

它不是模型执行器，也不是通用 agent 平台（不是 harness）。当前实现是一套 **Node CLI + 文件系统产物 + 本地观测 Console + Prompt/账本适配层**：CLI 负责创建、校验、归档和生成提示；真正的代码修改、命令执行、动态循环由人或宿主 agent 完成。Console 对项目状态是只读投影，自身从不写产物，唯一的副作用是把「打开文件」委托给本机默认程序。

核心目标不是多写文档，而是让每个任务都能被追踪、审查和归档：

- 需求不会在长对话里漂移。
- 方案选择有证据和取舍。
- Plan 不能替代技术设计。
- Execute 的真实行为可以被 Challenge 审计。
- 偏差、返工和 concern 会沉淀为后续可复用的判断规则。
- 归档后可以 reopen，而不是重新 discover 丢失上下文。

## 文档导航

SDD-RIPER 的文档按受众分层。先按下表找到适合你的入口：

| 文档 | 给谁 | 何时看 |
| :--- | :--- | :--- |
| **README**（本文） | 所有人 | 第一次接触：了解定位、快速跑起来、命令速查 |
| **[GUIDE.md](./GUIDE.md)** | 开发者 | 深入用：设计理念、RIPER 各阶段细节、两层方法论、FAQ |
| **[TEAM-GUIDE.md](./TEAM-GUIDE.md)** | TL / 团队 | 团队落地：推广节奏、角色分工、自动化与巡航、常见坑 |
| **[INTEGRATIONS.md](./INTEGRATIONS.md)** | 维护者 / agent | 集成图谱：SDD ↔ superpowers 触点映射与加载顺序 |
| **SKILL.md / `protocols/`** | AI agent | 由 agent 加载的工作流规范，人类一般不必通读 |

按角色快速定位：

- **第一次用** → 读本文「快速开始」，跑一个 micro 任务。
- **要认真用 SDD 做任务** → README 概览 + [GUIDE.md](./GUIDE.md) 细节。
- **带团队落地 / 做 TL** → [TEAM-GUIDE.md](./TEAM-GUIDE.md)。
- **扩展方法论 / 维护 vendored** → [INTEGRATIONS.md](./INTEGRATIONS.md) + `vendored/superpowers/SYNC.md`。
- **给 Codex / Claude / opencode 接入** → 跑 `sdd install-skill`，agent 自动加载 `SKILL.md`。

三份人读文档的分工：**README 是概览（是什么 + 怎么开始），GUIDE 是细节（怎么深入用），TEAM-GUIDE 是团队落地（怎么推广）**。内容若有交叠，以各自的深度层级为准。

## 快速开始

安装（需 Node.js 18+）：

```text
npm install -g https://github.com/arsterliu/sdd-riper.git
```

在 agent 里触发 Skill：`/sdd`；或直接用 CLI：

```text
sdd init my-project --mode standard
sdd discover my-project --task-name my-task --version v1.0 --requirement "我要做什么" --context none
sdd resume my-project
```

创建 Spec 前，agent 必须先让用户输入或确认 `version` 与 `task-name`，并询问是否有参考资料 / context；不能静默推导这些核心字段后直接执行 `discover`。

`discover` 会创建一组任务产物：

- `mydocs/specs/v1.0-my-task.md`
- `mydocs/design/v1.0-my-task.design.md`，micro 模式不创建
- `mydocs/logs/v1.0-my-task.execute.md`

Spec 的 frontmatter 会写入 `design-file`、`execute-log-file` 和 `learning-file`，后续命令都从这些引用读取独立产物。

`version` 表示一次迭代 / 交付批次，支持 `vN.M` 与 `vN.M.P`（如 `v1.0`、`v1.3.6`）。同一个 `version` 下可以有多个并行 Spec，但 `task-name` 必须唯一；唯一键是 `version + task-name`。

阶段产物的模板结构保持英文，包括 Spec 阶段标题、Design 字段、Execute Log 字段、Learning Record 字段、frontmatter 键、文件引用键、命令名、状态枚举、验证枚举和 `AC-###` 编号。实际填充的需求分析、方案取舍、设计说明、计划步骤、执行说明、证据和经验规则使用中文。

## 安装（完整说明）

统一从 GitHub 安装 CLI：

```text
npm install -g https://github.com/arsterliu/sdd-riper.git
```

需要 Node.js 18+。安装后检查：

```text
sdd --version
where sdd
```

使用 `git+https` 是为了避免某些 Git 配置把 GitHub HTTPS 地址重写成 SSH，导致没有 SSH key 的环境安装失败。

## 注册 Skill

CLI 和 Skill 是两层：

```text
npm global 目录      -> sdd 命令
Codex/Claude skills -> SKILL.md、templates、protocols、src 等配套文件
```

安装 CLI 后，用当前已安装的 `sdd` 命令把完整 Skill 内容注册到 agent 环境：

```text
sdd install-skill --target codex
```

可选目标：

```text
sdd install-skill --target codex
sdd install-skill --target cc-switch
sdd install-skill --target claude
sdd install-skill --target opencode
sdd install-skill --target all
```

如果是升级或大版本变更，建议清理旧 Skill 目录，避免已删除文件残留：

```text
sdd install-skill --target codex --clean
```

可在不修改安装目录的前提下检查同版本内容漂移：

```text
sdd install-skill --target codex --check
```

检查一致或重新安装后，重启 Codex / Claude / OpenCode 会话，以及正在运行的 `sdd console`。

## 更新

日常更新：

```text
npm install -g https://github.com/arsterliu/sdd-riper.git
sdd install-skill --target codex --clean
```

多 agent 环境：

```text
npm install -g https://github.com/arsterliu/sdd-riper.git
sdd install-skill --target all --clean
```

通常不需要先 `npm uninstall -g sdd-riper`。只有在 `where sdd` 指向旧路径、命令 shim 异常、安装来源变化或更新后仍是旧行为时，才做干净重装：

```text
npm uninstall -g sdd-riper
npm install -g https://github.com/arsterliu/sdd-riper.git
sdd install-skill --target codex --clean
```

## 核心产物

| 产物 | 责任 |
| :--- | :--- |
| **Spec** | 控制面。保存 Intake、Research、Innovate、Acceptance Criteria、Plan、审批、Completion Verification / Challenge verdict，并引用 Design / Execute Log / Learning。 |
| **Design** | 技术设计产物。standard 写 `Technical Design`，lite 写 `Design Note`，micro 不单独写设计。 |
| **Execute Log** | 执行事实产物。每个 Plan step 的结果、偏差、验证结果都追加到这里。 |
| **Learning Record** | 经验沉淀产物。把偏差、BUGFIX、concern、reopen 暴露出的规律写成可复用决策规则。 |
| **CodeMap** | 按需架构视图（`sdd codemap`），扫描源码实时输出，不持久化、永不过时。架构变更应记录到 Learning Record。 |
| **Cruise Run** | 巡航可观测账本。记录 `sdd cruise --record-run` 时的 iteration、driver、next action、verdict 和停止原因，不替代 Spec / Design / Execute Log。 |

## 流程

```text
Research -> Innovate -> Design/Acceptance -> Plan -> Execute* -> Challenge -> (Cruise) -> Learning Check -> Archive
```

## 流程架构

```
┌─────────────────────────────────────────────────┐
│ 控制面（Spec）                                   │
│  目标、Research、Innovate、Acceptance、Plan、    │
│  门禁、Challenge 裁决、产物引用                      │
│  design-file / execute-log-file / learning-file  │
└──────────────┬──────────────────────────────────┘
               │ 引用
┌──────────────▼──────────────────────────────────┐
│ 产出面（独立产物）                               │
│  Design / Execute Log / Learning Record          │
│  Cruise Run Ledger / Archive                     │
└──────────────▲──────────────────────────────────┘
               │ 读/写/验证
┌──────────────┴──────────────────────────────────┐
│ 调度面（CLI + Host Agent）                       │
│  探测：status / next / resume                    │
│  生成：debug / review-execute / challenge / cruise│
│  操作：init / discover / validate / archive      │
│  视图：codemap / learnings / doctor / console    │
│  执行：Agent 按 prompt 修改代码和产物             │
└─────────────────────────────────────────────────┘
```

- **Research**：澄清需求、约束、事实和不确定性，形成 Confirmed Requirement（5 个结构化要素：Scope Boundary / Irreversibility / Impact Radius / Dependencies & Constraints / Acceptance Intent）。Research Gate（Research Reviewed By / Research Reviewed At）确保产出经独立审查。Findings 应包含项目编码惯例（eslint/tsconfig 等），确保后续不违背项目规范。
- **Innovate**：至少比较两个方案；lite 可跳过，但必须写明 Reason。
- **Design/Acceptance**：standard/lite 在独立 Design 文件写设计，验收标准仍留在 Spec；micro 把 `Acceptance` / `Verification` 写入 Plan。
- **Plan**：从 Design 和 Acceptance Criteria 拆成原子步骤，必须满足配置门禁。
- **Execute**：严格按 Plan 执行，偏差写入独立 Execute Log。最后一步是 Completion Verification（四轴自查 + AC Coverage 汇总）。
- **Challenge**：Execute Completion Verification 完成后自动进入。独立对抗评审，主动寻找目标偏离、设计遗漏、验收不可验证和实现越界。standard/lite 必须派子 agent 执行；micro 可内联但必须角色分离。

每个阶段内的活动按三类分工：**KEEP**（orchestrator 必须做，如门禁决策）、**MUST_DELEGATE**（必须委托独立角色，如对抗评审）、**DELEGATABLE**（灵活可选，如代码实现）。详见 [GUIDE.md](./GUIDE.md) 第五节。
- **Cruise**：Challenge 返回 `FAIL_*` 后进入。Cruise orchestrator 只负责路由与迭代边界；main agent 重入 `BACKTRACK_TARGET`，遵守目标阶段门禁和写入边界完成修复；Challenge reviewer 始终保持 read-only。每轮完成后再 validate 和 challenge，直到通过或达到迭代上限。
- **Learning Check**：当执行偏差、BUGFIX、PASS_WITH_CONCERNS 或 reopen 暴露可复用经验时，创建 Learning Record。
- **Archive Authorization**：`validate --archive-ready` 通过后进入 `request_archive_authorization`，必须暂停并取得当前用户明确授权；随后 archive 才会把 Spec、Design、Execute Log，以及已绑定的 Learning Record 一起归档。

Acceptance Criteria 使用 `AC-###` 编号，并必须声明 `Verification: unit | integration | e2e | manual`。BDD / Gherkin 的场景描述用中文表达可观察行为；E2E AC 必须提供 `Test:` 或 `Manual Evidence:`，manual AC 必须提供 `Manual Evidence:`。

Design 按模式分层约束：

- `standard` 的 `Technical Design` 是技术设计合同，归档门禁强制检查 `Requirement Traceability`、`Impact Scope`、`Architecture View`、`Data Model / Schema`、`Interface Contract`、`Compatibility / Rollback` 和 `Test Strategy` 等核心字段。
- `lite` 的 `Design Note` 保持轻量，但必须说明 `Impact Scope` 和 `Interface / Data Impact`。
- `micro` 不创建独立 Design，但 Plan 必须包含 `Impact Scope`、`Data Impact`、`Interface Impact`、`Acceptance` 和 `Verification`。

设计方法论按 `mode` + 风险路由：`sdd next` / `cruise` / `challenge` 会输出 `DESIGN_METHOD` / `DESIGN_FOCUS_FIELDS` 作为 advisory 建议，背后是「执行质量层（vendored superpowers）+ 设计方法层（DDD/C4/ADR/arc42）」两层方法论。细节见 [GUIDE.md](./GUIDE.md) 第六节与 [INTEGRATIONS.md](./INTEGRATIONS.md)。

## 默认治理策略

SDD 采用“约定大于配置”：新项目只需要少量配置，任务复杂度由每个 Spec 的 `mode` 表达，Plan 审批由 `APPROVAL_POLICY` 表达，Research / Challenge 的独立审查由 reviewer evidence 表达。

### Mode（工作流形状）

| 模式 | 适用场景 | Design | Execute Log | Subagent |
| :--- | :--- | :--- | :--- | :--- |
| `standard` | 新功能、重构、多模块、风险较高任务 | 独立 Technical Design | 独立文件，必填 | 推荐作为 evidence / work-package owner |
| `lite` | 中小改动、上下文明确任务 | 独立 Design Note | 独立文件，必填 | 可选 |
| `micro` | 单文件 bugfix、文案、低风险配置 | 不单独创建，写入 Plan | 独立文件，必填 | 默认不用 |

### APPROVAL_POLICY（只控制 Plan Gate）

| 策略 | 谁批 Plan | 核心规则 | 适用场景 |
| :--- | :--- | :--- | :--- |
| `agent` | Agent（附证据） | `Plan Approved By: agent:<id>`，必须提供 `Approved At:` 和 `Gate Evidence:` | 默认策略 |
| `human` | `human:<name>` | 必须使用 `Plan Approved By: human:<name>`，拒绝 agent / 裸签名 | 核心模块、高风险、不可逆 |

新项目默认 `.sdd-config`：

```text
DOCS_DIR="mydocs"
APPROVAL_POLICY="agent"
CRUISE_MAX_ITERATIONS="5"
```

任务模式由 `discover --mode` 明确选择，未指定时默认 `micro`。

Research Gate 和 Challenge 不由 `APPROVAL_POLICY` 批准。standard/lite 必须记录可审计独立 reviewer：`subagent:<id>`、`external-agent:<id>` 或 `human:<name>`。micro Challenge 可用 `inline`。If using a subagent, external-agent, review bot, or any other automated reviewer tool that requires authorization, pause and request explicit user authorization before proceeding; never skip the gate or fabricate reviewer evidence.

组合策略：

- **Design / Execute Log 独立产物化是强制策略**。
- **Subagent 不是所有关键环节的 decision owner**；它只做 evidence owner、work-package owner、review axis owner。
- **Orchestrator 永远负责最终目标、门禁、裁决和归档一致性**。

### Cruise 策略

- Cruise 默认开启。设置 `CRUISE_ENABLED=false` 可禁用巡航 prompt 和 run ledger。
- 是否复用宿主原生 loop 由 `--driver` 和宿主能力决定。
- `sdd challenge` 的 `FAIL_*` verdict 会阻止归档，并由 `sdd cruise` 映射回对应阶段修复。
- `sdd cruise --driver claude-code --emit-claude-prompt` 会输出包含 `ultracode:` 和 `/effort ultracode` 提示的 Claude Code workflow 启动 prompt。
- `sdd cruise --record-run` 会追加 `<docs-root>/runs/<spec>.cruise.jsonl`，记录 iteration、driver、next action、challenge verdict 和停止原因。
- SDD 不持有模型执行循环；`Spec / Design / Plan / Execute Log / Learning` 仍是真相源。

## 常用命令

| 命令 | 作用 |
| :--- | :--- |
| `sdd init <dir>` | 初始化项目结构。 |
| `sdd discover <dir> --task-name <name> --version <vN.M\|vN.M.P> --requirement <text> [--context <source\|none>]` | 创建 Spec、Design、Execute Log；创建前 version/task-name/context 必须由用户输入或确认。 |
| `sdd new-learning <dir> [spec-name]` | 创建并绑定 Learning Record。 |
| `sdd resume <dir>` | 恢复当前任务上下文。 |
| `sdd status <dir>` | 检查结构和流程健康度。 |
| `sdd next <dir>` | 输出当前 workflow 状态、下一步和回跳目标。 |
| `sdd challenge <dir>` | 生成独立对抗评审 prompt。 |
| `sdd cruise <dir> [--driver ...] [--emit-claude-prompt] [--record-run] [--iteration N]` | 生成巡航控制 prompt；可输出 Claude ultracode/workflow 启动提示并写入 run ledger，但不直接调用模型或执行循环。 |
| `sdd console [dir]` | 启动本地 Web Console，可选择项目目录，查看每个 Spec 的阶段、状态、产物健康度和归档门禁。 |
| `sdd install-skill --target codex\|cc-switch\|claude\|opencode\|all [--clean] [--check]` | 安装 Skill，或用 `--check` 只读检查已安装内容是否漂移。 |
| `sdd validate <dir> --archive-ready` | 校验归档完成条件；不授予归档许可。 |
| `sdd review-execute <dir>` | 生成四轴 Review Prompt。 |
| `sdd archive <dir> <spec-name> --authorized-by "human:<name>" --authorization-evidence "<text>"` | 携带当前用户一次性明确授权，归档完成任务及引用产物。 |
| `sdd reopen <dir> <slug> --defect <text>` | 基于归档任务创建修复 Spec。 |

## Web Console

```text
sdd console [project-dir]
```

Console 用于观测和诊断，不替代 agent 执行 SDD。它对 Spec 状态是只读的，自身从不修改产物；唯一的副作用是 `Edit` 会委托本机默认程序打开对应文件，后续编辑由该程序而非 Console 完成。它支持：

- 页面里选择项目目录。
- 多项目看板预览。
- 查看 Spec 阶段、状态、产物和归档门禁。
- 查看最新 cruise run 的 iteration、driver 和停止原因。
- 每个产物按 `Spec / Design / Execute Log / Learning` 独立 Preview。
- Preview 新开浏览器 tab，只读显示 Markdown 原文。
- Preview 页提供 `Edit`，用本机默认程序打开对应文件。

## 目录结构

```text
<project>/
├── .sdd-config
├── AGENTS.md / CLAUDE.md
└── mydocs/
    ├── specs/       # 活跃 Spec
    ├── design/      # Technical Design / Design Note
    ├── logs/        # Execute Log
    ├── learnings/   # Learning Record
    ├── runs/        # Cruise run ledger
    ├── context/     # 原始材料（按任务名子目录组织）
    └── archive/     # 已归档 Spec / Design / Execute Log / Learning
```

---

需要更深入的内容：

- 流程与各阶段细节、设计理念、两层方法论、FAQ → [GUIDE.md](./GUIDE.md)
- 团队落地、角色分工、巡航与自动化 → [TEAM-GUIDE.md](./TEAM-GUIDE.md)
- SDD ↔ superpowers 集成图谱 → [INTEGRATIONS.md](./INTEGRATIONS.md)
## Project Engineering Profile v3.4

SDD 可以把已有项目的静态工程事实保存为可审计的 Project Engineering Profile。它描述 workspace units、前端/后端/契约等 roles、manifest、框架证据、工程命令引用和单元关系，但不会生成业务工程、安装依赖、执行 `commandRefs` 或自动初始化 Verification Provider。

推荐流程：

```text
sdd init <dir>
sdd profile detect <dir> --format json > candidate.json
sdd profile review <dir> --candidate candidate.json --format json
sdd profile confirm <dir> --candidate candidate.json --expected-digest <reviewed-digest> --confirmed-by "human:<name>" --confirmation-evidence "<当前用户对该摘要的明确授权>"
sdd discover <dir> --task-name <name> --version <vN.M> --unit web api ...
sdd profile check <dir>
```

`detect`、`review`、`show`、`check` 都是只读操作。候选文件可以人工修正，但应为人工分类补充 `confidence: human` 的 evidence；`confirm` 是唯一写入口，必须绑定 review 输出的精确 digest 和当前用户明确授权。`confirmed-by` 只是审计声明，不是身份认证，Agent 不得自行构造。

确认后的事实写入 `<docs-root>/profiles/revisions/sha256-<digest>.json`，随后原子更新 `profiles/current.json`。新 Spec 固定 `project-profile-revision`、`project-profile-digest` 和 `affected-units`，后续 current 变化不会重解释历史任务。`check` 只报告 clean/drifted/missing/invalid，不自动覆盖。

并发 confirm 使用项目根 `.sdd-project-profile.lock` 单锁：锁存在时立即失败，不等待或重试。持续锁定时，先确认没有运行中的 confirm，再人工删除空锁目录；禁止按时间自动清理。若收到 `SDD_PROFILE_CONFIRM_UNLOCK_FAILED`，配置可能已写成功，应先检查 current/revision。

空白项目不会产生虚构 Profile：`profile detect` 返回 `PROFILE_STATE: empty` 和 bootstrap Spec 引导。v3.4 不包含框架选型、应用生成、领域质量 Profile 或 Console UI。

## Verification Adapter v3.0

E2E Acceptance 通过 `Provider:` 引用项目级具名配置，使用 `sdd verify init` 显式创建，并用 `sdd verify run --spec <spec>` 生成不可变 Verification Run。首版只注册具备正式 gate 能力的 `playwright-test` Adapter；Core 不依赖或自动安装 Playwright。

Playwright 必须能从指定 workspace/packageRoot 解析、由祖先 workspace manifest 直接声明并受唯一 lockfile 管理。支持 npm/pnpm/Yarn node_modules workspace/hoist；不支持全局包、临时 npx、纯传递依赖或 Yarn PnP。缺包或浏览器时明确阻断，不自动降级。`playwright-mcp`、Custom Adapter、统一 MCP Profile 与 visual/a11y/performance runner 均为延期能力。
