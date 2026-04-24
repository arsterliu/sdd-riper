# SDD-RIPER: 结构化驱动开发协议与 CLI 工具链

## 1. 项目简介

在 AI 辅助开发的时代，虽然代码生成的效率极大提高，但团队往往面临四大痛点：
- **AI 幻觉**：AI 生成了看似正确但实际上不存在的库调用或业务逻辑。
- **方案漂移**：在长对话中，AI 逐渐偏离了最初的设计初衷，导致实现方案碎片化。
- **上下文爆炸**：冗长的历史对话和无关的文件信息淹没了核心任务定义。
- **质量不可控**：缺乏明确的审计痕迹，难以追溯为什么这么改，改动是否覆盖了所有边界。

**SDD-RIPER** (Structured Driven Development - Research, Innovate, Plan, Execute, Review) 是一套为人类工程师与 AI 协作量身定制的开发协议。它通过“三铁律”和 RIPER 五阶段流程，将开发过程结构化、文档化，确保每一行代码都有据可查，每一个方案都经过评估。

> **🚀 3 分钟开始：先选一条路径**
> - **我是新手 / 想让 AI 带着走**：直接看[快速开始 - 路径 A](#路径-aopencode-skill推荐ai-全程引导)，输入 `/sdd-riper`
> - **我想手动控制 / 接 CI**：直接看[快速开始 - 路径 B](#路径-bshell-cli精确控制)，运行 `./sdd.sh init <project-dir>`
>
> 如果你还不确定，默认选 **路径 A**。

---

## 2. 先理解三个核心产物

在开始使用命令之前，先记住 SDD-RIPER 里最重要的三个产物：

| 产物 | 作用 | 什么时候需要 |
| :--- | :--- | :--- |
| **Spec** | 当前任务蓝图：写清楚要做什么、为什么做、打算怎么做 | **几乎每次任务都需要，先从这里开始** |
| **CodeMap** | 当前仓库地图：帮助 AI / 开发者快速理解模块结构、调用链路、外部依赖 | 单仓但结构复杂时使用 |
| **ProjectMap** | 多仓全局地图：描述跨仓边界、接口契约、职责划分 | 只有多仓库 / 多模块协作时才需要 |

第一次使用时，记住一句话就够了：
- **先创建 Spec**
- **复杂任务再补 CodeMap**
- **跨仓任务再补 ProjectMap**

---

## 3. 前置条件

本工具链基于 Bash 脚本开发，兼容主流类 Unix 环境。

- **macOS / Linux**: 原生支持 `bash`。
- **Windows**: 
  - **推荐**：使用 [Git for Windows](https://git-scm.com/download/win) 附带的 **Git Bash**。
  - **可选**：使用 WSL (Windows Subsystem for Linux)。
  - *注意*：不直接支持 CMD 或 PowerShell。
  - **PowerShell 用户**：可直接使用项目根目录的 `sdd.ps1` 包装脚本，无需手动打开 Git Bash：
    ```powershell
    .\sdd.ps1 init my-project
    .\sdd.ps1 discover my-project --task-name "my-feature" --requirement "你的需求描述"
    ```
    前置要求：已安装 [Git for Windows](https://git-scm.com/download/win)（`sdd.ps1` 会自动定位其内置的 Git Bash）。

---

## 4. 作为 OpenCode Skill 使用

### 前置条件
- 已安装 [OpenCode](https://opencode.ai)
- 已安装 bash（macOS/Linux 原生；Windows 使用 Git Bash）

### 安装方式

#### 全局安装（推荐）
安装后所有项目均可使用：
```bash
# 克隆或下载 sdd-riper 仓库后执行
cp -r sdd-riper ~/.config/opencode/skills/sdd-riper
```

#### 项目级安装（随仓库分发）
安装在项目内，版本随仓库锁定，优先级高于全局安装：
```bash
mkdir -p .agents/skills
cp -r sdd-riper .agents/skills/sdd-riper
```

### 激活方式
在 OpenCode 对话中输入：
```
/sdd-riper
```

### 两种模式

| 模式 | 场景 | 触发条件 |
| :--- | :--- | :--- |
| **Setup 模式** | 首次使用，引导初始化项目结构、创建首个 Spec | 项目下尚无 `mydocs/` 目录 |
| **Workflow 模式** | 日常使用，AI 加载当前 Spec 上下文，引导 RIPER 各阶段 | 项目已初始化（有 `mydocs/`） |

### 与 Shell CLI 的区别

| | Shell CLI（`sdd.sh`） | OpenCode Skill（`/sdd-riper`） |
| :--- | :--- | :--- |
| **操作者** | 开发者手动执行命令 | AI 作为协调者，自动调用 CLI 命令 |
| **适合场景** | 精确控制、CI/CD、脚本集成 | 交互式开发、AI 全程引导 RIPER 流程 |
| **底层实现** | 直接调用 `sdd.sh` 子命令 | Skill 通过 `sdd.sh` 间接执行 |

两者共存，互不干扰。在同一项目中可以混用。

> **新手提示：三个入口，各司其职**
> - `/sdd-riper` — 在 OpenCode 中激活 AI Skill，让 AI 全程驾驶。**首次推荐从这里开始。**
> - `./sdd.sh <command>` — Shell CLI，手动精确控制每一步，适合 CI/CD 或不用 OpenCode 的场景。
> - `./sdd.sh discover` — 开始一个新任务，进入 **Pre-Research**，并创建首个 Spec。
> - `./sdd.sh resume` — 恢复已有任务上下文，继续之前的工作。
>
> 如果你不确定从哪里开始，选 `/sdd-riper`。

---

## 5. 快速开始（5分钟）

根据你的使用习惯，选择以下任一路径：

---

### 路径 A：OpenCode Skill（推荐，AI 全程引导）

适合日常 AI 辅助开发，AI 作为协调者自动调用 CLI 命令，引导你完成整个 RIPER 流程。

1. **安装 Skill**：
   ```bash
   # 全局安装（所有项目可用）
   cp -r sdd-riper ~/.config/opencode/skills/sdd-riper
   ```

2. **在 OpenCode 对话中激活**：
   ```
   /sdd-riper
   ```

   **如果你不知道第一句该说什么，可以直接这样开场：**
   ```text
   我想在 my-project 里新增一个登录功能，请帮我按 SDD-RIPER 流程开始。
   ```

3. **AI 会自动引导你**完成初始化、创建 Spec、执行 RIPER 各阶段——无需记忆任何命令。

---

### 路径 B：Shell CLI（精确控制）

适合 CI/CD、脚本集成或偏好手动控制的场景。

> 这里的 `sdd-riper` 仓库是**工具仓库**；你真正要管理的是后面命令里的目标项目目录（例如 `my-project`）。  
> 通常**不需要**把整个 `sdd-riper` 复制到业务项目里；CLI 命令只会在目标项目中创建 `mydocs/` 和 AI 配置文件。只有在你明确选择“项目级安装”时，才把它放进 `.agents/skills/sdd-riper`。

1. **克隆仓库**：
   ```bash
   git clone <repository-url>
   cd sdd-riper
   ```

2. **赋予执行权限**：
   ```bash
   chmod +x sdd.sh
   ```

3. **初始化项目（只需执行一次）**：
   ```bash
   ./sdd.sh init my-project
   ```

4. **开始一个新任务（每次新任务执行一次）**：
   ```bash
   ./sdd.sh discover my-project \
     --task-name "my-first-task" \
     --requirement "你的需求描述" \
     --goal "核心目标" \
     --constraints "技术或业务约束" \
     --context "相关背景信息"
   ```

    第一次上手时，你只需要把上面命令里的 `my-project` 和几段中文示例文本替换成你自己的项目与需求即可，不需要额外理解所有参数细节。

    > `discover` 不是 `init` 的延续——它是每次新任务的起点，负责进入 **Pre-Research** 并创建 Spec 文件。  
    > 如果项目已存在（`mydocs/` 已有），直接跳到这一步即可。

5. **继续已有任务（回到上下文）**：
   ```bash
   ./sdd.sh resume my-project
   ```

   `resume` 不会创建新 Spec，它只负责读取当前状态、输出阶段提示，并帮助 AI / 开发者继续之前的任务。

现在，你可以在 `my-project/mydocs` 目录下看到标准的 SDD 结构，并在 `specs/` 下找到已填充的 Spec 文件。

---

## 6. CLI 命令速查表

所有命令通过 `./sdd.sh` 调度，常用格式为 `sdd <command> [args]`。

现在把命令理解成两类：
- **新任务入口**：`discover`，进入 **Pre-Research**，创建首个 Spec
- **继续任务入口**：`resume`，恢复已有任务上下文

### 一张图看懂 CLI 与 RIPER 的关系

```text
初始化项目:         init
开始新任务:         discover
继续已有任务:       resume
进入 Review:        review-execute
归档任务:           archive

典型顺序:
init -> discover -> Research/Plan/Execute -> review-execute -> archive
```

### 基础命令

| 命令名 | 用法 | 说明 | 常用参数 |
| :--- | :--- | :--- | :--- |
| **init** | `sdd init <dir>` | 初始化 SDD 目录结构（首次执行） | `--mode standard\|lite`, `--force`, `--docs-dir <name>` |
| **discover** | `sdd discover <dir> --task-name <name>` | 开始一个新任务，进入 Pre-Research，并创建首个 Spec | `--requirement`, `--goal`, `--constraints`, `--context` |
| **resume** | `sdd resume <dir>` | 恢复已有任务上下文，输出当前阶段提示 | 无 |
| **create-codemap** | `sdd create-codemap <dir>` | 创建模块架构映射 (CodeMap) | `--module <name>` |
| **create-projectmap**| `sdd create-projectmap <dir>` | 创建跨项目映射 (ProjectMap) | `--repos repo1,repo2`, `--force` |
| **status** | `sdd status <dir>` | 校验项目规范性与进度 | 无 |
| **archive** | `sdd archive <dir> <spec-name>` | 归档已完成的 Spec | `--force` |

> **模式怎么选？**
> - **Lite**：适合小修小补、文案调整、单点 Bug 修复
> - **Standard**：适合多文件功能开发、重构、核心逻辑改动
>
> 如果拿不准，优先选 `standard`。

### AI 驱动命令

这些命令**输出结构化 Prompt**（stdout），供你粘贴给 AI 或通过管道传入 AI CLI。它们不修改任何文件（`discover` 除外），执行后将 AI 引导至正确的上下文和任务。

| 命令名 | 用法 | 说明 | 常用参数 |
| :--- | :--- | :--- | :--- |
| **resume** | `sdd resume <dir>` | 输出项目状态摘要与当前阶段提示，让 AI 快速恢复上下文。**适合在已有项目中继续未完成的任务** | 无 |
| **discover** | `sdd discover <dir> --task-name <name>` | **AI 自动填充并创建 Spec 文件**，作为新任务 / Pre-Research 的正式入口 | `--requirement`, `--goal`, `--constraints`, `--context` |
| **review-execute** | `sdd review-execute <dir>` | 生成三轴 Review Prompt：Spec Plan vs Code Diff vs Execute Log | `--spec <path>`, `--log <path>` |
| **create-codemap** | `sdd create-codemap <dir>` | 生成 AI 分析项目结构并填写 CodeMap 的 Prompt | `--module <name>` |
| **build-context-bundle** | `sdd build-context-bundle <dir>` | 打包当前 Spec + CodeMap + 关联文件为 AI 背景材料包 | `--out <bundle-name>` |
| **debug** | `sdd debug <dir>` | 生成带代码快照的 Debug Prompt，引导 AI 系统定位根因 | `--log <file>`, `--error <msg>` |
| **create-projectmap** | `sdd create-projectmap <dir>` | 生成 AI 扫描多仓并填写 ProjectMap 的 Prompt | `--repos <repo1,repo2,...>`, `--force` |

#### `discover` 典型用法

最推荐的新任务开启方式——将需求、目标、约束一次性传入，AI 自动生成规范的 Spec 文件：

```bash
./sdd.sh discover my-project \
  --task-name "user-login" \
  --requirement "用户可以通过邮箱+密码登录，失败3次锁定账号" \
  --goal "实现安全的登录流程，支持锁定与解锁" \
  --constraints "使用现有 JWT 库，不引入新依赖" \
  --context "项目已有 UserService，token 存储在 Redis"
```

执行后在 `my-project/mydocs/specs/v1.0-user-login.md` 生成已填充的 Spec 文件（版本号自动递增，如再次创建同名任务则生成 `v1.1-user-login.md`）。

#### `resume` 典型用法

当你已经有 Spec，想继续之前的任务时：

```bash
./sdd.sh resume my-project
```

执行后会输出 `LATEST_SPEC`、`SPEC_STATUS`、`HAS_CODEMAP`、`PHASE_HINT` 等字段，供 AI 或开发者继续当前阶段。

#### CodeMap 该怎么维护？

- **CodeMap 是模块级活文档，不是任务级文件**：通常一个复杂模块一份，跨任务复用。
- **不是每个任务都要建 / 都要改**：只有当模块结构复杂、调用链不清晰，或本次任务改变了入口点、核心调用链、外部依赖、风险项时，才创建或更新 CodeMap。
- **推荐顺序**：先创建 Spec；若任务进入 Research 后发现模块结构不清，再运行 `create-codemap`；任务结束前若架构事实变化，再反向更新现有 CodeMap。
- **不要为同一模块每个任务新建一份 CodeMap**，否则很快会失真并相互冲突。

#### `review-execute` 典型用法

Execute 阶段完成后，用于驱动 AI 做三轴 Review：

```bash
# 自动检测最新 Spec 和 Execute Log
./sdd.sh review-execute my-project

# 手动指定 Spec 和日志路径
./sdd.sh review-execute my-project \
  --spec my-project/mydocs/specs/v1.0-user-login.md \
  --log my-project/mydocs/evidence/v1.0-user-login/execute.log
```

#### `debug` 典型用法

遇到 Bug 时，快速生成带上下文的 Debug Prompt：

```bash
# 传入错误日志文件
./sdd.sh debug my-project --log /tmp/app.log

# 直接传入错误信息字符串
./sdd.sh debug my-project --error "TypeError: Cannot read property 'id' of undefined at login.js:42"
```

### 退出码说明
- `0`: 成功。
- `1`: 缺失必需资产（如目录结构损坏）。
- `2`: 引用损坏（如 ProjectMap 格式错误）。
- `3`: 参数错误或环境不支持。

---

## 7. 双轨说明：Standard vs Lite

SDD-RIPER 支持两种工作模式，通过 `init` 的 `--mode` 参数指定。

### Standard (标准模式)
- **适用场景**：复杂功能、重构任务、涉及多个文件的变动、新加入团队的成员。
- **核心区块**：包含完整的 `Requirement Restatement` / `Open Questions` / `Assumptions` / `Research Readiness Checklist` / `Innovate Options` / `Plan Approval` / `Execute Log` / `Review Summary`。
- **治理强度**：中强治理。强制要求方案对比和详细的执行日志。

### Lite (轻量模式)
- **适用场景**：简单 Bug 修复、文案调整、熟悉协议的高级开发者。
- **核心区块**：仅保留最小约束 `Requirement Restatement` / `Open Questions` / `Micro Plan` / `Change Summary` / `Review Verdict`。
- **治理强度**：极简治理。追求极致速度，但保留最核心的“思考后再动手”门禁。

---

## 8. 目录结构说明

初始化后的项目目录（默认在 `mydocs/` 下）结构如下：

- `specs/`: 存放所有正在进行的任务说明书 (Spec)。**这是开发的核心。**
- `codemap/`: 记录模块结构、调用链路和外部依赖，帮助 AI 快速建立本地架构视图。
- `context/`: 存放背景材料包（如旧 Spec、历史设计稿、PRD 等）。
- `archive/`: 存放已归档的任务。`sdd archive` 会生成两个文件，命名继承来源 Spec 的版本号：供人类阅读的 `v{N}.{M}-{任务名}-human.md` 和 AI 高密度上下文压缩版 `v{N}.{M}-{任务名}-llm.md`。
- `evidence/`: 存放测试截图、日志、验证脚本等执行证据。

### AI 配置文件
`sdd init` 会自动根据模式生成对应的 AI 指令文件（如 `AGENTS.md`, `CLAUDE.md`, `.cursorrules`）。这些文件是 SDD 协议在 AI 端的投影，确保 AI 遵循 RIPER 流程。

---

## 9. 多项目协作：ProjectMap

当你的任务涉及多个仓库时，`ProjectMap` 充当全局地图。
- **角色**：定义跨仓库的调用边界、接口契约和职责划分。
- **结构**：包含 `name`、`repos` 等核心字段（由 `sdd status` 强制校验），以及 `interfaces` 等可选字段用于记录跨仓接口契约。
- **校验**：`sdd status` 会自动检查 ProjectMap 的 frontmatter 是否完整，确保全局上下文不掉链。

---

## 10. FAQ（常见问题）

**Q: `discover` 为什么需要同时输入 requirement 和 context？**  
A: `--requirement` 是当前的“口令”，是必须完成的任务；`--context` 是“百科全书”，提供背景。两者职责不同。如果只给 context，AI 会在历史堆里迷失；如果只给 requirement，AI 无法理解既有代码的约束。`discover` 将两者收敛为单一的 Spec 文件——这是整个 Pre-Research / RIPER 流程的起点。

**Q: `discover` 和 `resume` 的区别是什么？**  
A:
- **`discover`**：开始一个新任务，进入 Pre-Research，并创建首个 Spec
- **`resume`**：继续已有任务，只恢复上下文，不创建新 Spec

**Q: Requirement / Context / Spec 的区别？**  
- **Requirement**: “我们要去哪”（需求定义）。
- **Context**: “我们现在在哪”（历史背景）。
- **Spec**: “我们要怎么去”（执行方案）。

**Q: Standard 和 Lite 何时选哪个？**  
基于任务复杂度。涉及 3 个以上文件改动，或涉及核心逻辑修改，选 Standard；简单的 UI 调整或单点修复，选 Lite。

**Q: 为什么 `sdd status` 只做提示型校验，不做硬门禁？**  
`sdd status` 检查“痕迹”（你有没有写这个区块），但不检查“质量”（你写得对不对）。质量必须由人工通过 `Plan Approved` 门禁来保证。工具不应阻断灵活性，但要提醒风险。

**Q: 使用了 `/sdd-riper`，还需要手动运行 `./sdd.sh` 吗？**  
A: 通常不需要。`/sdd-riper` 激活后，AI 会在需要时自动调用 `sdd.sh` 命令（如 `init`、`discover`、`resume`、`archive`）。你只需在 OpenCode 对话中描述意图即可。  
手动运行 `./sdd.sh` 的场景：CI/CD 流水线、不使用 OpenCode 的环境、或需要精确控制特定步骤时。  
两者可以混用，互不干扰。

**Q: 我需要把整个 `sdd-riper` 复制到我的项目里吗？**  
A: 通常不需要。最常见的用法是：把 `sdd-riper` 作为全局 Skill 或独立工具仓库安装好，然后对你的目标项目运行 `init`、`discover` / `resume` 等命令。  
这些命令只会在目标项目里创建 `mydocs/` 和 AI 配置文件，不会要求你把整个工具仓库拷进去。  
只有当你希望 Skill 跟随仓库一起分发、并锁定版本时，才使用项目级安装：`.agents/skills/sdd-riper`。

**Q: Windows 上如何使用？**

请确保安装了 Git for Windows，并在 **Git Bash** 终端中运行命令。不要使用 PowerShell 或 CMD，因为它们不支持某些 Bash 特有的语法和命令。

---

## 11. 贡献指南

我们欢迎任何形式的贡献！
- 发现 Bug？请提交 Issue。
- 有好的想法？欢迎提交 PR。
- 改进文档？随时欢迎。

请在提交前确保运行 `./sdd.sh status <your-project-dir>` 检查通过。
