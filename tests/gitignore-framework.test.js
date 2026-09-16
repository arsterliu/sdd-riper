const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'bin', 'cli.js');

function runSdd(projectDir, args) {
  const result = spawnSync(process.execPath, [cli].concat(args), {
    cwd: projectDir,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, (result.stdout || '') + (result.stderr || ''));
  return (result.stdout || '') + (result.stderr || '');
}

function git(projectDir, args) {
  try {
    return { status: 0, output: execFileSync('git', args, { cwd: projectDir, encoding: 'utf8' }).trim() };
  } catch (error) {
    return { status: error.status || 1, output: String(error.stdout || '').trim() };
  }
}

function assertIgnored(projectDir, relativePath) {
  assert.equal(git(projectDir, ['check-ignore', '--no-index', '--', relativePath]).status, 0,
    relativePath + ' must be ignored by sdd init');
  assert.equal(git(projectDir, ['ls-files', '--error-unmatch', '--', relativePath]).status, 1,
    relativePath + ' must not be tracked');
  assert.equal(fs.existsSync(path.join(projectDir, relativePath)), true,
    relativePath + ' must remain in the workspace');
}

test('sdd init ignores framework configs and preserves mydocs artifacts', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-gitignore-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: projectDir });
    runSdd(projectDir, ['init', projectDir]);
    fs.writeFileSync(path.join(projectDir, '.sdd-verification.json'), '{}\n', 'utf8');
    fs.mkdirSync(path.join(projectDir, 'mydocs', 'specs'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'mydocs', 'specs', 'example.md'), '# Example\n', 'utf8');

    for (const file of [
      '.sdd-config', '.sdd-verification.json', '.cursorrules', 'AGENTS.md', 'CLAUDE.md',
      '.github/copilot-instructions.md'
    ]) assertIgnored(projectDir, file);

    assert.equal(git(projectDir, ['check-ignore', '--no-index', '--', 'mydocs/specs/example.md']).status, 1);
    execFileSync('git', ['add', '-A'], { cwd: projectDir });
    assert.equal(git(projectDir, ['ls-files', '--error-unmatch', '--', 'mydocs/specs/example.md']).status, 0);
    assert.equal(git(projectDir, ['ls-files', '--error-unmatch', '--', '.sdd-config']).status, 1);
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test('sdd init preserves custom gitignore content and is idempotent', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-gitignore-custom-'));
  try {
    fs.writeFileSync(path.join(projectDir, '.gitignore'), '# custom rule\ncustom-local/\n', 'utf8');
    runSdd(projectDir, ['init', projectDir]);
    const first = fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf8');
    fs.mkdirSync(path.join(projectDir, 'mydocs', 'specs'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'mydocs', 'specs', 'keep.md'), 'keep\n', 'utf8');
    runSdd(projectDir, ['init', projectDir]);
    const second = fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf8');
    assert.equal(second, first);
    assert.match(second, /# custom rule/);
    assert.match(second, /custom-local\//);
    assert.equal((second.match(/<!-- sdd-riper:gitignore:start -->/g) || []).length, 1);
    assert.equal((second.match(/<!-- sdd-riper:gitignore:end -->/g) || []).length, 1);
    assert.equal(fs.readFileSync(path.join(projectDir, 'mydocs', 'specs', 'keep.md'), 'utf8'), 'keep\n');
    assert.equal(second.indexOf('/mydocs/'), -1);
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});
