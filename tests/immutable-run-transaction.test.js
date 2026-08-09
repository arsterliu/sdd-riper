const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function root() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-immutable-transaction-'));
}

function collision(code) {
  return function(runId) {
    const error = new Error('collision for ' + runId);
    error.code = code;
    throw error;
  };
}

test('共享 immutable transaction 保持 staging、wx、附件、collision 与清理顺序', () => {
  const transaction = require('../src/verification/immutable-run-transaction');
  assert.equal(typeof transaction.createImmutableRunCommitter, 'function');

  const project = root();
  const workspace = path.join(project, 'workspace');
  const verificationRunsRoot = path.join(project, 'mydocs', 'runs', 'verification');
  fs.mkdirSync(workspace, { recursive: true });
  const source = path.join(workspace, 'evidence.txt');
  fs.writeFileSync(source, 'evidence');
  const commitVerification = transaction.createImmutableRunCommitter('verification', collision('RUN_ALREADY_EXISTS'));

  const committed = commitVerification(project, 'mydocs', { runId: 'shared-1', attachments: [] }, workspace,
    [{ source, name: 'evidence.txt', mediaType: 'text/plain' }]);
  assert.equal(committed.runDir, path.join(verificationRunsRoot, 'shared-1'));
  assert.equal(fs.existsSync(path.join(verificationRunsRoot, 'shared-1', 'run.json')), true);
  assert.equal(fs.existsSync(path.join(project, 'mydocs', 'runs', 'visual', 'shared-1')), false);
  assert.equal(committed.run.attachments[0].path.startsWith('artifacts/'), true);
  assert.throws(function() {
    return commitVerification(project, 'mydocs', { runId: 'shared-1', attachments: [] }, workspace, []);
  }, function(error) { return error.code === 'RUN_ALREADY_EXISTS'; });

  assert.throws(function() {
    return commitVerification(project, 'mydocs', { runId: 'broken', attachments: [] }, workspace,
      [{ source: path.join(project, 'outside.txt'), name: 'outside.txt' }]);
  }, function(error) { return error.code === 'PATH_ESCAPE'; });
  assert.equal(fs.existsSync(path.join(verificationRunsRoot, 'broken')), false);
  assert.deepEqual(fs.readdirSync(verificationRunsRoot).filter(function(name) { return name.startsWith('.staging-'); }), []);

  assert.throws(function() {
    return transaction.createImmutableRunCommitter('../../visual', collision('RUN_ALREADY_EXISTS'));
  }, /static namespace/);
  assert.throws(function() {
    return commitVerification(project, '../outside', { runId: 'escaped-root', attachments: [] }, workspace, []);
  }, /trusted project root and docs directory/);
  assert.throws(function() {
    return commitVerification(project, 'mydocs', { runId: '../escaped-run', attachments: [] }, workspace, []);
  }, /validated runId/);

  const commitVisual = transaction.createImmutableRunCommitter('visual', collision('VISUAL_RUN_ALREADY_EXISTS'));
  const visual = commitVisual(project, 'mydocs', { runId: 'shared-visual', attachments: [] }, workspace, []);
  assert.equal(visual.runDir, path.join(project, 'mydocs', 'runs', 'visual', 'shared-visual'));
  assert.equal(fs.existsSync(path.join(verificationRunsRoot, 'shared-visual')), false);
});
