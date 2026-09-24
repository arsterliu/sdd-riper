# Bounded Clarification Protocol

## Purpose

借鉴 [grill-me / grilling](https://github.com/mattpocock/skills/blob/main/skills/productivity/grilling/SKILL.md) 的决策依赖、推荐答案和查证事实方法，由 SDD 负责阶段、制品与门禁。本协议可直接使用，不需要安装或调用外部 skill，也不继承上游逐项人工决策、自动派发或额外确认流程。

## Trigger

仅当当前阶段存在影响范围、风险、验收或方案选择的阻塞问题时进入澄清。不要因为开始新阶段就重新访谈。

- 复用当前任务中用户已明确提供且仍有效的答案；信息发生冲突或失效时才重新询问。
- micro 无关键歧义时直接准备 Plan，不增加 Research、Innovate 或独立 Design。
- 可从代码、配置、文档或现有证据查到的事实，由 agent 查证；不要让用户替 agent 查资料。
- 查事实不自动派发子代理；是否委托遵循 `protocols/subagent-dispatch.md`，并满足对应授权条件。

## Decision Loop

1. 读取当前 Spec、已绑定 Context 及本阶段相关证据，列出尚未解决且会阻塞当前阶段的决策及依赖。
2. 先查事实，再按依赖次序处理决策。前置答案未确定时，不猜测下游决策；不同阶段已确认的同一问题不重复询问。
3. 只把当前授权内不能自行决定的问题交给用户。每题给出推荐答案和简短理由；有合理备选时提供可比较选项，允许自由回答。
4. 默认每轮一个关键问题；若多个缺口相互独立且合并能减少往返，可一并询问。不要为了穷尽设计树列出所有实现细节。
5. 将回答写回 Spec 的 Open Questions、Assumptions、Confirmed Requirement 或 Innovate Options；技术结论写入已有 `design-file`。不新建访谈纪要、第二份 Plan 或独立审批记录体系。
6. 重新判断本阶段是否仍存在阻塞决策；没有则退出，返回 SDD 下一步。

## Autonomy Boundary

- auto：在新鲜任务 / Plan 授权内，自行决定可逆实现细节并记录依据；不能静默推导必须由用户选择的 Spec 创建输入。不要把所有技术决策变成人工确认。
- supervised：准备具体 Plan，等待现有人工 Plan 批准；持续推进授权仍是独立事实，不因澄清结束而自动获得。
- human：在现有治理节点暂停；普通查证和计划内机械工作不增加逐项批准。
- 无论何种模式，范围扩大、新风险、不可逆动作、平台权限、Profile exact digest、E2E SKIPPED 和最终归档继续遵循各自专用人工停机规则。
- 澄清不能冒充 Research / Challenge 独立审查，也不能替代 Plan Approval。reviewer 仍须具备可审计身份及当前有效授权。

## Exit Criteria

当当前阶段的必要输入与阻塞决策已明确，且余下细节可在已授权范围内推导时，停止提问。将非阻塞假设明确记录；若假设会改变范围、风险或验收，仍属阻塞问题，不能以假设绕过。

退出只表示可以回到 SDD 阶段流程，不表示门禁已满足。缺少 `workflow-policy` 的旧 Spec 仍按 mode 保留方案、Design 和既定审查；`streamlined-v1` 仅在实质取舍或风险规则要求时强制 Design 与相应审查，AC 始终可验证。不要新增逐段设计批准、访谈完成批准或上游技能交接。

## Examples

- 用户已明确输入格式，代码也能确认输出消费者：直接查证并记录，不再询问格式，也不为了查证自动派发。
- 两种方案会改变公开接口兼容性，当前授权未覆盖：给出推荐与影响，等待用户决定，不能以 auto 为由自行扩大范围。
- micro 修改已有提示文案，范围与验收清楚：直接准备 Plan，保留原有 Plan 门禁与验证要求。
