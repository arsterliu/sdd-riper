const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { resolveWorkspace, assertRuntime } = require('../src/verification/workspace');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function managedLock(lockfile, version = '1.52.0') {
  if (lockfile === 'package-lock.json' || lockfile === 'npm-shrinkwrap.json') {
    return JSON.stringify({ lockfileVersion: 3, packages: {
      'node_modules/@playwright/test': { version }
    } });
  }
  if (lockfile === 'pnpm-lock.yaml') return "lockfileVersion: '9.0'\npackages:\n  '@playwright/test@" + version + "': {}\n";
  if (lockfile === 'yarn.lock') return '"@playwright/test@^' + version + '":\n  version "' + version + '"\n';
  return '';
}

function fixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-workspace-'));
  const packageRoot = path.join(root, 'apps', 'web');
  fs.mkdirSync(packageRoot, { recursive: true });
  writeJson(path.join(root, 'package.json'), {
    private: true,
    workspaces: ['apps/*'],
    devDependencies: options.declaredAtRoot === false ? {} : { '@playwright/test': '^1.52.0' }
  });
  writeJson(path.join(packageRoot, 'package.json'), {
    name: 'web',
    devDependencies: options.declaredAtPackage ? { '@playwright/test': '^1.52.0' } : {}
  });
  const lock = Object.prototype.hasOwnProperty.call(options, 'lockfile') ? options.lockfile : 'package-lock.json';
  if (lock) fs.writeFileSync(path.join(root, lock), Object.prototype.hasOwnProperty.call(options, 'lockContents') ? options.lockContents : managedLock(lock, options.lockedVersion || options.version));
  if (options.secondLockfile) fs.writeFileSync(path.join(root, options.secondLockfile), '{}');
  if (options.pnp) fs.writeFileSync(path.join(root, '.pnp.cjs'), 'module.exports = {}');
  if (options.installed !== false) {
    writeJson(path.join(root, 'node_modules', '@playwright', 'test', 'package.json'), {
      name: '@playwright/test', version: options.version || '1.52.0'
    });
  }
  return { root, packageRoot };
}

function provider() {
  return {
    adapter: 'playwright-test', workspaceRoot: '.', packageRoot: 'apps/web',
    config: 'apps/web/playwright.config.ts', projects: ['chromium']
  };
}

test('resolves npm, pnpm and Yarn node_modules hoists declared by an ancestor manifest', () => {
  for (const lockfile of ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']) {
    const f = fixture({ lockfile });
    const result = resolveWorkspace(provider(), f.root, { testedToolRange: '>=1.42.0 <2.0.0' });
    assert.equal(result.packageRoot, f.packageRoot);
    assert.equal(result.toolVersion, '1.52.0');
    assert.equal(path.basename(result.lockfile), lockfile);
    assert.ok(result.toolPackage.startsWith(f.root));
  }
});

test('accepts a direct declaration in the package manifest with a root hoist', () => {
  const f = fixture({ declaredAtRoot: false, declaredAtPackage: true });
  const result = resolveWorkspace(provider(), f.root, { testedToolRange: '>=1.42.0 <2.0.0' });
  assert.equal(result.declaringManifest, path.join(f.packageRoot, 'package.json'));
});

test('rejects transitive-only, missing installs, missing or ambiguous lockfiles', () => {
  const transitive = fixture({ declaredAtRoot: false });
  assert.throws(() => resolveWorkspace(provider(), transitive.root, {}), e => e.code === 'PACKAGE_NOT_DECLARED');
  const missing = fixture({ installed: false });
  assert.throws(() => resolveWorkspace(provider(), missing.root, {}), e => e.code === 'PACKAGE_NOT_RESOLVABLE');
  const noLock = fixture({ lockfile: null });
  assert.throws(() => resolveWorkspace(provider(), noLock.root, {}), e => e.code === 'LOCKFILE_MISSING');
  const ambiguous = fixture({ secondLockfile: 'yarn.lock' });
  assert.throws(() => resolveWorkspace(provider(), ambiguous.root, {}), e => e.code === 'LOCKFILE_AMBIGUOUS');
});

test('rejects Yarn PnP, unsupported versions and path escape', () => {
  const pnp = fixture({ pnp: true });
  assert.throws(() => resolveWorkspace(provider(), pnp.root, {}), e => e.code === 'YARN_PNP_UNSUPPORTED');
  const old = fixture({ version: '1.41.2' });
  assert.throws(
    () => resolveWorkspace(provider(), old.root, { testedToolRange: '>=1.42.0 <2.0.0' }),
    e => e.code === 'TOOL_VERSION_UNSUPPORTED'
  );
  const escaped = provider();
  escaped.packageRoot = '../outside';
  const f = fixture();
  assert.throws(() => resolveWorkspace(escaped, f.root, {}), e => e.code === 'PATH_ESCAPE');
});

test('rejects an empty lockfile instead of treating its filename as lock management evidence', () => {
  const f = fixture({ lockContents: '' });
  assert.throws(() => resolveWorkspace(provider(), f.root, {}), e => e.code === 'LOCKFILE_INVALID');
});

test('rejects a non-empty lockfile that does not lock the resolved Playwright version', () => {
  const fake = fixture({ lockContents: '{}' });
  assert.throws(() => resolveWorkspace(provider(), fake.root, {}), e => e.code === 'LOCKFILE_PACKAGE_MISSING');
  const mismatch = fixture({ lockedVersion: '1.51.0', version: '1.52.0' });
  assert.throws(() => resolveWorkspace(provider(), mismatch.root, {}), e => e.code === 'LOCKFILE_PACKAGE_MISSING');
  const commentedPnpm = fixture({ lockfile: 'pnpm-lock.yaml', lockContents:
    "lockfileVersion: '9.0'\npackages:\n  other@1.0.0: {}\n#  '@playwright/test@1.52.0': {}\n" });
  assert.throws(() => resolveWorkspace(provider(), commentedPnpm.root, {}), e => e.code === 'LOCKFILE_PACKAGE_MISSING');
  const unrelatedYarn = fixture({ lockfile: 'yarn.lock', lockContents:
    '"other@1.0.0":\n  version "1.52.0"\n# "@playwright/test@^1.52.0":\n' });
  assert.throws(() => resolveWorkspace(provider(), unrelatedYarn.root, {}), e => e.code === 'LOCKFILE_PACKAGE_MISSING');
});

test('accepts a modern Yarn node_modules lock stanza with an npm selector', () => {
  const modern = fixture({ lockfile: 'yarn.lock', lockContents:
    '__metadata:\n  version: 8\n"@playwright/test@npm:1.52.0":\n  version: 1.52.0\n  resolution: "@playwright/test@npm:1.52.0"\n' });
  assert.equal(resolveWorkspace(provider(), modern.root, {}).toolVersion, '1.52.0');
});

test('enforces the Adapter manifest runtime range', () => {
  assert.equal(assertRuntime({ runtime: { kind: 'node', nodeRange: '>=18.0.0' } }), process.versions.node);
  assert.throws(() => assertRuntime({ runtime: { kind: 'node', nodeRange: '>=999.0.0' } }), e => e.code === 'RUNTIME_UNSUPPORTED');
});

test('rejects manifest and lockfile symlinks whose realpaths escape workspaceRoot', (t) => {
  const manifestFixture = fixture();
  const outsideManifest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-outside-manifest-')), 'package.json');
  writeJson(outsideManifest, { devDependencies: { '@playwright/test': '^1.52.0' } });
  fs.unlinkSync(path.join(manifestFixture.root, 'package.json'));
  try { fs.symlinkSync(outsideManifest, path.join(manifestFixture.root, 'package.json'), 'file'); }
  catch (error) { if (error.code === 'EPERM') { t.skip('当前 Windows 未授予文件 symlink 权限'); return; } throw error; }
  assert.throws(() => resolveWorkspace(provider(), manifestFixture.root, {}), e => e.code === 'PATH_ESCAPE');

  const lockFixture = fixture();
  const outsideLock = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-outside-lock-')), 'package-lock.json');
  fs.writeFileSync(outsideLock, managedLock('package-lock.json'));
  fs.unlinkSync(path.join(lockFixture.root, 'package-lock.json'));
  try { fs.symlinkSync(outsideLock, path.join(lockFixture.root, 'package-lock.json'), 'file'); }
  catch (error) { if (error.code === 'EPERM') { t.skip('当前 Windows 未授予文件 symlink 权限'); return; } throw error; }
  assert.throws(() => resolveWorkspace(provider(), lockFixture.root, {}), e => e.code === 'PATH_ESCAPE');
});
