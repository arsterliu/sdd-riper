const test = require('node:test');
const assert = require('node:assert/strict');

const contract = require('../src/verification/contract');
const registry = require('../src/verification/registry');

function validProvider() {
  return {
    adapter: 'playwright-test',
    workspaceRoot: '.',
    packageRoot: 'apps/web',
    config: 'apps/web/playwright.config.ts',
    projects: ['chromium']
  };
}

test('accepts the exact v1 provider shape', () => {
  const result = contract.validateVerificationConfig({
    schemaVersion: 1,
    providers: { 'web-e2e': validProvider() }
  });
  assert.equal(result.schemaVersion, 1);
  assert.deepEqual(result.providers['web-e2e'].projects, ['chromium']);
});

test('rejects execution internals and unknown provider fields', () => {
  for (const field of ['transport', 'command', 'cli', 'browserExecutable', 'environment']) {
    const provider = validProvider();
    provider[field] = 'forbidden';
    assert.throws(
      () => contract.validateProviderDefinition(provider),
      (error) => error.code === 'CONFIG_SCHEMA_INVALID' && error.details.path === field
    );
  }
});

test('rejects invalid provider ids and top-level fields', () => {
  assert.throws(
    () => contract.validateVerificationConfig({ schemaVersion: 1, providers: { 'Web E2E': validProvider() } }),
    (error) => error.code === 'CONFIG_SCHEMA_INVALID'
  );
  assert.throws(
    () => contract.validateVerificationConfig({ schemaVersion: 1, providers: {}, command: 'pw' }),
    (error) => error.code === 'CONFIG_SCHEMA_INVALID' && error.details.path === 'command'
  );
});

test('registry exposes only the built-in playwright-test gate adapter', () => {
  const manifest = registry.resolveAdapter('playwright-test');
  assert.equal(manifest.id, 'playwright-test');
  assert.deepEqual(manifest.transport, { kind: 'process' });
  assert.ok(manifest.capabilities.includes('gate'));
  assert.equal(manifest.runtime.kind, 'node');
  assert.equal(typeof manifest.providerConfigSchema, 'object');
  assert.equal(typeof manifest.testedToolRange, 'string');
  assert.equal(typeof manifest.handshakeVersion, 'number');
});

test('registry fails closed for deferred or custom adapters', () => {
  for (const adapter of ['playwright-mcp', 'custom-command']) {
    assert.throws(
      () => registry.resolveAdapter(adapter),
      (error) => error.code === 'ADAPTER_NOT_REGISTERED' && error.details.adapterId === adapter
    );
  }
});

test('gate resolution rejects a registered adapter without gate capability', () => {
  assert.throws(
    () => registry.requireCapability({ id: 'explorer', capabilities: ['explore'] }, 'gate'),
    (error) => error.code === 'CAPABILITY_NOT_GATE'
  );
});
