---
project: sdd-riper
module: main
updated-at: 2026-06-29
last-reason: Auto-scanned by sdd init
---

<!--
CodeMap 是模块级活文档：跨任务复用，仅在架构事实变更时更新。
若以下任一维度发生变化，请同步更新 updated-at 与 last-reason。
-->

# main CodeMap

## 入口点（Entry Points）
- **CLI** (`bin/cli.js`)：`sdd init`、`sdd discover`、`sdd resume`、`sdd status`、`sdd doctor`、`sdd next`、`sdd challenge`、`sdd cruise`、`sdd console`、`sdd install-skill`、`sdd validate`、`sdd archive`、`sdd reopen`、`sdd new-learning`、`sdd review-execute`、`sdd learnings`、`sdd create-codemap`、`sdd build-context-bundle`、`sdd debug`、`sdd create-projectmap`、`sdd new-codemap`、`sdd new-projectmap`

## 模块边界（Module Boundaries）
- **bin/cli.js**：1 个文件
- **lib/common.js**：1 个文件
- **src/commands**：24 个文件
- **src/core**：6 个文件
- **src/web**：2 个文件
- **vendored/superpowers**：1 个文件

## 关键组件（Key Components）
- `bin/cli.js`
- `lib/common.js` → `getConfigFile`, `readConfigValue`, `isValidDocsDirName`, `getDocsDir`, `getDocsRoot`, `getMode`, `getGatePolicy`, `getCruisePolicy`, `getCruiseMaxIterations`, `getSpecTemplate`, `versionExists`, `findLatestSpec`, `extractSection`, `sectionIsEmpty`, `subsectionIsEmpty`, `findSourceSpec`, `getFrontmatterField`, `resolveProjectPath`, `relativeToProject`, `normalizeSlug`, `shouldSuggestCodeMap`, `SCAFFOLD_ROOT` — shared utility library
- `src/commands/archive.js` — CLI command handler
- `src/commands/build-context-bundle.js` — CLI command handler
- `src/commands/challenge.js` — CLI command handler
- `src/commands/console.js` → `createServer` — CLI command handler
- `src/commands/create-codemap.js` — CLI command handler
- `src/commands/create-projectmap.js` — CLI command handler
- `src/commands/cruise.js` — CLI command handler
- `src/commands/debug.js` — CLI command handler
- `src/commands/discover.js` — CLI command handler
- `src/commands/doctor.js` — CLI command handler
- `src/commands/init.js` — CLI command handler
- `src/commands/install-skill.js` → `_private` — CLI command handler
- `src/commands/learnings.js` — CLI command handler
- `src/commands/new-codemap.js` — CLI command handler
- `src/commands/new-learning.js` — CLI command handler
- `src/commands/new-projectmap.js` — CLI command handler
- `src/commands/next.js` — CLI command handler
- `src/commands/reopen.js` — CLI command handler
- `src/commands/resume.js` — CLI command handler
- `src/commands/review-execute.js` — CLI command handler
- `src/commands/status.js` — CLI command handler
- `src/commands/validate.js` → `validateSpec`, `resolveSpec` — CLI command handler
- `src/commands/_gen-ai-configs.js` → `run` — (internal helper)
- `src/commands/_spec-creator.js` → `run` — (internal helper)
- `src/core/codemap-scan.js` → `scan`, `renderCodemap`, `names`, `name` — core workflow logic
- `src/core/cruise-run.js` → `runsDir`, `ledgerPath`, `appendRun`, `readLedger`, `claudePrompt`, `printClaudePrompt` — core workflow logic
- `src/core/learning.js` → `REQUIRED_LABELS`, `firstRealLine`, `labelHasContent`, `learningTriggers`, `learningArtifact`, `validateLearningContent`, `listLearningFiles`, `tokenize`, `recallLearnings`, `buildLearningIndex` — core workflow logic
- `src/core/project-indexer.js` → `getSnapshot`, `enqueueRefresh`, `summarize`, `clear`, `TTL_MS` — core workflow logic
- `src/core/spec-index.js` → `listSpecs`, `getSpec`, `validateSpec`, `inferPhase`, `firstRealLine`, `clearCache` — core workflow logic
- `src/core/workflow.js` → `VERDICT_TO_TARGET`, `CRUISE_ENGINES`, `normalizeCruiseEngine`, `analyzeSpec`, `analyzeProject`, `challengeVerdictFromIssues`, `designMethodHint`, `formatDesignMethodLines`, `riskFlags`, `actionText` — core workflow logic
- `src/web/console.js` — web/console layer
- `src/web/preview.js` — web/console layer
- `vendored/superpowers/systematic-debugging/condition-based-waiting-example.ts` → `waitForEvent`, `waitForEventCount`, `waitForEventMatch`

## 核心调用链路（Core Call Chain）
<!--
```mermaid
graph LR
  A[入口] --> B[核心处理] --> C[输出]
```
-->

## 依赖（Dependencies）
**外部依赖**：`commander`
**内部模块依赖**：`../src/commands/init`、`../src/commands/discover`、`../src/commands/resume`、`../src/commands/status`、`../src/commands/doctor`、`../src/commands/next`、`../src/commands/challenge`、`../src/commands/cruise`、`../src/commands/console`、`../src/commands/install-skill`、`../src/commands/validate`、`../src/commands/archive`、`../src/commands/reopen`、`../src/commands/new-learning`、`../src/commands/review-execute`、`../src/commands/learnings`、`../src/commands/create-codemap`、`../src/commands/build-context-bundle`、`../src/commands/debug`、`../src/commands/create-projectmap`
  …及其他 19 个

## 风险点（Risks）
<!-- 已知风险、脆弱依赖、需注意的边界条件 -->
