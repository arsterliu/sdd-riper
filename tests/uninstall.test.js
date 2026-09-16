const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'bin', 'cli.js');

function runSdd(projectDir, args) {
  return execFileSync(process.execPath, [cli].concat(args), { cwd: projectDir, encoding: 'utf8' });
}

test('sdd uninstall removes framework files while preserving mydocs', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-uninstall-'));
  try {
    runSdd(projectDir, ['init', projectDir]);
    fs.writeFileSync(path.join(projectDir, '.sdd-verification.json'), '{}\n', 'utf8');
    fs.mkdirSync(path.join(projectDir, '.sdd-verification.json.lock'));
    fs.writeFileSync(path.join(projectDir, 'mydocs', 'specs', 'keep.md'), '# keep\n', 'utf8');
    runSdd(projectDir, ['uninstall', projectDir]);

    for (const file of ['.sdd-config', '.sdd-verification.json', 'AGENTS.md', 'CLAUDE.md', '.cursorrules', '.github/copilot-instructions.md']) {
      assert.equal(fs.existsSync(path.join(projectDir, file)), false, file + ' should be removed');
    }
    assert.equal(fs.existsSync(path.join(projectDir, '.sdd-verification.json.lock')), false);
    assert.equal(fs.readFileSync(path.join(projectDir, 'mydocs', 'specs', 'keep.md'), 'utf8'), '# keep\n');
    assert.equal(fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf8').includes('sdd-riper:gitignore:'), false);
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test('sdd uninstall preserves user content and non-empty directories', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-uninstall-user-'));
  try {
    fs.mkdirSync(path.join(projectDir, '.github'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'AGENTS.md'), '# User agents\n\nkeep this\n', 'utf8');
    fs.writeFileSync(path.join(projectDir, '.gitignore'), '# User ignore\ncustom-local/\n', 'utf8');
    fs.writeFileSync(path.join(projectDir, '.github', 'keep.yml'), 'name: keep\n', 'utf8');
    runSdd(projectDir, ['init', projectDir]);
    runSdd(projectDir, ['uninstall', projectDir]);

    assert.equal(fs.readFileSync(path.join(projectDir, 'AGENTS.md'), 'utf8'), '# User agents\n\nkeep this\n');
    assert.equal(fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf8'), '# User ignore\ncustom-local/\n');
    assert.equal(fs.existsSync(path.join(projectDir, '.github', 'keep.yml')), true);
    assert.equal(fs.existsSync(path.join(projectDir, '.github')), true);
    assert.equal(fs.existsSync(path.join(projectDir, 'mydocs')), true);
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test('sdd uninstall is idempotent', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-uninstall-repeat-'));
  try {
    runSdd(projectDir, ['init', projectDir]);
    runSdd(projectDir, ['uninstall', projectDir]);
    const snapshot = fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf8');
    runSdd(projectDir, ['uninstall', projectDir]);
    assert.equal(fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf8'), snapshot);
    assert.equal(fs.existsSync(path.join(projectDir, 'mydocs')), true);
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});
