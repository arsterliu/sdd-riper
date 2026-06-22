# SDD-RIPER 使用指南

这份指南补充 README，说明流程细节、三种模式、产物边界、subagent 策略和验收标准写法。

## 一、产物边界

当前版本采用 **Spec 控制面 + 独立 Design + 独立 Execute Log**。

| 产物 | 存放位置 | 职责 |
| :--- | :--- | :--- |
| Spec | `<docs-root>/specs/` | 需求、Research、Innovate、Acceptance Criteria、Plan、审批、Review verdict，以及 `design-file` / `execute-log-file` 引用。 |
| Design | `<docs-root>/design/` | standard 的 `Technical Design` 或 lite 的 `Design Note`。micro 不创建独立 Design。 |
| Execute Log | `<docs-root>/logs/` | 执行步骤、偏差、验证结果，append-only。 |
| CodeMap | `<docs-root>/codemap/` | 模块级架构事实。 |
| ProjectMap | `<docs-root>/projectmap.md` | 多仓、多团队或跨系统契约。 |

Spec 是控制面，不再承载完整技术设计和执行日志。这样 Review 和 Archive 可以分别审查规范、设计和执行事实。

## 二、RIPER 流程

```text
Research -> Innovate -> Design/Acceptance -> Plan -> Execute -> Review -> Archive
```

### Research

目标是把“原始要求”变成可执行的 Confirmed Requirement。应产出：

- Requirement Review：歧义、隐含假设、风险、外部依赖。
- Findings：从代码、文档、历史 Spec、CodeMap 得到的事实。
- Open Questions：必须澄清的问题。
- Assumptions：暂时接受但需要追踪的假设。
- Confirmed Requirement：校准后的需求边界。

### Innovate

目标是定义方案，而不是写一句“使用现有实现”。standard 至少比较两个方案：

- 方案描述。
- 优点、缺点。
- 技术风险。
- 与需求的匹配度。
- 被拒绝方案的原因。
- 选中方案。

lite 可以跳过 Innovate，但必须写 `Innovate: Skipped, Reason: ...`。

### Design / Acceptance

Design 在 Innovate 之后、Plan 之前完成。

standard 写独立 `Technical Design`，至少覆盖：

- Selected Option / ADR。
- Requirement Traceability。
- Context / Boundary。
- Architecture View，必要时用 C4。
- Interface Contract。
- Data / State。
- Failure Modes。
- Security / Permission。
- Observability。
- Test Strategy。
- Risks / Trade-offs。

lite 写独立 `Design Note`，至少覆盖：

- Approach。
- Impact Scope。
- Compatibility。
- Risks。
- Test Strategy。

micro 不写独立 Design，但 Plan 必须有：

- Scope。
- Touched Files。
- Change。
- Acceptance。
- Verification。
- Blast Radius。

Acceptance Criteria 留在 Spec。推荐使用 AC 编号和 BDD 场景：

```gherkin
### AC-001: 用户可以用正确凭证登录
Requirement: login
Type: functional
Automated: yes
Test: tests/auth/login.test.ts

Scenario: Valid login
  Given a registered user
  When the user submits a valid email and password
  Then the system creates an authenticated session
```

好的验收标准必须可观察、可验证、可追踪到需求，不应写成“代码实现完成”。

### Plan

Plan 是执行契约，不是技术设计的替代品。Plan 必须从 Design 和 Acceptance Criteria 推导出来，每步包含：

- 文件路径。
- 具体改动。
- 对应 AC 或验收条件。
- 验证方式。

进入 Execute 前必须填写：

```text
Plan Approved By: <user>
Approved At: <timestamp>
```

### Execute

Execute 只做 Plan 已批准的内容。每个步骤完成后写入 `execute-log-file` 指向的 Execute Log：

```text
Step: 1
Status: DONE | BLOCKED | DEVIATED_MINOR | DEVIATED_MAJOR
Files: ...
Result: ...
Verification: ...
Deviation: ...
Timestamp: ...
```

重大偏差必须暂停并回到 Plan / Design，而不是事后改写 Spec 合理化实现。

### Review

Review 是四轴审查：

| 轴 | 检查内容 |
| :--- | :--- |
| Axis 0 | Invocation 是否仍然对齐原始目标。 |
| Axis 1 | Design / Acceptance / Plan 是否覆盖完整。 |
| Axis 2 | Code Diff 是否越界。 |
| Axis 3 | Execute Log 是否忠实反映真实改动。 |

Axis 2 是 primary axis。Axis 0、1、3 是确认轴，任何一轴失败都应阻止归档或触发修正。

### Archive / Reopen

归档前运行：

```text
sdd validate <project-dir> --archive-ready
```

`archive` 会再次执行同一套校验，通过后把 Spec、Design、Execute Log 一起移动到 `<docs-root>/archive/`，并更新归档 Spec 内的引用。

修复已归档任务时使用：

```text
sdd reopen <project-dir> <task-slug> --defect "缺陷描述"
```

不要重新 `discover`，否则会切断历史上下文。

## 三、三种模式

| 门禁 / 产物 | standard | lite | micro |
| :--- | :---: | :---: | :---: |
| Research | 完整 | 保留 | 跳过 |
| Innovate | 至少两个方案 | 可跳过但写 Reason | 跳过 |
| Design | 独立 Technical Design | 独立 Design Note | 不单独创建 |
| Acceptance | AC-###，推荐 BDD | 轻量 AC | Plan 中的 Acceptance |
| Plan Approval | 必须 | 必须 | 必须 |
| Execute Log | 独立文件，必填 | 独立文件，必填 | 独立文件，必填 |
| Review | 四轴 | 四轴 | 默认 Axis 2 |
| Subagent | 推荐 | 可选 | 默认不用 |

模式选择建议：

- 新功能、重构、跨模块、外部契约、安全/权限/计费/数据迁移：用 standard。
- 中小改动、需求明确、影响面有限：用 lite。
- 单文件、低风险、可逆、无公共接口影响：用 micro。

当任务涉及安全、权限、计费、数据迁移、公共接口、跨模块副作用或不可逆变更，即使只改一个文件，也应升级到 lite 或 standard。

## 四、Subagent 策略

不采用“关键环节全部 subagent owner 化”。

推荐策略是：

- subagent 做 **evidence owner**：读取大量代码、历史 Spec、依赖文档，返回压缩证据。
- subagent 做 **work-package owner**：在大执行任务中处理局部实现包。
- subagent 做 **review axis owner**：分别检查 Review 的某个轴。
- orchestrator 做 **decision owner**：需求边界、方案选择、Plan gate、最终 verdict、归档一致性都由主上下文负责。

不可交给 subagent 直接决定的事项：

- Final Review verdict。
- Plan Approval。
- Completion Verification。
- 规范性产物的最终改写。

micro 默认不派发 subagent。lite 只在代码阅读量大或上下文污染风险高时派发。standard 推荐在 Research、复杂 Execute、Review 轴审查中使用。

## 五、理论与最佳实践参考

这些参考不是固定模板，而是按复杂度进入 Design 或 Acceptance：

| 参考 | 用在哪里 |
| :--- | :--- |
| DDD | 业务规则、领域模型、限界上下文、统一语言。 |
| C4 Model | 系统、容器、组件边界和依赖关系。 |
| ADR | 重要技术取舍和长期影响决策。 |
| arc42 | standard 模式下完整技术设计结构。 |
| TOGAF | 多系统、多团队、企业级视角，按需借鉴业务/数据/应用/技术维度。 |
| 凤凰架构 | 分布式、可靠性、演进式架构、故障模式和权衡。 |
| BDD / Gherkin | 用户行为、CLI 行为、错误处理、状态变化验收。 |

## 六、CLI 命令

| 命令 | 作用 |
| :--- | :--- |
| `init` | 初始化目录、配置和 AI 指令。 |
| `discover` | 创建 Spec、Design、Execute Log。 |
| `resume` | 输出当前任务和阶段提示。 |
| `status` | 检查目录结构、Spec、Design、Execute Log 健康度。 |
| `console` | 启动本地只读 Web Console，查看 Spec 阶段、状态、产物健康度和归档门禁。 |
| `validate` | 机器校验归档门禁。 |
| `review-execute` | 生成四轴 Review Prompt。 |
| `archive` | 归档 Spec 及引用产物。 |
| `reopen` | 基于归档任务创建修复 Spec 和新 Execute Log。 |
| `debug` | 生成根因分析 Prompt。 |
| `create-codemap` / `new-codemap` | 生成或创建模块地图。 |
| `create-projectmap` / `new-projectmap` | 生成或创建项目地图。 |
| `build-context-bundle` | 把外部材料压缩成上下文包。 |

安装后使用 `sdd` 命令执行所有操作。

## 七、Web Console

`sdd console [project-dir]` 会启动一个本地只读控制台，用于查看每个 Spec 的阶段、状态、Design / Execute Log 引用健康度和 `validate --archive-ready` 门禁问题。`project-dir` 可选；不传时在页面里输入或加载项目目录。

Web Console 是文件系统产物的 projection，不是新的 source of truth：

- 数据来源仍然是 `<docs-root>/specs/`、`<docs-root>/design/`、`<docs-root>/logs/`、`<docs-root>/archive/`。
- 项目看板和 Spec 列表读取后台内存索引快照；首次加载或刷新时可能短暂显示 indexing，再自动更新。
- 阶段由最早未满足门禁推导：Research、Innovate、Design、Acceptance、Plan、Execute、Review、Ready、Archived。
- 完整归档校验只在详情页和 Validate 操作中按需执行，避免看板和列表加载被全量校验阻塞。
- 当前版本只读展示和校验，不直接编辑 Spec、Design 或 Execute Log。
- 后续如加入 archive / reopen / discover 操作，也应调用现有命令，而不是在 Web 层直接改文件。

## 八、FAQ

### Plan 能替代技术设计吗？

不能。Design 解释为什么这样做、有哪些边界和取舍；Plan 只说明怎么按步骤执行。standard/lite 缺少 Design 时，`validate --archive-ready` 会阻止归档。

### Execute Log 为什么独立？

执行日志是事实记录，和 Spec 的规范性内容性质不同。独立后 Review 可以检查“计划、实现、日志”三者是否一致，Archive 也能保留完整审计链。

### Spec 还是单一真相源吗？

Spec 是控制面真相源。完整任务真相由 Spec 引用的 Design、Execute Log、CodeMap 等共同构成。Review 和 Archive 必须沿引用读取，而不是只读 Spec 文件本身。

### 什么时候创建 CodeMap？

模块复杂、调用链不清、跨任务会复用架构认知时创建。不要每个任务都创建 CodeMap。
