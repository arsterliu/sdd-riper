var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');

function run(projectDir, moduleName, opts) {
  var docsDir = common.getDocsDir(projectDir);
  var docsRoot = path.join(projectDir, docsDir);
  if (!fs.existsSync(docsRoot)) { console.error('[ERROR] Not initialized.'); process.exit(1); }
  var codemapDir = path.join(docsRoot, 'codemap');
  if (!fs.existsSync(codemapDir)) fs.mkdirSync(codemapDir, { recursive: true });
  var outFile = path.join(codemapDir, moduleName + '.md');
  if (fs.existsSync(outFile) && !opts.force) { console.error('[ERROR] Already exists. Use --force.'); process.exit(2); }
  var content = '---\nproject: (fill me)\nmodule: ' + moduleName + '\nupdated-at: ' + new Date().toISOString().slice(0,10) + '\nlast-reason: Initial creation\n---\n\n<!--\nCodeMap 是模块级活文档：跨任务复用，仅在架构事实变更时更新。\n若以下任一维度发生变化，请同步更新 updated-at 与 last-reason。\n-->\n\n# ' + moduleName + ' CodeMap\n\n## 入口点（Entry Points）\n<!-- 触发方式：HTTP 路由 / CLI 命令 / 事件监听 / 消息队列 / 定时任务 -->\n\n## 模块边界（Module Boundaries）\n<!--\n- 本模块负责：\n- 委托给其他模块：\n- 对外暴露的接口：\n-->\n\n## 关键组件（Key Components）\n<!-- 组件 → 文件路径 → 职责（一行一个） -->\n\n## 核心调用链路（Core Call Chain）\n<!--\n```mermaid\ngraph LR\n  A[入口] --> B[核心处理] --> C[输出]\n```\n-->\n\n## 依赖（Dependencies）\n<!--\n- 内部模块依赖：\n- 外部依赖（第三方库 / API / DB / MQ）：\n-->\n\n## 风险点（Risks）\n<!-- 已知风险、脆弱依赖、需注意的边界条件 -->\n';
  fs.writeFileSync(outFile, content, 'utf-8');
  console.log('[CREATE] ' + outFile);
}
module.exports = run;
