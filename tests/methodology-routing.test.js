'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function section(text, title) {
  const heading = '## ' + title + '\n';
  const normalized = text.replace(/\r\n/g, '\n');
  const start = normalized.indexOf(heading);
  assert.notEqual(start, -1, 'missing section: ' + title);
  const end = normalized.indexOf('\n## ', start + heading.length);
  return normalized.slice(start + heading.length, end < 0 ? undefined : end);
}

test('default methodology routing does not reintroduce upstream workflow handoffs', () => {
  const skill = read('SKILL.md');
  const innovate = section(skill, 'Innovate Phase');
  const plan = section(skill, 'Plan Phase');
  const delegation = section(skill, 'Subagent Policy');
  const archive = section(skill, 'Archive Phase');
  assert.match(innovate, /protocols\/clarification\.md/);
  assert.doesNotMatch(innovate, /Drive option exploration.*with `brainstorming`/);
  assert.doesNotMatch(plan, /Follow `writing-plans` for step granularity/);
  assert.match(plan, /independently verifiable changes/);
  for (const field of ['target file path or module boundary', 'concrete change',
    'linked AC or acceptance condition', 'verification command or check']) {
    assert.ok(plan.includes(field), 'lost native Plan requirement: ' + field);
  }
  assert.match(delegation, /sole dispatch contract/);
  assert.doesNotMatch(delegation, /and `subagent-driven-development` for general routing/);
  assert.match(archive, /neither authorizes Archive nor adds a clean-tree gate/);
  assert.doesNotMatch(archive, /finish the development branch cleanly/);
});

test('clarification is bounded and cannot confer approvals or external dependencies', () => {
  const protocol = read('protocols/clarification.md');
  assert.match(section(protocol, 'Trigger'), /micro.*直接准备 Plan/);
  assert.match(section(protocol, 'Trigger'), /查事实不自动派发/);
  assert.match(section(protocol, 'Decision Loop'), /推荐答案/);
  assert.match(section(protocol, 'Decision Loop'), /不新建访谈纪要、第二份 Plan/);
  assert.match(section(protocol, 'Exit Criteria'), /停止提问/);
  assert.match(section(protocol, 'Exit Criteria'), /不能以假设绕过/);
  const boundary = section(protocol, 'Autonomy Boundary');
  for (const mode of ['auto', 'supervised', 'human']) assert.ok(boundary.includes(mode));
  for (const gate of ['Research / Challenge', 'Plan Approval', 'Profile exact digest', 'E2E SKIPPED', '最终归档']) {
    assert.ok(boundary.includes(gate), 'lost clarification boundary: ' + gate);
  }
  assert.match(protocol, /不需要安装或调用外部 skill/);
});

test('delegation guidance no longer imposes file-count or unconditional human-approval rules', () => {
  for (const file of ['INTEGRATIONS.md', 'REFERENCE.md', 'protocols/subagent-dispatch.md']) {
    const text = read(file);
    assert.doesNotMatch(text, /3\+ 个文件|500\+ 行|6\+ 文件|默认委托（|must use a challenge subagent|ask and read the user's approval directly/, file);
    for (const actor of ['subagent:<id>', 'external-agent:<id>', 'human:<name>']) {
      assert.ok(text.includes(actor), file + ': missing independent reviewer identity ' + actor);
    }
  }
  const trust = section(read('protocols/subagent-dispatch.md'), 'Trust But Verify');
  assert.match(trust, /auto permits `agent:<id>`/);
  assert.match(trust, /supervised\/human require direct `human:<name>`/);
  assert.match(trust, /does not grant continuous execution authorization/);
});

test('lighter routing preserves core gates and fresh execution evidence', () => {
  const skill = read('SKILL.md');
  const rules = section(skill, 'Non-Negotiable Rules');
  for (const requirement of ['never write code without an active Spec',
    'Independent Review is separate from approval',
    'Do not manually fill Challenge Evidence fields', 'request_archive_authorization',
    'No Claim Without Verification']) {
    assert.ok(rules.includes(requirement), requirement);
  }
  assert.match(section(skill, 'Autonomy Policy'), /Never continue a native loop when `STOP_REASON` is non-empty/);
  const execute = section(skill, 'Execute Phase');
  for (const method of ['test-driven-development', 'systematic-debugging', 'verification-before-completion']) {
    assert.ok(execute.includes(method), 'lost execution discipline: ' + method);
  }
  assert.match(execute, /Run it freshly/);
  assert.match(execute, /Read full output and exit code/);
});

test('installed package carries the native clarification route without a new skill dependency', t => {
  const installer = require('../src/commands/install-skill')._private;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-method-routing-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const destination = path.join(temp, 'sdd-riper');
  installer.installOne({ name: 'test', dir: destination });
  const installedSkill = fs.readFileSync(path.join(destination, 'SKILL.md'), 'utf8');
  const refs = [...installedSkill.matchAll(/protocols\/[A-Za-z0-9._-]+\.md/g)].map(match => match[0]);
  assert.ok(refs.includes('protocols/clarification.md'));
  for (const ref of new Set(refs)) {
    assert.equal(fs.readFileSync(path.join(destination, ref), 'utf8'), read(ref), ref);
  }
  assert.ok(require('../package.json').files.includes('protocols/'));
  assert.equal(require('../package.json').files.includes('vendored/'), false);
  assert.equal(fs.existsSync(path.join(destination, 'vendored')), false);
  const stale = path.join(destination, 'vendored', 'superpowers', 'brainstorming');
  fs.mkdirSync(stale, { recursive: true });
  fs.writeFileSync(path.join(stale, 'SKILL.md'), 'old independently discoverable entry', 'utf8');
  assert.equal(installer.checkOne({ name: 'test', dir: destination }).reason, 'legacy-vendored-entry');
  installer.installOne({ name: 'test', dir: destination });
  assert.equal(fs.existsSync(path.join(destination, 'vendored')), false);
});
