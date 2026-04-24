# Learnings

## 项目约定
- 工作目录：D:\workspace\canway\other\sdd-riper
- Shell 脚本：bash（macOS/Linux）+ Git Bash/WSL（Windows）
- 文档语言：中文为主
- 目录结构：mydocs/（specs / codemap / context / archive / evidence）

## SDD-RIPER 核心规则
- 三铁律：No Spec No Code / Spec is Truth / Reverse Sync
- RIPER：Research → Innovate → Plan → Execute → Review
- Plan Approved 才能动手
- status 只做 WARN，不做硬门禁

## 双轨约定
- standard：中强治理，完整区块
- lite：极简治理，只保留最小约束
- 两者共享同一目录结构和命令接口

## 多平台 AI 配置
- 单一规范源：protocols/sdd-riper-one.md 或 protocols/sdd-riper-one-light.md
- 派生：AGENTS.md / CLAUDE.md / .cursorrules / .github/copilot-instructions.md

## Guardrails 分层原则
- standard 必须有：Restatement / Open Questions / Assumptions / Research Readiness Checklist / Innovate Options / Plan Approval / Execute Log / Review Summary
- lite 只需：Restatement / Open Questions / Micro Plan / Change Summary / Review Verdict
- status：只检查痕迹（是否为空），不判断质量，不做硬阻断

## Protocol Formulation Learnings
- **Markdown Directives**: Writing markdown files in instructional/directive Chinese language forces precise semantic alignment for the AI.
- **Micro-spec concept**: Utilizing a micro-spec with 5 required fields streamlines the requirement process for Fast mode.
- **Constraints Management**: Keeping line counts under 400 for standard and 150 for lite ensures high density and readability for both human and AI.


- Created document templates in templates/ directory for SDD-RIPER scaffold: spec.md, codemap.md, projectmap.md, context-bundle.md, archive-human.md, archive-llm.md
- When reading files in powershell on Windows to check for Chinese string matches, -Encoding UTF8 is required if files are saved as UTF-8 without BOM.

- Verified creation of SKILL.md for SDD-RIPER scaffold integration. Ensuring strict AskUserQuestion usage prevents the AI from auto-advancing phases, establishing the required human gate.
