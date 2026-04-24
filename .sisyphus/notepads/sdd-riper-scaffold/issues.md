# Issues

（暂无）

## 2026-04-17 F4 范围合规检查
- `sdd.sh --help` 暴露了第 7 个子命令 `_gen_ai_configs`，与计划要求的 6 个对外子命令不符。
- `protocols/sdd-riper-one.md` 缺少计划要求的 Archive 阶段自由度表，以及 `create_codemap` / `build_context_bundle` / `sdd_bootstrap` 的显式命令说明。
- `protocols/sdd-riper-one-light.md` 缺少对五阶段的完整精简描述与 requirement/context 更完整约束，且 Archive 段落与计划中的双归档要求不完全一致。
- `bin/new-projectmap.sh` 依赖 `python3` 回写 repos frontmatter，违反“无外部依赖 Shell CLI”约束；脚本内还出现空路径占位与回退注释逻辑，未严格保证 frontmatter 结构。
- `bin/status.sh` 仅检查 3 个 AI 配置文件，未校验 `.github/copilot-instructions.md`；并使用 `find/head/sed` 等实现，且对内容 WARN 的范围未完整覆盖计划中的约定检查。
- `examples/*` 下 AI 配置文件为简短手写内容，未体现由 `_gen_ai_configs.sh` 单一规范源生成，也缺少 `Plan Approved` / `RIPER` / `ProjectMap` 等关键内容。
- `tests/` 覆盖面不足：缺少各命令 rerun/conflict/happy path 的全量覆盖，`test_status.sh` 未覆盖 WARN-only 内容检查，`test_archive.sh` 无缺失 spec/多匹配场景，`run_all.sh` 也未做统一清理。
- 仓库存在计划外文件 `test-status.ps1`，属于额外范围产物。
- 复检确认：`test-status.ps1` 已删除，`bin/new-projectmap.sh` 已改为纯 bash+awk，无 `python3` 依赖。
- 当前阻塞项仍包括：`sdd.sh` 仍把 `_gen_ai_configs` 作为可调度命令暴露；协议文件与测试覆盖仍未完全满足计划要求；当前环境无 `bash` 可执行文件，无法直接复跑 `sdd.sh --help` 与 `tests/run_all.sh` 做功能验证。
