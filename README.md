# SDD-RIPER

SDD-RIPER 是一套把 AI 协作开发落到文件系统的工作流。它用 **Spec** 管任务目标和门禁，用 **Design** 管技术设计，用 **Execute Log** 管执行事实，用 **CodeMap / ProjectMap** 管架构认知。

核心目标不是多写文档，而是让每个任务都能被追踪、审查和归档：

- 需求不会在长对话里漂移。
- 方案选择有证据和取舍。
- Plan 不能替代技术设计。
- Execute 的真实行为可以被 Review 审计。
- 归档后可以 reopen，而不是重新 discover 丢失上下文。

## 安装

统一从 GitHub 安装 CLI：

```text
npm install -g https://github.com/arsterliu/sdd-riper.git
```

需要 Node.js 18+。安装后检查：

```text
sdd --version
where sdd
```

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
sdd install-skill --target claude
sdd install-skill --target opencode
sdd install-skill --target all
```

如果是升级或大版本变更，建议清理旧 Skill 目录，避免已删除文件残留：

```text
sdd install-skill --target codex --clean
```

更新后重启 Codex / Claude / OpenCode 会话，以及正在运行的 `sdd console`。

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

## 30 秒上手

Skill 触发：

```text
/sdd
```

CLI：

```text
sdd init my-project --mode standard
sdd discover my-project --task-name my-task --version v1.0 --requirement "我要做什么"
sdd resume my-project
```

`discover` 会创建一组任务产物：

- `mydocs/specs/v1.0-my-task.md`
- `mydocs/design/v1.0-my-task.design.md`，micro 模式不创建
- `mydocs/logs/v1.0-my-task.execute.md`

Spec 的 frontmatter 会写入 `design-file` 和 `execute-log-file`，后续命令都从这两个引用读取独立产物。

## 核心产物

| 产物 | 责任 |
| :--- | :--- |
| **Spec** | 控制面。保存 Invocation、Research、Innovate、Acceptance Criteria、Plan、审批、Review verdict，并引用 Design / Execute Log。 |
| **Design** | 技术设计产物。standard 写 `Technical Design`，lite 写 `Design Note`，micro 不单独写设计。 |
| **Execute Log** | 执行事实产物。每个 Plan step 的结果、偏差、验证结果都追加到这里。 |
| **CodeMap** | 模块级架构地图，记录入口、边界、依赖、风险。 |
| **ProjectMap** | 多仓或多团队协作地图，记录系统边界、接口契约和职责。 |

## 流程

```text
Research -> Innovate -> Design/Acceptance -> Plan -> Execute -> Review -> Archive
```

- **Research**：澄清需求、约束、事实和不确定性，形成 Confirmed Requirement。
- **Innovate**：至少比较两个方案；lite 可跳过，但必须写明 Reason。
- **Design/Acceptance**：standard/lite 在独立 Design 文件写设计，验收标准仍留在 Spec；micro 把 `Acceptance` / `Verification` 写入 Plan。
- **Plan**：从 Design 和 Acceptance Criteria 拆成原子步骤，必须等待人工审批。
- **Execute**：严格按 Plan 执行，偏差写入独立 Execute Log。
- **Review**：四轴审查 Invocation、Design/Acceptance/Plan、Code Diff、Execute Log。
- **Archive**：`validate --archive-ready` 通过后，Spec、Design、Execute Log 一起归档。

## 三种模式

| 模式 | 适用场景 | Design | Execute Log | Subagent |
| :--- | :--- | :--- | :--- | :--- |
| `standard` | 新功能、重构、多模块、风险较高任务 | 独立 Technical Design | 独立文件，必填 | 推荐作为 evidence / work-package owner |
| `lite` | 中小改动、上下文明确任务 | 独立 Design Note | 独立文件，必填 | 可选 |
| `micro` | 单文件 bugfix、文案、低风险配置 | 不单独创建，写入 Plan | 独立文件，必填 | 默认不用 |

组合策略：

- **Design / Execute Log 独立产物化是强制策略**。
- **Subagent 不是所有关键环节的 decision owner**；它只做 evidence owner、work-package owner、review axis owner。
- **Orchestrator 永远负责最终目标、门禁、裁决和归档一致性**。

## 常用命令

| 命令 | 作用 |
| :--- | :--- |
| `sdd init <dir>` | 初始化项目结构。 |
| `sdd discover <dir> --task-name <name> --version v1.0 --requirement <text>` | 创建 Spec、Design、Execute Log。 |
| `sdd resume <dir>` | 恢复当前任务上下文。 |
| `sdd status <dir>` | 检查结构和流程健康度。 |
| `sdd console [dir]` | 启动本地 Web Console，可选择项目目录，查看每个 Spec 的阶段、状态、产物健康度和归档门禁。 |
| `sdd install-skill --target codex\|claude\|opencode\|all [--clean]` | 把当前已安装包携带的完整 Skill 注册到 agent 环境。 |
| `sdd validate <dir> --archive-ready` | 归档前门禁校验。 |
| `sdd review-execute <dir>` | 生成四轴 Review Prompt。 |
| `sdd archive <dir> <spec-name>` | 归档完成任务及引用产物。 |
| `sdd reopen <dir> <slug> --defect <text>` | 基于归档任务创建修复 Spec。 |

## Web Console

```text
sdd console [project-dir]
```

Console 用于观测和诊断，不替代 agent 执行 SDD。它支持：

- 页面里选择项目目录。
- 多项目看板预览。
- 查看 Spec 阶段、状态、产物和归档门禁。
- 每个产物按 `Spec / Design / Execute Log` 独立 Preview。
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
    ├── codemap/     # 模块地图
    ├── context/     # Context Bundle
    └── archive/     # 已归档 Spec / Design / Execute Log
```

更多细节见 [GUIDE.md](./GUIDE.md)。
