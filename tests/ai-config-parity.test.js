const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const aiConfigRules = require('../src/core/ai-config-rules');
const genAiConfigs = require('../src/commands/_gen-ai-configs');

const ROOT = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.resolve(ROOT, file), 'utf-8');
}

test('CORE_RULES stays within the confirmed 20-line budget', function() {
  assert.ok(aiConfigRules.CORE_RULES.length <= 20,
    'CORE_RULES must stay <= 20 lines, got ' + aiConfigRules.CORE_RULES.length);
});

test('every canonical core rule line appears in SKILL.md', function() {
  const skill = read('SKILL.md');
  aiConfigRules.CORE_RULES.forEach(function(line) {
    const needle = line.replace(/^- /, '').trim();
    assert.ok(skill.indexOf(needle) !== -1, 'SKILL.md must contain canonical rule: ' + line);
  });
});

test('generated AI config block never references REFERENCE.md', function() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-parity-'));
  genAiConfigs.run(root, 'lite');
  ['AGENTS.md', 'CLAUDE.md', '.cursorrules', path.join('.github', 'copilot-instructions.md')].forEach(function(file) {
    const text = fs.readFileSync(path.join(root, file), 'utf-8');
    assert.strictEqual(text.indexOf('REFERENCE.md'), -1, file + ' must not depend on unreachable REFERENCE.md');
  });
});