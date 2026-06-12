# SDD-RIPER

一套把 AI 协作开发落到文件系统的工作流——用 Spec 管任务边界，用 CodeMap 管模块认知，用阶段门禁管质量。

解决三个反复出现的问题：

- **方案漂移**：对话长了，AI 逐渐偏离原始目标
- **上下文爆炸**：关键约束被淹没在长聊天里
- **质量不可追**：改动为什么发生、有没有偏离计划，事后很难追溯

核心思路很简单：**把任务收敛成 Spec，把架构事实沉淀成 CodeMap / ProjectMap，把执行痕迹写入 Execute Log，让 AI 带着你按阶段走。**

使用方式：在支持 Skill 的 AI 工具里输入 `/sdd`，由 AI 带着你一步步走——你的主要工作是回答问题和审批 Plan，其余由 AI 承担。

---

## 安装

```bash
npm install -g https://github.com/arsterliu/sdd-riper.git
```

安装后即可使用 `sdd` 命令，或通过 `npx sdd-riper` 调用。

### 注册 Skill

把仓库注册到 AI 工具的技能系统，才能让 AI 带着你走流程。

**Claude Code：**

```bash
cp -r sdd-riper ~/.claude/skills/sdd-riper
```

**OpenCode：**

```bash
cp -r sdd-riper ~/.config/opencode/skills/sdd-riper
```

> 注意：复制的是**完整仓库目录**，不是单独的 SKILL.md。Skill 执行过程中会引用同仓库下的协议、模板等文件。

### 一行安装

把 clone、安装、Skill 注册合为一条命令。

**macOS / Linux / Git Bash：**

```bash
git clone https://github.com/arsterliu/sdd-riper.git ~/sdd-riper && cd ~/sdd-riper && npm install -g . && ln -s ~/sdd-riper ~/.claude/skills/sdd-riper
```

**Windows PowerShell：**

```powershell
git clone https://github.com/arsterliu/sdd-riper.git ~/sdd-riper; cd ~/sdd-riper; npm install -g .; New-Item -ItemType SymbolicLink -Path ~/.claude/skills/sdd-riper -Target ~/sdd-riper -Force
```

### 更新

推荐用符号链接注册 Skill，更新只需 `git pull`：

```bash
cd ~/sdd-riper
git pull
npm install -g .
```

如果之前是拷贝的，更新时多一步重新覆盖：

```bash
cd ~/sdd-riper
git pull
npm install -g .
cp -r . ~/.claude/skills/sdd-riper
```

### 环境要求

macOS / Linux 原生可用。Windows 需安装 [Git for Windows](https://git-scm.com/download/win)，用 Git Bash 运行。

---

## 30 秒上手

### 路径 A：Skill（推荐，让 AI 带着你走）

在对话中输入：

```text
/sdd
```

AI 会先判断项目是否已初始化：
- 没初始化 → 引导你走 Setup
- 已初始化 → 读取当前 Spec 和阶段提示，回到上次中断的地方

### 路径 B：CLI（手动控制每一步）

```bash
npx sdd-riper init my-project
npx sdd-riper discover my-project --task-name my-task --requirement "我要做什么"
```

任务中断后恢复：

```bash
npx sdd-riper resume my-project
```

---

## 核心概念

SDD-RIPER 围绕三个产物和一个流程运转。记住这几个就够了。

### 三个产物

| 产物 | 一句话 | 什么时候要 |
| :--- | :--- | :--- |
| **Spec** | 当前任务的单一真相源。需求、约束、研究、计划、执行日志、评审结论全在这里 | 每个任务都要 |
| **CodeMap** | 模块级架构地图。入口点、边界、组件、调用链、依赖、风险 | 模块复杂时再建 |
| **ProjectMap** | 多仓协作的全局地图。边界、接口契约、职责分工 | 跨仓库协作时再建 |

Spec 存放在 `<docs-root>/specs/`，CodeMap 在 `<docs-root>/codemap/`，ProjectMap 在 `<docs-root>/projectmap.md`。默认 `<docs-root>` 是 `mydocs/`，可通过 `.sdd-config` 修改。

### RIPER 五阶段

```text
Research → Innovate → Plan → Execute → Review
```

- **Research**：搞清楚要做什么。读代码、查依赖、确认需求边界
- **Innovate**：列出 ≥2 个方案，对比优劣
- **Plan**：写出原子步骤（文件路径 + 具体改动 + 验收条件），**等你审批**
- **Execute**：按 Plan 严格执行，所有偏差记入 Execute Log
- **Review**：四轴审查（需求对齐、计划覆盖、代码边界、日志一致性）

核心门禁只有一个：**Plan 没经你批准，AI 不能进入 Execute**。

### 常用命令

| 命令 | 作用 |
| :--- | :--- |
| `sdd init <dir>` | 初始化项目结构 |
| `sdd discover <dir> --task-name <name> --requirement <text>` | 创建新任务 |
| `sdd resume <dir>` | 恢复上次任务上下文 |
| `sdd status <dir>` | 检查结构完整性和流程健康度 |
| `sdd archive <dir> <spec-name>` | 归档已完成任务 |
| `sdd reopen <dir> <slug> --defect <text>` | 基于归档任务创建修复 Spec |

更多命令和工作流细节见 [GUIDE.md](./GUIDE.md)。

---

## 目录结构

初始化后项目会得到：

```text
<project>/
├─ .sdd-config              # 配置文件（docs 目录名、模式等）
├─ AGENTS.md / CLAUDE.md    # AI 配置文件
├─ .cursorrules
├─ .github/copilot-instructions.md
└─ mydocs/                  # 或 .sdd-config 指定的目录
   ├─ specs/                # 活跃任务 Spec
   ├─ codemap/              # 模块架构地图
   ├─ context/              # 上下文包
   └─ archive/              # 已归档任务
```

---

## 贡献

欢迎提 Issue 和 PR。提交前建议：

```bash
npx sdd-riper status <target-dir>
bash tests/run_all.sh
```

---

## 更多

- [GUIDE.md](./GUIDE.md) — 工作流深入、CLI 命令全集、模式选择、FAQ
- [TEAM-GUIDE.md](./TEAM-GUIDE.md) — 团队协作指南
- [INTEGRATIONS.md](./INTEGRATIONS.md) — 与外部 Skill 的集成细节
