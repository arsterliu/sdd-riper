# Evidence Execute Log

## TL;DR

> **Quick Summary**: 让 `mydocs/evidence/` 真正发挥作用——SKILL.md Execute 阶段规定 AI 必须写入执行日志，`review-execute.sh` 读取该日志作为第三轴，并同步修复 spec 版本选择逻辑。
>
> **Deliverables**:
> - `SKILL.md` Execute Phase: 强制日志写入规则
> - `SKILL.md` review-execute 触发方式: 自动注入 `--log` 路径
> - `bin/review-execute.sh`: 版本化 spec 选择 + 自动推断 log 路径 + tail-100
> - 安装副本同步
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — Task 1 (SKILL.md) 和 Task 2 (review-execute.sh) 可并行
> **Critical Path**: Task 1 + Task 2 → Task 3 (sync) → F1 (QA)

---

## Context

### Original Request
`evidence/` 目录实际为空目录占位，用户希望让 AI 在 Execute 阶段真正写入执行证据，并让 `review-execute` 读取作为第三轴。

### Decisions Made
| Decision | Value |
|---|---|
| 日志路径 | `mydocs/evidence/v{N}.{M}-{task-name}/execute.log` （带版本号，每个 Spec 版本独立） |
| 写入方式 | append only，不覆盖 |
| 缺少 `--log` 时 | 自动推断路径；文件不存在则输出提示并继续（软降级） |
| log 截断方向 | `tail -100`（最新步骤优先） |
| review-execute spec 选择 | 与 resume 完全一致的版本化选择逻辑 |
| 范围 | 仅 SKILL.md + bin/review-execute.sh |

### Log Entry Format (per step)
```
---
Step N: {步骤描述}
Status: DONE | DEVIATED | BLOCKED
Output: {命令输出摘要或关键变更，单行或多行短摘要}
Deviation: {若有偏差，说明原因} | none
Timestamp: {ISO 8601, e.g. 2026-04-20T10:30:00Z}
---
```

### Metis Review — Identified Gaps (addressed)
- **log 路径带版本号**: `evidence/v1.1-user-login/execute.log`（非 `evidence/user-login/`）
- **--log 缺失**: 自动推断 + 软降级，非硬错误
- **tail vs head**: 改为 tail-100 取最新步骤
- **spec 选择**: review-execute.sh 需与 resume 保持一致
- **append-only**: 多次 resume 追加，不清空

---

## Work Objectives

### Core Objective
通过两处改动，让 `evidence/` 真正存储执行证据，并让 `review-execute` 以此作为第三轴输入。

### Concrete Deliverables
- `SKILL.md:141-150` Execute Phase 新增强制日志写入规则
- `SKILL.md:203-206` review-execute 触发示例更新
- `bin/review-execute.sh` 三处修改：版本化 spec 选择 / log 自动推断 / tail-100

### Must Have
- AI 在 Execute 每步完成后写入 `evidence/{spec-slug}/execute.log`（append）
- review-execute 自动推断 log 路径（基于当前 spec slug）
- review-execute spec 选择与 resume 版本化逻辑一致
- tail-100 替换 head-100

### Must NOT Have (Guardrails)
- 不新增 CLI 命令或参数
- 不改动 diff 轴语义（`git diff HEAD~1 HEAD`）
- 不改动 discover / archive / resume / debug 等其他脚本
- 不做历史 evidence 迁移
- 不改动 Spec 模板内容

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO
- **Automated tests**: None
- **Agent-Executed QA**: YES（bash 命令验证）

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (并行):
├── Task 1: 更新 SKILL.md [quick]
└── Task 2: 更新 bin/review-execute.sh [quick]

Wave 2 (串行):
└── Task 3: 同步安装副本 [quick]

Wave FINAL:
└── F1: QA 验证 [unspecified-high]
```

---

## TODOs

---

## Final Verification Wave

- [ ] F1. **QA 验证** — `unspecified-high`

  在 Git Bash 中对临时项目执行以下场景，全部 PASS 才通过：

  ```
  Scenario 1: SKILL.md Execute Phase 包含日志写入规则
    grep -n "execute.log\|Step N\|DEVIATED" SKILL.md
    PASS if: 至少 3 处匹配

  Scenario 2: SKILL.md review-execute 触发示例含 --log
    grep -n "\-\-log" SKILL.md
    PASS if: 至少 2 处匹配

  Scenario 3: review-execute.sh 使用 tail 而非 head 读 log
    grep -n "tail\|head" bin/review-execute.sh
    PASS if: tail 出现，head -100 不再用于 LOG 读取

  Scenario 4: review-execute.sh 自动推断 log 路径
    grep -n "evidence\|LOG_PATH\|spec.*slug\|SPEC_SLUG" bin/review-execute.sh
    PASS if: evidence 路径推断逻辑存在

  Scenario 5: review-execute 无 --log 时软降级
    bash sdd.sh review-execute /tmp/sdd-qa-test 2>&1 | grep -i "execute log\|evidence\|not found"
    PASS if: 输出包含提示信息且 exit 0

  Scenario 6: review-execute --log 有效时第三轴读取外部日志
    mkdir -p /tmp/sdd-qa-test/mydocs/evidence/v1.0-user-login
    printf -- "---\nStep 1: add login\nStatus: DONE\nOutput: created auth.ts\nDeviation: none\nTimestamp: 2026-04-20T10:00:00Z\n---\n" > /tmp/sdd-qa-test/mydocs/evidence/v1.0-user-login/execute.log
    bash sdd.sh review-execute /tmp/sdd-qa-test --log /tmp/sdd-qa-test/mydocs/evidence/v1.0-user-login/execute.log | grep "Step 1"
    PASS if: 输出包含 "Step 1"

  Scenario 7: 安装副本同步验证
    Select-String -Path "C:\Users\liuyl\.config\opencode\skills\sdd-riper\bin\review-execute.sh" -Pattern "tail|evidence"
    PASS if: 两个 pattern 均有匹配
  ```

  Evidence: `.sisyphus/evidence/final-qa/evidence-log-qa.txt`

---

## Commit Strategy
- Single commit: `feat(evidence): AI writes execute log, review-execute reads as axis 3`
- Files: `SKILL.md`, `bin/review-execute.sh`

## Success Criteria
- Execute Phase 规则中明确要求写 `evidence/{spec-slug}/execute.log`
- review-execute 自动推断 log 路径，缺失时软降级
- review-execute spec 选择与 resume 一致
- tail-100 替换 head-100
- 安装副本同步
