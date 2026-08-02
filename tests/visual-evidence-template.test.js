const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

for (const templateName of ['spec-standard.md', 'spec-lite.md', 'spec-micro.md']) {
  test(templateName + ' 为视觉合同保留默认关闭的 frontmatter 字段', function() {
    const content = fs.readFileSync(path.join(__dirname, '..', 'templates', templateName), 'utf-8');
    assert.match(content, /^visual-evidence: ""$/m);
    assert.match(content, /^visual-evidence-file: ""$/m);
  });
}
