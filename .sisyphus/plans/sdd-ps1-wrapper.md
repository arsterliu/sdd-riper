# sdd.ps1 — Windows PowerShell 薄包装计划

## TL;DR

> **Quick Summary**: 在 repo 根目录新增 `sdd.ps1`，让 Windows 用户无需手动打开 Git Bash，直接在 PowerShell / Terminal 中调用 `.\sdd.ps1 <cmd>`。同时在 README § 前置条件中补充说明。
>
> **Deliverables**:
> - `sdd.ps1` — PowerShell 入口，自动定位 Git Bash 并透传所有参数给 `sdd.sh`
> - `README.md` — § 2 前置条件补充 `sdd.ps1` 使用说明
>
> **Estimated Effort**: Quick（< 1小时）
> **Parallel Execution**: YES — 两个任务可并行
> **Critical Path**: T1(sdd.ps1) → 手动验证

---

## Context

### Original Request
保持现有 bash 脚本不变，补一个 PowerShell 薄包装解决 Windows 直接调用问题。

### Decisions
- **WSL fallback**: 不需要，仅支持 Git Bash
- **自动化测试**: 不加（逻辑极简，手动验证即可）
- **bash 脚本**: 完全不动，sdd.ps1 只是入口

---

## Work Objectives

### Core Objective
Windows 用户在 PowerShell 中执行 `.\sdd.ps1 init my-project` 与在 Git Bash 中执行 `bash sdd.sh init my-project` 效果完全一致。

### Concrete Deliverables
- `sdd.ps1`（repo 根目录，与 `sdd.sh` 同级）
- `README.md`（§ 2 补充 Windows 使用方式）

### Must Have
- 自动探测 Git Bash 路径（至少覆盖 3 个常见安装位置 + PATH）
- 路径正确转换为 MINGW 格式（`C:\foo\bar` → `/c/foo/bar`）
- 全部参数透传（`@args`）
- exit code 完整传递（`exit $LASTEXITCODE`）
- Git Bash 未找到时：打印明确错误信息 + 安装链接，exit 1
- `sdd.sh` 不存在时：打印明确错误信息，exit 1

### Must NOT Have
- 不触碰 `sdd.sh` 及任何 `bin/*.sh`
- 不加 WSL 探测逻辑
- 不引入任何外部依赖

---

## TODOs

- [x] 1. 新建 `sdd.ps1`

  **What to do**:

  在 repo 根目录创建 `sdd.ps1`，内容逻辑如下：

  **Git Bash 探测顺序**（依次尝试，找到第一个存在的）：
  1. `"$env:ProgramFiles\Git\bin\bash.exe"`
  2. `"${env:ProgramFiles(x86)}\Git\bin\bash.exe"`
  3. `"$env:LocalAppData\Programs\Git\bin\bash.exe"`
  4. `(Get-Command bash.exe -ErrorAction SilentlyContinue).Source`（PATH 中查找）

  **路径转换**：将 `$PSScriptRoot`（Windows 格式）转为 MINGW Unix 路径：
  - `C:\Users\foo\sdd-riper` → `/c/Users/foo/sdd-riper`
  - 规则：取盘符小写，去掉 `:`，替换 `\` 为 `/`，拼 `/sdd.sh`

  **执行**：
  ```powershell
  & $bash $sddShUnix @args
  exit $LASTEXITCODE
  ```

  **错误处理**：
  - Git Bash 未找到 → `Write-Host "[ERROR] Git Bash not found. Install Git for Windows: https://git-scm.com/download/win" -ForegroundColor Red; exit 1`
  - `sdd.sh` 路径不存在 → `Write-Host "[ERROR] sdd.sh not found at: $sddSh" -ForegroundColor Red; exit 1`

  **Must NOT do**:
  - 不要用 `Write-Error`（会产生 PS 错误对象，影响输出格式）
  - 不要 hardcode 路径（必须动态探测）
  - 不要 `Set-ExecutionPolicy`（用户自己管理）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 T2 并行）
  - **Blocks**: 验证步骤
  - **Blocked By**: None

  **References**:
  - `sdd.sh` 根目录位置（`sdd.ps1` 与之同级）
  - Git Bash 默认安装路径参考：`C:\Program Files\Git\bin\bash.exe`

  **Acceptance Criteria**:
  ```
  Scenario: 基本调用透传
    Tool: PowerShell
    Steps:
      1. .\sdd.ps1 --help
    Expected Result: 打印 sdd.sh 的 help 文本，exit 0

  Scenario: 参数透传
    Tool: PowerShell
    Steps:
      1. .\sdd.ps1 init .\tmp\ps1-test --mode lite
      2. Test-Path .\tmp\ps1-test\mydocs
    Expected Result: 目录创建成功，exit 0

  Scenario: 清理
    Steps:
      1. Remove-Item -Recurse -Force .\tmp\ps1-test
  ```

  **Commit**: YES（与 T2 一起提交）

- [x] 2. 更新 `README.md` — § 2 前置条件补充 `sdd.ps1`

  **What to do**:

  在 `## 2. 前置条件` 的 Windows 小节中，在现有内容**之后**追加：

  ```markdown
  - **PowerShell 用户（推荐）**：直接使用项目根目录的 `sdd.ps1` 包装脚本，无需手动打开 Git Bash：
    ```powershell
    .\sdd.ps1 init my-project
    .\sdd.ps1 new-spec my-project "my-feature"
    ```
    前置要求：已安装 [Git for Windows](https://git-scm.com/download/win)（`sdd.ps1` 会自动定位其内置的 Git Bash）。
  ```

  **Must NOT do**:
  - 不改现有正文任何其他内容
  - 不修改章节编号

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 T1 并行）
  - **Blocks**: None
  - **Blocked By**: None

  **Acceptance Criteria**:
  ```
  Scenario: README 包含 sdd.ps1 说明
    Tool: Bash/PowerShell
    Steps:
      1. grep -q "sdd.ps1" README.md && echo "PASS"
    Expected Result: PASS
  ```

  **Commit**: YES（与 T1 一起提交）

---

## Final Verification

手动验证（非自动化）：
```powershell
# 在 PowerShell 中执行：
.\sdd.ps1 --help
.\sdd.ps1 init .\tmp\ps1-test
Test-Path .\tmp\ps1-test\mydocs  # 应为 True
Remove-Item -Recurse -Force .\tmp\ps1-test
```

---

## Commit Strategy

```
feat(windows): add sdd.ps1 PowerShell wrapper for Git Bash auto-detection
```

Files: `sdd.ps1`, `README.md`

---

## Success Criteria

- `sdd.ps1` 存在于 repo 根目录
- Windows PowerShell 中 `.\sdd.ps1 --help` 输出与 `bash sdd.sh --help` 一致
- `.\sdd.ps1 init <dir>` 成功创建 `mydocs/` 结构
- README § 2 包含 `sdd.ps1` 使用说明
