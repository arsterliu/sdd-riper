# SDD-RIPER 使用指南

这份指南只按实际任务场景组织。你不必先背术语或命令；找到自己所在的场景，告诉 AI 必要信息，再看它何时会停下来请你决定。

如果还没有安装，先看 [README 的“三分钟开始”](./README.md#三分钟开始先向-ai-描述目标)。精确字段、门禁、安全边界和完整命令都在 [REFERENCE.md](./REFERENCE.md)。

## 先看你现在要做什么

| 你现在的情况 | 从哪里开始 |
| :--- | :--- |
| 第一次使用，或准备开始新工作 | [场景一：开始一个新任务](#场景一开始一个新任务) |
| 任务制品已就绪，等你确认方案、验收和 Plan | [场景二：确认方案和计划](#场景二确认方案和计划) |
| Plan 已可执行，准备修改和验证 | [场景三：执行和验证](#场景三执行和验证) |
| 测试失败、审查不过或任务跑偏 | [场景四：任务卡住或检查失败](#场景四任务卡住或检查失败) |
| 结果完成，准备收尾 | [场景五：完成与归档](#场景五完成与归档) |

协作方式与任务形状是两件事。`auto`、`supervised`、`human` 决定 AI 何时停下来；`micro`、`lite`、`standard` 决定任务需要多完整的研究和设计。创建任务时，Agent 会按风险推荐任务形状，并让你确认。

`supervised` 尤其要分清两个决定：Plan Approval 表示“这个计划可以执行”，后续持续授权表示“AI 可以在这份 Plan 和风险边界内连续推进”。前者不会自动推出后者。

创建 Spec 前，AI 必须主动询问并依次呈现 `auto`、`supervised`、`human` 三种协作方式，解释差别，推荐 `supervised` 后由你选择。项目默认值只提供推荐，不能静默代选；如果你已经明确指定，AI 会复述并请你确认，不再重复询问。

## 场景一：开始一个新任务

### 用户输入

提供或确认五项信息：

- 版本，例如 `v1.0`；
- 任务名，例如 `login-page`；
- 目标，也就是希望最终解决的问题；
- 参考资料，包括本地文档、图片、设计稿或 URL，没有就说“无”；
- 协作方式：从 AI 主动呈现的 `auto`、`supervised`、`human` 中选择；AI 会推荐 `supervised`，但由你确认。

### AI 动作

AI 先确认这五项，创建 Spec，并按风险推荐 `micro`、`lite` 或 `standard`。`standard` / `lite` 进入 Research，读取参考资料和工程约定，明确做什么、不做什么、影响范围与验收意图；`micro` 跳过 Research、Innovate 和独立 Design，直接进入 Plan。

接手已有工程时，AI 可以用只读的 Project Profile（工程画像）快速了解技术栈和工程单元，不会安装任何东西。

每个新 Spec 还会先用绑定的精确 Profile 和 `affected-units` 推导 `ui-impact`；证据仍不足时只问一次是否影响界面。前端或混合任务必须在 Plan 前通过 Visual 指引确定一次 `visual-context-intent`：`not-required`、`direction` 或 `fidelity`。Context 中的图片、文档和 URL 会被只读发现，无需你先手选能力。

界面任务可以直接把最新 UI PNG 交给 AI；经当前用户认可后，它会冻结为当前 Spec 的目标图。旧页面截图只是可选 Context，不必为了开始严格视觉验证而补做。AI 会先判断目标图能否与开发后的页面截图稳定地逐像素比较并说明理由：能满足严格比较条件时推荐 `fidelity`，否则推荐 `direction`。候选图和项目默认图片都不能替代当前用户认可。

### 何时停下

版本、任务名、参考资料或协作方式未确认时，AI 必须停下询问。需要工程画像确认时，AI 会展示 Project Profile 的精确摘要与 digest，并针对该摘要单独请求当前用户授权。涉及平台权限、不可逆动作、范围扩大或新风险，也会停下说明影响。

### 完成标志

Spec 已绑定正确的上下文，当前任务制品能用人话说明任务边界、风险、验收意图和下一步；历史归档与 legacy 制品仍保持只读，没有被静默迁移。

### 可选自查

如果你想自己检查当前阶段，可以运行 `sdd next <项目目录>`。

精确规则见 [REFERENCE：RIPER 流程](./REFERENCE.md#三riper-流程) 与 [REFERENCE：Project Engineering Profile](./REFERENCE.md#project-engineering-profile)。

## 场景二：确认方案和计划

### 用户输入

回答会改变方案的问题：范围外内容、公开接口或数据是否可变、必须保留的行为、不可接受的风险，以及怎样才算完成。你不需要手工填写协议字段。

### AI 动作

AI 根据任务形状完成必要的方案比较、Design 和验收标准，再生成逐步可验证的 Plan。跨多个工程单元时，AI 会用只读的 Quality Plan 告诉你每条验收标准该由哪类测试覆盖；AC 是唯一验收真相，这个建议不会改变它。想自己看原始建议，可运行 `sdd quality plan <项目目录>`。

需要独立 Research reviewer 时，只有本次任务的新鲜授权明确包含该 reviewer actor，AI 才能启动；否则先请求当前用户授权。

### 何时停下

存在未决需求、方案会扩大范围、出现新风险或需要不可逆决定时，AI 会停下。Plan 未满足批准门禁时不能进入 Execute。对于 `supervised`，即使 Plan 已由人批准，若还没有独立的后续持续授权，AI 也会在连续推进前再次询问。

Plan Approval 使用下面的完整矩阵：

| 协作方式 | Plan Approval |
| :--- | :--- |
| `auto` | 可由 `agent:<id>` 批准，但必须同时留下 `Approved At` 和可验证的 `Gate Evidence`。 |
| `supervised` | 必须由 `human:<name>` 批准，并记录 `Approved At`。 |
| `human` | 必须由 `human:<name>` 批准，并记录 `Approved At`。 |

无论哪一档，Plan Approval 都只解决 Plan 门禁，不能推导 reviewer 授权、后续持续自动推进授权或最终归档授权。

`auto` 的例外是：在你已确认当前任务范围和风险、并明确授权持续推进后，AI 会先记录主 Agent 与只读 reviewer 的任务授权；随后若 Agent 批准 Plan 且 scope、风险和 Plan 摘要仍一致，AI 自动记录 Plan 激活，不会再次向你索要 Plan 批准或 reviewer 授权。归档、范围扩大、新风险、不可逆操作、平台权限、Profile 摘要确认和 E2E 跳过仍单独停下。

### 完成标志

Design（如需要）、AC 和 Plan 相互对应；Plan 指明文件边界、具体改动与验证方法，并留下有效的 Plan Approval。若要持续推进，授权范围和风险快照也已明确。

### 可选自查

如果你想自己确认当前 Plan 是否已到可执行状态，可以运行：

```text
sdd next <项目目录>
```

精确规则见 [REFERENCE：Design / Acceptance](./REFERENCE.md#design--acceptance)、[REFERENCE：Plan](./REFERENCE.md#plan) 与 [REFERENCE：Quality Policy Routing](./REFERENCE.md#quality-policy-routing)。

## 场景三：执行和验证

### 用户输入

通常无需重复任务。只有出现真实取舍、需要人工验收、需要平台权限，或验证环境确实不可用时，AI 才需要你的决定。

### AI 动作

AI 按 Plan 修改，并把每一步结果、AC Coverage、测试路径和偏差写入 Execute Log。失败时先找根因再重试。

端到端验证（`Verification: e2e`）需要项目里配置好的验证环境（Provider）。环境缺少依赖或浏览器时，AI 会报告并停下，不会自动安装或降级。界面任务按你提供的参考材料处理视觉部分；Figma 链接只当普通链接记录，不联网读取、不自动批准、不启动浏览器，也不做截图对比。

当前用户认可目标图并显式运行 `sdd visual init ... --mode fidelity|direction` 后，严格视觉合同才会生效。开发完成后，获批的 `fidelity` 流程在 Plan 获批的 Execute 阶段显式运行独立视觉 Provider，生成同一页面状态的 current screenshot；它的像素宽度和高度必须分别与 baseline PNG 完全一致，才能执行截图差异验证。若选择 `direction`，首版页面截图仍通过任务自己的 manual AC 与 Execute Log 补齐。

Provider、工作区、配置、合同、baseline 或代码状态变化时，已有结果会标为 `stale`，不能沿用为本次证据。AI 不得创建、生成、批准、替换、版本化或管理 baseline；需要初始化 Provider、运行视觉验证、安装依赖或浏览器时，也必须遵守获批 Execute 与平台权限边界。

### 何时停下

E2E 环境不可用时，AI 先尝试修复；若准备跳过 E2E 并记为 `SKIPPED`，必须说明原因并取得当前用户批准，不能自行决定。启用 strict visual、批准或替换 baseline、运行需要平台权限的操作、不可逆动作、范围扩大或出现新风险时，也必须停下。

### 完成标志

每个 Plan 步骤有真实结果，每条相关 AC 有可追溯证据；E2E 结果来自声明的 Provider，视觉结论没有伪造 baseline 或截图 diff，最终四轴自查已写入 Execute Log。Visual 合同本身不新增 Archive Gate；缺少的视觉证据通过任务自身的 manual AC 与 Execute Log 暴露和补齐。

### 可选自查

如果你想自己查看执行记录是否完整，可以运行：

```text
sdd validate <项目目录>
```

精确规则见 [REFERENCE：Execute](./REFERENCE.md#execute)、[REFERENCE：Verification Provider](./REFERENCE.md#verification-provider) 与 [REFERENCE：Visual Context Guidance](./REFERENCE.md#visual-context-guidance按需)。

## 场景四：任务卡住或检查失败

### 用户输入

补充与失败有关的环境事实或业务判断。不要为了尽快通过而同意伪造测试、截图、批准、baseline 或审查证据。

### AI 动作

AI 先 Debug 根因，再判断应回到 Research、Design、Acceptance、Plan、Execute、Execute Log 或 Learning Check。Challenge 是只读的对抗审查；Cruise 只负责有界路由和修复次数，不让 reviewer 修改实现，也不绕过门禁。

### 何时停下

修复超出原 Plan、扩大范围、引入新风险、需要不可逆操作或平台权限时必须停下。要启动未被本次新鲜授权覆盖的独立 reviewer，也必须先询问。失败证据不会被删除或改写来制造通过结果。

### 完成标志

根因和回跳阶段明确，修复经过重新验证，Execute Log 忠实记录偏差；历史记录和已归档制品保持只读。若形成可复用规则，已创建 Learning Record。

### 可选自查

如果你想自己查看协议建议回到哪里，可以运行：

```text
sdd next <项目目录>
```

精确规则见 [REFERENCE：Challenge](./REFERENCE.md#challenge对抗评审) 与 [REFERENCE：Cruise](./REFERENCE.md#cruise自主巡航)。

## 场景五：完成与归档

### 用户输入

确认结果符合目标。系统明确提示请求归档授权后，你需要针对当前这一次归档给出清楚同意；以前的 Plan Approval、持续授权、测试通过或 Challenge PASS 都不能代替。

### AI 动作

AI 先检查 Spec、Design、Execute Log、AC Coverage、Challenge 和必要的 Learning Record。检查通过只表示“已具备归档条件”。AI 不得自行构造授权参数，也不能把任何旧授权解释成本次归档许可。

### 何时停下

出现 `request_archive_authorization` 时必须停下，等待当前用户明确授权。E2E 若仍是未经人工批准的 `SKIPPED`，或视觉证据缺口导致任务自己的 AC / Execute Log 未完成，任务尚未具备归档条件；这不是 Visual 新增的 Archive Gate。出现新风险或还需要平台权限时也必须停下。

### 完成标志

得到本次明确授权后，任务及其引用制品进入归档。归档与 legacy 历史继续只读；以后发现缺陷时创建新的 reopen 修复任务，不静默改写旧记录。

### 可选自查

如果你想自己检查是否“准备好归档”，可以运行下面的只读检查；它不代表归档授权：

```text
sdd validate <项目目录> --archive-ready
```

精确规则见 [REFERENCE：Archive / Reopen](./REFERENCE.md#archive--reopen)。

如果你只想完成任务，到这里已经足够。需要查完整命令或机器可验证的字段时，再进入 [REFERENCE.md](./REFERENCE.md)；团队推广与角色分工见 [TEAM-GUIDE.md](./TEAM-GUIDE.md)。
