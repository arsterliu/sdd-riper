# SDD-RIPER

> 让 AI 和人一起做开发任务时，目标不跑偏、过程能检查、结果能回看。

SDD-RIPER 是一个本地命令行工具。它会把一次开发任务整理成几份简单的 Markdown 文件：要做什么、准备怎么做、实际做了什么、验证结果如何。你仍然使用自己的编辑器、测试命令和 AI；SDD-RIPER 负责把这些过程串起来。

它适合“这件事不能只靠聊天记录”的场景：改功能、修缺陷、重构、接入外部能力，或需要让团队之后看得懂这次改动为什么这样做。

## 先选你希望 AI 怎么配合

项目默认使用 `supervised`：AI 先把研究、方案和计划讲清楚；你批准 Plan，并在同一次确认里明确允许后续自动推进后，AI 才会连续完成实现、验证和独立复查。你也可以选择：

- `auto`：任务范围确认并授权后，AI 可在该范围内自动启动计划内子 Agent，持续推进到最终归档授权前。
- `supervised`：先由你看 Plan；Plan Approval 与“后续可自动推进”是两个独立事实，不会互相推导。
- `human`：Research、方案选择、Plan、完成检查、Challenge/修复等治理节点逐次由你确认；普通测试和计划内调试不会逐项打扰。

无论选哪一档，归档、工程画像精确摘要、跳过 E2E、不可逆操作、范围扩大、新风险和平台权限都仍会单独询问。AI 会根据当前状态用自然语言告诉你为什么停下、需要确认什么；你不必自己拼命令。

创建 Spec 前，AI 会先主动询问你选择 `auto`、`supervised` 还是 `human`，并推荐默认的 `supervised`。项目默认值只是推荐，不能静默替你选择；如果你已经明确说了模式，AI 会复述并请你确认，不再重复询问。

## 三分钟开始

### 让 AI 带你开始（推荐）

如果你在 Codex、Claude 或 OpenCode 里使用 SDD-RIPER，先做一次安装和登记（需要 Node.js 18 或更高版本）：

```text
npm install -g https://github.com/arsterliu/sdd-riper.git
sdd install-skill --target codex
```

如果你使用其他 AI 工具，把 `codex` 换成对应目标；详细选项见后面的[安装、更新与 AI Skill](#安装更新与-ai-skill)。

然后在与 AI 的对话里直接贴下面这段，把四项内容换成你的任务：

```text
请用 SDD-RIPER 帮我开始一个任务：
- 版本：v1.0
- 任务名：login-page
- 目标：完成登录页
- 参考资料：无
- 协作方式：supervised
```

AI 会按这四项创建任务；信息不够时会问你。之后只要说“下一步是什么？”，它会读取任务状态并带你继续。凡是需要当前用户授权的关键节点，例如最终归档，仍会单独询问你。

### 直接用命令行

如果你更习惯自己执行命令，也可以按下面的路径开始。

先在项目旁边初始化一套工作区：

```text
sdd init my-project --mode standard
```

再创建第一条任务。`version` 是这次交付的版本号，`task-name` 是任务的短名字；如果有 PRD、截图或说明文档，可以通过 `--context` 带进来：

```text
sdd discover my-project --task-name login-page --version v1.0 --requirement "完成登录页" --context none
sdd resume my-project
```

接下来运行：

```text
sdd next my-project
```

它会告诉你当前任务还缺什么，以及下一步应该做什么。

## 日常怎么用

把一次任务想成下面这条很朴素的路线：

1. 说明要解决的问题。
2. 想清楚方案和验收标准。
3. 写计划，确认后再动手。
4. 记录实际改动和验证结果。
5. 做一次独立检查；有问题就回到对应步骤修正。
6. 确认完成并得到你的明确同意后，归档这次任务。

你不需要记住全部规则。通常只用下面几条命令：

| 现在想做什么 | 命令 |
| :--- | :--- |
| 看看任务走到哪一步 | `sdd next <项目目录>` |
| 回到任务上下文 | `sdd resume <项目目录>` |
| 检查任务是否完整 | `sdd validate <项目目录> --archive-ready` |
| 让 AI 从问题处重新检查 | `sdd challenge <项目目录>` |
| 记录本次可复用的经验 | `sdd new-learning <项目目录>` |
| 基于旧任务继续修复 | `sdd reopen <项目目录> <任务名> --defect "问题说明"` |
| 在浏览器里查看项目全貌 | `sdd console <项目目录>` |

`validate --archive-ready` 只负责检查“是否准备好了”。真正归档前，系统仍会要求当前用户明确授权；它不会把“检查通过”当成授权。

## 它会生成什么

每个任务会在 `mydocs/` 下留下几份文件。它们不是额外的表格工作，而是为了让你和 AI 在同一份事实之上协作：

| 文件 | 用人话说，它记录什么 |
| :--- | :--- |
| Spec | 这次到底要做什么，以及什么时候可以开始、什么时候算完成。 |
| Design | 方案为什么这样选。小任务可以不单独写。 |
| Execute Log | 实际做了哪些步骤，跑了什么验证，途中有没有偏差。 |
| Learning Record | 这次踩到的坑，下次遇到类似情况怎么少走弯路。 |

完成的任务会移到 `mydocs/archive/`。之后发现问题，可以从归档任务重新开一条修复任务，而不是重新讲一遍背景。

## 选择合适的任务大小

初始化或创建任务时，可以选择三种轻重：

| 模式 | 什么时候用 |
| :--- | :--- |
| `micro` | 文案、小缺陷、低风险配置等很小的改动。 |
| `lite` | 目标明确、影响有限的日常开发任务。 |
| `standard` | 新功能、重构、跨模块改动，或安全、权限、数据迁移等高风险任务。 |

拿不准时，先选 `lite`；任务越复杂，越值得把方案和验证写清楚。

## 需要时再打开的能力

下面这些能力都不是第一次使用的前提。遇到对应场景时再看即可：

- **Project Profile**：接手已有项目、需要让 AI 先了解前端/后端/模块关系时使用。它只读取工程事实，不会替你安装依赖或执行项目脚本。
- **Quality Plan**：想知道某个任务应该重点验证什么、已有测试和验收标准怎么对应时使用。
- **Verification**：需要把端到端验证结果保留下来时，为项目配置具名的验证方式，再生成独立运行记录。
- **Visual**：界面需要按截图、设计稿或视觉基线验收时使用；没有明确视觉验收需求时，不必启用。

Quality Plan 是只读解释器：运行 `sdd quality plan <project-dir>`。AC 是唯一验收真相；它会在读取候选内容前确认候选属于项目内目标，也不会绕过该边界读取候选 frontmatter；它不创建第二套验收标准或第二套门禁。它不会初始化 Provider、安装依赖或运行验证。

视觉任务会先由精确 Profile / `affected-units` 确定 `ui-impact`；不明确时 AI 只问一次。前端或混合任务用 `sdd visual select` 记录一次 `visual-context-intent`，再用 `sdd visual discover` 发现本地材料。Figma URL 只作为普通 URL 引用记录，不联网读取；系统不自动批准材料，也不启动浏览器或执行截图 diff。

这些能力的使用场景和步骤在 [GUIDE.md](./GUIDE.md)，精确字段与安全边界在 [REFERENCE.md](./REFERENCE.md)。

## 安装、更新与 AI Skill

安装后可以先检查命令是否可用：

```text
sdd --version
where sdd
```

如果你使用 Codex、Claude 或 OpenCode，还可以把配套的工作流说明装进对应的 AI 环境：

```text
sdd install-skill --target codex
```

更新时重新安装并刷新 Skill 即可：

```text
npm install -g https://github.com/arsterliu/sdd-riper.git
sdd install-skill --target codex --clean
```

也可以把 `codex` 换成 `cc-switch`、`claude`、`opencode` 或 `all`。如果只是想检查已安装内容是否过期，使用：

```text
sdd install-skill --target codex --check
```

## 文件放在哪里

```text
<project>/
├── .sdd-config        # 项目设置
├── AGENTS.md / CLAUDE.md
└── mydocs/
    ├── specs/         # 正在进行的任务
    ├── design/        # 方案说明
    ├── logs/          # 实际执行记录
    ├── learnings/     # 可复用经验
    ├── runs/          # 验证或巡航的运行记录
    ├── context/       # PRD、截图、说明等原始材料
    └── archive/       # 已完成的任务
```

## 还想深入了解？

| 文档 | 适合什么时候读 |
| :--- | :--- |
| [GUIDE.md](./GUIDE.md) | 想按实际场景了解怎么开始、确认、执行、修复和归档，或何时启用高级能力。 |
| [REFERENCE.md](./REFERENCE.md) | 需要查精确字段、门禁、安全边界、调度规则或完整命令时。 |
| [TEAM-GUIDE.md](./TEAM-GUIDE.md) | 想在团队里推广、分工或配置自动化时。 |
| [INTEGRATIONS.md](./INTEGRATIONS.md) | 维护工具本身，或需要了解它如何与其他 agent 工作流配合时。 |
| `SKILL.md` 与 `protocols/` | 为 AI agent 准备的精确工作规则；日常使用不需要从头通读。 |

如果你是第一次使用，到这里就够了：创建一个小任务，运行 `sdd next`，按提示往下走。
