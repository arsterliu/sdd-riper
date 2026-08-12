const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(file) { return fs.readFileSync(path.resolve(__dirname, '..', file), 'utf-8'); }

test('human-facing guides explain the three autonomy modes without legacy policy switches', function() {
  ['README.md', 'GUIDE.md', 'TEAM-GUIDE.md', 'REFERENCE.md', 'SKILL.md'].forEach(function(file) {
    const content = read(file);
    assert.match(content, /auto/);
    assert.match(content, /supervised/);
    assert.match(content, /human/);
    assert.doesNotMatch(content, /APPROVAL_POLICY|CRUISE_ENABLED/, file);
  });
  assert.match(read('GUIDE.md'), /Plan Approval.*不会自动等于后续自动驾驶授权/);
  assert.match(read('README.md'), /AI 会根据当前状态用自然语言告诉你为什么停下/);
});

test('generated agent guidance permits only freshly authorized automatic reviewers', function() {
  ['AGENTS.md', 'CLAUDE.md', '.cursorrules', '.github/copilot-instructions.md'].forEach(function(file) {
    const content = read(file);
    assert.match(content, /fresh task\/plan authorization/);
    assert.match(content, /project configuration or Plan Approval alone is insufficient/);
    assert.doesNotMatch(content, /APPROVAL_POLICY|CRUISE_ENABLED/, file);
  });
});
