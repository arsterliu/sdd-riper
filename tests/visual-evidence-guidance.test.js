const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('skill 与生成配置仅在显式视觉需求下引导 visual init', function() {
  const root = path.resolve(__dirname, '..');
  const files = [
    'SKILL.md',
    'src/commands/_gen-ai-configs.js',
    'protocols/sdd-riper-one.md',
    'protocols/sdd-riper-one-light.md'
  ];

  files.forEach(function(file) {
    const content = fs.readFileSync(path.join(root, file), 'utf-8');
    assert.match(content, /sdd visual init/);
    assert.match(content, /frontend.*(自动启用|role)|自动启用.*frontend/i);
  });
});
