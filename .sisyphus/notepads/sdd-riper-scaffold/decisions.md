# Decisions

## 2026-04-17 初始架构决策

- CLI 为 Shell 脚本，无外部依赖
- 冲突策略：默认 skip+warn，--force 覆盖
- 幂等性：所有命令安全重复执行
- ProjectMap 结构：Markdown + frontmatter（name/repos 字段）
- status exit code：0=OK / 1=缺失目录 / 2=broken projectmap / 3=参数错误
- status 内容检查：仅 WARN，不阻断
- 双轨共享目录结构，模板深度不同
- archive：不删除原 spec，只产出 _human.md + _llm.md

## Protocol Extraction Decisions
- **Unified Rules Extraction**: Combined all constraints and requirements from the context into clear markdown structures (headers, bold texts, lists).
- **Format Choices**: Selected specific markdown formats (e.g. _human.md and _llm.md) for Archive phases. Enforced the Plan Approved By gate with explicit language in the markdown files.

