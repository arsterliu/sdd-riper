const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const tmpBase = path.join(os.tmpdir(), 'sdd-learn-test-' + Date.now());
const projectDir = path.join(tmpBase, 'proj');
const docsRoot = path.join(projectDir, 'mydocs');

function writeLearning(dir, name, appliesWhen, decisionRule) {
  var p = path.join(docsRoot, dir, name);
  var content = '---\ndate: 2026-06-01\ntask-name: "' + name.replace('.learning.md', '') + '"\nstatus: draft\n---\n\n' +
    '## Learning Record\n\nApplies When: ' + appliesWhen + '\nDecision Rule: ' + decisionRule + '\nObserved Problem: x\n';
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}

function setup() {
  if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true, force: true });
  fs.mkdirSync(path.join(docsRoot, 'learnings'), { recursive: true });
  fs.mkdirSync(path.join(docsRoot, 'archive'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, '.sdd-config'), 'DOCS_DIR="mydocs"\nMODE="standard"\n', 'utf-8');
}

describe('learning recall', function() {
  var learning;
  beforeEach(function() {
    delete require.cache[require.resolve('../src/core/learning')];
    learning = require('../src/core/learning');
    setup();
  });
  afterEach(function() {
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  it('ranks a lexically relevant older learning above newer unrelated ones (AC-001)', function() {
    var rel = writeLearning('learnings', 'relevant.learning.md', 'checkout payment retry idempotency', 'use idempotency keys for checkout payment');
    var u1 = writeLearning('learnings', 'unrelated1.learning.md', 'rendering css layout', 'use flexbox');
    var u2 = writeLearning('learnings', 'unrelated2.learning.md', 'logging verbosity tuning', 'lower log level');
    var old = new Date(Date.now() - 100000), recent = new Date();
    fs.utimesSync(rel, old, old);       // relevant is the OLDEST
    fs.utimesSync(u1, recent, recent);
    fs.utimesSync(u2, recent, recent);
    var hits = learning.recallLearnings(projectDir, 'how to make checkout payment retry safe', 3);
    assert.ok(hits[0].endsWith('relevant.learning.md'), 'expected relevant first, got: ' + hits[0]);
  });

  it('falls back to mtime recency when nothing matches (AC-002)', function() {
    var a = writeLearning('learnings', 'a.learning.md', 'alpha topic', 'x');
    var b = writeLearning('learnings', 'b.learning.md', 'beta topic', 'y');
    var older = new Date(Date.now() - 100000), newer = new Date();
    fs.utimesSync(a, older, older);
    fs.utimesSync(b, newer, newer);
    var hits = learning.recallLearnings(projectDir, 'zzzz nomatch unrelated terms', 2);
    assert.ok(hits[0].endsWith('b.learning.md'), 'expected newest first on fallback, got: ' + hits[0]);
  });

  it('buildLearningIndex aggregates every learning with its match surface', function() {
    writeLearning('learnings', 'one.learning.md', 'condition one', 'rule one');
    writeLearning('archive', 'two.learning.md', 'condition two', 'rule two');
    var index = learning.buildLearningIndex(projectDir);
    assert.equal(index.length, 2);
    assert.ok(index.every(function(i) { return i.appliesWhen && i.decisionRule; }));
  });
});
