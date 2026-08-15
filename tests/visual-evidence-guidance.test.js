const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('视觉能力路由存在于权威来源，而非用户入口文档', function() {
  const root = path.resolve(__dirname, '..');
  const files = [
    'SKILL.md',
    'src/core/ai-config-rules.js',
    'INTEGRATIONS.md'
  ];

  files.forEach(function(file) {
    const content = fs.readFileSync(path.join(root, file), 'utf-8');
    assert.match(content, /affected-units|ui-impact/i, file + ' 应说明前端影响面判定');
    assert.match(content, /visual-context-intent|visual select/i, file + ' 应说明一次性视觉意图选择');
    assert.match(content, /visual discover/i, file + ' 应说明本地 Context 发现入口');
    assert.match(content, /Figma.*URL|URL.*Figma/i, file + ' 应将 Figma URL 视为统一来源');
    assert.match(content, /不联网|no network|不发起网络|does not access the network/i, file + ' 不应承诺自动读取远程内容');
    assert.match(content, /不自动批准|never fabricate.*approval|do not fabricate.*approval|does not.*approve/i, file + ' 应明确禁止自动批准视觉证据');
    assert.match(content, /不启动浏览器|不运行浏览器|不执行截图 diff|never fabricate.*browser.*screenshot diff|do not fabricate.*browser.*screenshot diff/i, file + ' 应明确不运行浏览器或截图 diff');
  });
});
