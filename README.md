# SDD-RIPER

> 让人和 AI 在同一条可检查的任务链上协作：先说清目标，再设计、执行、验证、复查和归档。

SDD-RIPER 是一套面向 AI 协作开发的控制协议。它把需求、设计、计划、执行证据和经验连接起来，让一次开发任务不会只剩聊天记录。日常使用时，你主要和 AI 对话；精确字段、门禁和底层操作留给协议与工具处理。

它适合功能开发、缺陷修复、重构、文档调整，以及任何需要保留决策和验证依据的工作。

## 三分钟开始：先向 AI 描述目标

先告诉 AI 你的目标，让 AI 带你开始。你可以直接复制下面这段，并替换五项内容：

```text
请用 SDD-RIPER 帮我开始一个任务：
- 版本：v1.0
- 任务名：login-page
- 目标：完成登录页，并保留可验证的登录流程
- 参考资料：无
- 协作方式：请根据风险推荐，并让我确认
```

AI 会先确认版本、任务名、目标、参考资料和协作方式，不会静默替你决定。随后它会研究当前工程、说明范围与风险，并告诉你下一步需要确认什么。

任务形状也由 Agent 根据风险推荐：低风险、单点且可逆的改动通常用 `micro`；影响有限但需要独立设计说明的任务可用 `lite`；跨模块、公开接口、安全、权限、迁移或不可逆任务用 `standard`。你只需确认推荐是否符合实际风险，不必先学会选择模式。

创建 Spec 前，AI 会主动询问并呈现 `auto`、`supervised`、`human` 三种协作方式，解释差别并推荐 `supervised`，再由你选择。项目默认值只能作为推荐，不能静默替你选择；如果你已经明确指定了协作方式，AI 会复述并请你确认，不再重复询问。

如果尚未安装，需要 Node.js 18 或更高版本。安装并把配套 Skill 登记到 Codex：

```text
npm install -g https://github.com/arsterliu/sdd-riper.git
sdd install-skill --target codex
```

使用其他受支持的 AI 环境时，把 `codex` 换成对应目标。完成后，回到对话中提交上面的任务描述即可。

## 日常怎么用

一次任务通常沿着这条路径前进：

1. 你描述目标、边界和参考资料。
2. `standard` / `lite` 任务由 AI 研究现状并形成相应方案；`micro` 跳过 Research、Innovate 和独立 Design，直接准备 Plan。
3. AI 给出可验证的 Plan，满足批准门禁后才执行。
4. AI 按 Plan 修改，并在 Execute Log 中记录实际结果和验证证据。
5. AI 做 Challenge 对抗检查；`standard` / `lite` 使用可审计的独立 reviewer，`micro` 可以使用 `inline`，失败时回到对应阶段修复。
6. 准备就绪后，AI 再单独请求本次归档授权。

协作方式决定 AI 在哪些治理节点停下：

- `auto`：你确认任务范围和风险并授权后，AI 可在授权范围内持续推进到归档前。
- `supervised`：你先看 Plan。Plan Approval 只表示计划获准执行；后续持续自动推进还需要一份独立、明确的授权。
- `human`：AI 在关键治理节点逐次请你确认，普通计划内修改和测试不逐行打扰。

### AI 会自动判断何时使用配套能力

每个新 Spec 先用它绑定的精确 Project Profile 和 `affected-units` 判断是否影响 UI；证据不足时，AI 才问一次。AI 可主动使用的只读辅助仅限 Project Profile 的检测与读取、Quality Plan，以及 `visual discover` / `visual inspect`。它们只帮助理解工程、测试重点和已有视觉材料，不改变 AC，也不运行验证。

视觉语境里的 `baseline`，是当前 Spec 冻结且经当前用户认可的目标 UI PNG，不是跨 Spec 历史基线库。新 Spec 可以直接采用最新 UI PNG，旧页面截图只是可选 Context；候选图和项目默认图片都不代表人工认可。AI 会说明这张目标图能否与开发后的页面截图做严格像素比较：只有 baseline PNG 与 current screenshot 的像素宽度和高度分别完全一致，且其余精确条件成立时才推荐 `fidelity`，否则推荐 `direction`。完整条件见 [REFERENCE：Visual Context Guidance](./REFERENCE.md#visual-context-guidance按需)。

Provider 的初始化或运行、E2E 与 `sdd verify visual` 都是可执行操作，不属于上述只读辅助；它们只能在 Plan 获批后的 Execute 阶段显式运行。严格视觉合同仍须当前用户显式执行 `sdd visual init ...` 启用，流程不会自动创建、生成、批准、替换、版本化或管理 baseline，也不会自动安装依赖或浏览器。

无论采用哪种方式，以下情况始终单独停机：

- 最终归档；
- 确认 Project Profile 的精确摘要与 digest；
- E2E 无法运行而准备把结果记为 `SKIPPED`；
- 启用严格视觉证据、批准或变更视觉 baseline；
- 不可逆操作；
- 扩大任务范围或出现新风险；
- 需要平台权限或外部系统授权。

归档和旧版制品只读。它们可以查看，也可以作为新修复任务的来源，但不会被静默迁移或改写。

Figma 链接只当普通链接记录，不联网读取、不自动批准、不启动浏览器，也不做截图对比。Provider、合同、baseline 或代码状态变化会让旧结果变为 `stale`；视觉证据仍按任务自己的 AC 与 Execute Log 判断，不额外增加 Archive Gate。

按实际场景了解“你提供什么、AI 做什么、什么时候停、怎样算完成”，请看 [GUIDE.md](./GUIDE.md)。精确协议见 [REFERENCE.md](./REFERENCE.md)。

## 它会留下什么

| 制品 | 用人话说 |
| :--- | :--- |
| Spec | 当前任务的目标、范围、验收、Plan、批准和阶段状态。 |
| Design | `standard` / `lite` 任务为何选择该方案，以及接口、数据、兼容性和验证设计。 |
| Execute Log | 实际执行过的步骤、验证结果与偏差，按事实追加。 |
| Learning Record | 从偏差、修复或审查关注点中提炼出的可复用规则。 |

Spec 是任务控制面，并引用其他制品；Plan 不能替代 Design，聊天记录也不能替代 Execute Log。完成的任务进入归档后保持历史只读；若以后发现缺陷，创建新的修复任务并引用旧记录。

## 安装、更新与检查

安装完成后，如果你需要确认工具和 Skill 是否可用，可以在这个具体自查场景运行：

```text
sdd --version
sdd install-skill --target codex --check
```

更新时重新安装并刷新 Skill：

```text
npm install -g https://github.com/arsterliu/sdd-riper.git
sdd install-skill --target codex --clean
```

也可以把 `codex` 换成 `cc-switch`、`claude`、`opencode` 或 `all`。

## 还想深入了解？

| 文档 | 适合什么时候读 |
| :--- | :--- |
| [GUIDE.md](./GUIDE.md) | 按五个真实场景了解如何开始、确认、执行、修复和归档。 |
| [REFERENCE.md](./REFERENCE.md) | 查精确字段、门禁、安全边界、调度规则和完整命令。 |
| [TEAM-GUIDE.md](./TEAM-GUIDE.md) | 在团队里推广、分工或配置自动化。 |
| [INTEGRATIONS.md](./INTEGRATIONS.md) | 维护工具，或理解它与其他 agent 工作流的集成。 |
| `SKILL.md` 与 `protocols/` | AI agent 使用的精确执行规则；普通用户无需从头通读。 |
