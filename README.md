# SDD-RIPER：面向 AI 协作开发的治理协议与工具链

SDD-RIPER（Structured Driven Development - Research, Innovate, Plan, Execute, Review）不是一个“提示词模板集合”，而是一套把 **任务定义、阶段门禁、上下文恢复、执行证据和归档复盘** 落到文件系统里的工作流。

它要解决的不是“让 AI 多写一点代码”，而是下面这些在 AI 协作开发里反复出现的问题：

- **方案漂移**：对话拉长后，AI 逐渐偏离原始目标。
- **上下文爆炸**：历史聊天太长，真正重要的约束被淹没。
- **质量不可控**：改动为什么发生、是否偏离计划、有没有留下证据，很难追。
- **修复失焦**：遇到失败后，AI 很容易跳过根因分析直接乱试。

SDD-RIPER 的做法是：把任务收敛成 **Spec**，把架构事实沉淀成 **CodeMap / ProjectMap**，把执行痕迹落到 **evidence / archive**，再通过 CLI 和 Skill 把这些门禁真正执行起来。

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
- **No root cause, no retry**：出现失败后，先跑 `debug` 找根因，再决定是否重试。
- **Spec is truth**：任务边界、约束和执行口径以 Spec 为准，不以聊天记忆为准。

这些规则不是 README 里的口号，它们会被 `init` 生成到 `AGENTS.md`、`CLAUDE.md`、`.cursorrules`、`.github/copilot-instructions.md` 里，成为 AI 侧的约束。

---

## 3. 三个你最先要理解的产物

| 产物 | 作用 | 默认路径 |
| :--- | :--- | :--- |
| **Spec** | 当前任务的单一真相源：需求、约束、研究、计划、执行日志、评审结论都在这里 | `<docs-root>/specs/`（默认 `mydocs/specs/`） |
| **CodeMap** | 模块级架构地图：入口点、调用链、外部依赖、风险项 | `<docs-root>/codemap/`（默认 `mydocs/codemap/`） |
| **ProjectMap** | 多仓/多模块协作的全局地图：边界、接口契约、职责分工 | `<docs-root>/projectmap.md`（默认 `mydocs/projectmap.md`） |

另外还有两个重要目录：

- **`<docs-root>/context/`**：存放 Context Bundle，给新任务或跨阶段切换提供结构化背景材料。
- **`<docs-root>/archive/`**：存放归档后的 `-human.md` / `-llm.md`，一个给人看，一个给 AI 高密度恢复上下文。

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
./sdd.sh init <target-dir>
./sdd.sh discover <target-dir> --task-name "my-task" --requirement "你的需求"
```

如果任务中断，再用：

```bash
./sdd.sh resume <target-dir>
```

### 路径 C：Windows PowerShell

如果你在 PowerShell 里工作，优先用：

```powershell
.\sdd.ps1 init <target-dir>
.\sdd.ps1 discover <target-dir> --task-name "my-task" --requirement "你的需求"
```

`sdd.ps1` 会优先从 Windows Registry 自动定位 Git Bash；找不到时再尝试 `Get-Command bash`。你不需要手动把路径转换成 MINGW 形式。

---

## 6. 5 分钟上手：真实主路径

### 第一步：初始化项目

```bash
./sdd.sh init my-project --mode standard
```

这一步会做几件事：

- 创建 docs 根目录（默认 `mydocs/`）及其子目录：`specs/`、`codemap/`、`context/`、`archive/`、`evidence/`
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
- 输出 `## SPEC CREATION PROMPT`，指导 AI 回填研究结论和初始问题

如果同名任务之前已经存在，版本号会自动递增；也可以显式传 `--version vN.M` 覆盖默认版本。

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

其中 `PHASE_HINT` 是最关键的，它会告诉 AI 当前更适合进入哪个阶段。当前实现的映射规则是：

| Spec 状态 | 额外条件 | PHASE_HINT |
| :--- | :--- | :--- |
| `draft` | 没有有效的 `Plan Approved By:` 内容 | `research_or_plan` |
| `draft` | 已有有效的 `Plan Approved By:` 内容 | `execute` |
| `approved` | 无 | `review` |
| `done` | 无 | `archive` |
| 无活跃 Spec / 最新 Spec 已 `archived` | 无 | `new_task` |

也就是说，`resume` 不是简单按文件是否存在来判断阶段，而是会结合 `status` 和 `Plan Approved By` 的内容来给出下一步建议。

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

Plan 阶段不是“AI 列个 todo 就完了”。在 Skill 里，Plan 输出后必须经过人工确认，AI 才能进入 Execute。

这也是为什么 Spec 模板里有：

- `Plan Approved By:`
- `Approved At:`

如果这两个信息没有实质内容，流程就不应该继续执行。

### BUGFIX / FAIL_CODE：先 debug，再重试

当 Execute 阶段遇到缺陷，或者 Review 判定为 `FAIL_CODE` 时，规则不是“直接再改一次”，而是：

1. 先运行 `debug`
2. 根据 `DEBUG PROMPT` 找 Root Cause
3. 只做最小修复
4. 针对同一个 defect instance，最多重试 3 次

如果 3 次后仍无法收敛，就应该升级为人工介入，而不是继续盲试。

这里说的是**任务进行中**的修复重试；如果任务已经 `archive` 完成，后续再发现缺陷，就不走这里的重试环，而是改用 `reopen` 创建 patch Spec。

### Archive / Reopen：闭环，而不是失忆重开

- `archive` 会生成：
  - `vN.M-<task>-human.md`
  - `vN.M-<task>-llm.md`
- 同时把来源 Spec 的 `status` 改成 `archived`

如果归档后发现缺陷，不应该重新 `discover` 一个新任务，而应该用：

```bash
./sdd.sh reopen <project-dir> <task-slug> --defect "缺陷描述"
```

`reopen` 会读取 archive 里的上下文，创建新的 patch Spec，并写入 `reopened-from` 与 `context-source`。如果来源任务还没有归档，`reopen` 会直接失败，并提示你改用 `resume` 继续当前任务。

---

## 8. CLI 命令总览

`sdd.sh` 当前调度 13 个子命令：

| 命令 | 作用 | 关键参数 / 说明 |
| :--- | :--- | :--- |
| `init` | 初始化 docs 结构和 AI 配置文件 | `<project-dir>` `--mode standard\|lite` `--force` `--docs-dir <name>` |
| `discover` | 创建新任务的首个 Spec | `<project-dir>` `--task-name` `--requirement` `--goal` `--constraints` `--context` `--version` |
| `resume` | 恢复当前任务上下文并输出 `PHASE_HINT` | `<project-dir>` |
| `status` | 检查结构完整性和流程健康度 | `<project-dir>` |
| `archive` | 归档已完成 Spec，生成 human / llm 两份归档 | `<project-dir>` `<spec-name>` `--force` |
| `reopen` | 基于已归档任务创建 patch Spec | `<project-dir>` `<task-slug>` `--defect <text>` |
| `review-execute` | 生成 **四轴** Review Prompt | `--spec <path>` `--log <path>` `--diff-base <rev>` |
| `create-codemap` | 生成 AI 扫描代码库并创建 / 更新 CodeMap 的 Prompt | `<project-dir>` `--module <name>` |
| `build-context-bundle` | 生成提炼 Context Bundle 的 Prompt，并输出目标路径 | `<project-dir>` `--out <name>` `--version vN.M` |
| `debug` | 生成基于错误信息和日志的 Root Cause 分析 Prompt | `<project-dir>` `--log <file>` `--error <msg>` |
| `create-projectmap` | 生成 AI 填写 ProjectMap 的 Prompt | `<project-dir>` `--repos repo1,repo2` `--force` |
| `new-codemap` | 从模板创建空白 CodeMap 文件 | `<project-dir>` `<module-name>` `--version vN.M` `--force` |
| `new-projectmap` | 从模板创建空白 ProjectMap 文件 | `<project-dir>` `--repos repo1,repo2` `--force` |

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
2. **Axis 1 — Spec Plan Coverage**：Plan 步骤有没有落实
3. **Axis 2 — Code Diff Scope**：真实代码改动是否越界
4. **Axis 3 — Execute Log Fidelity**：执行日志和真实改动是否一致

其中 Axis 2 是 primary，另外三轴是 confirmation safety net。

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

## 11. Standard 和 Lite 怎么选

`init --mode` 支持两种模式：

- **standard**：适合多文件功能开发、重构、核心逻辑变更
- **lite**：适合小改动、轻量 bugfix、你已经非常熟悉这套协议

两种模式都保留 RIPER 门禁，但 standard 的 Spec 区块更完整，适合需要更强治理的任务。

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
   ├─ archive/
   └─ evidence/
```

每个目录的职责：

- `specs/`：活跃任务 Spec
- `codemap/`：模块地图
- `context/`：上下文包
- `archive/`：归档结果
- `evidence/`：执行日志、验证证据

---

## 14. FAQ

### `discover` 和 `resume` 的区别是什么？

- `discover`：开始一个新任务，创建首个 Spec
- `resume`：恢复已有任务，不创建新 Spec

### 为什么归档后修缺陷不能直接再 `discover`？

因为那样会丢失归档任务的上下文链路。`reopen` 的目的就是基于已完成任务的归档材料创建 patch Spec，把修复任务挂回原来的生命周期上。

### CodeMap 是不是每个任务都要建？

不是。只有当模块复杂、调用链不清，或者这次任务改变了入口点 / 核心调用链 / 外部依赖 / 风险项时，才值得创建或更新。

### Context Bundle 什么时候需要？

当你需要把当前 Spec、历史归档、CodeMap 等材料打包给 AI，避免它去啃一堆分散文件时，就该用 `build-context-bundle`。

---

## 15. 贡献

欢迎提 Issue 和 PR。提交前至少建议做两件事：

```bash
./sdd.sh status <target-dir>
bash tests/run_all.sh
```

如果你要改的是协议、模板或命令行为，优先确保 README、SKILL、模板和脚本实现保持一致。
