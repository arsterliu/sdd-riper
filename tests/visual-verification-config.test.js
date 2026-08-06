const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const config = require('../src/visual-verification/config');
const registry = require('../src/verification/registry');

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createProject() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-config-'));
  const packageRoot = path.join(projectDir, 'app');
  write(path.join(packageRoot, 'tests', 'checkout.spec.js'), '// fixture');
  return { projectDir, packageRoot };
}

function validConfig() {
  return {
    schemaVersion: 1,
    scenarios: {
      'checkout-default': {
        testFile: 'tests/checkout.spec.js',
        testTitle: 'captures checkout default',
        project: 'chromium',
        threshold: 0.002,
        masks: [{ x: 8, y: 12, width: 24, height: 16 }]
      }
    }
  };
}

test('loads only the exact static visual scenario bindings inside the package root', () => {
  const { projectDir, packageRoot } = createProject();
  write(path.join(projectDir, 'sdd.visual.config.json'), JSON.stringify(validConfig(), null, 2));

  const result = config.loadVisualConfig(projectDir, packageRoot, ['chromium']);

  assert.deepEqual(result, validConfig());
});

test('rejects arbitrary execution inputs, paths outside the package root, and unknown Playwright projects', () => {
  const cases = [
    ['command', 'npx playwright test'],
    ['url', 'https://example.test/checkout'],
    ['environment', { TOKEN: 'secret' }],
    ['testFile', '../outside.spec.js'],
    ['project', 'firefox']
  ];

  cases.forEach(([field, value]) => {
    const { projectDir, packageRoot } = createProject();
    const valueToWrite = validConfig();
    valueToWrite.scenarios['checkout-default'][field] = value;
    write(path.join(projectDir, 'sdd.visual.config.json'), JSON.stringify(valueToWrite, null, 2));

    assert.throws(
      () => config.loadVisualConfig(projectDir, packageRoot, ['chromium']),
      error => error.code === 'VISUAL_CONFIG_INVALID'
    );
  });
});

test('accepts only static pixel rectangles for masks, never selectors or runtime expressions', () => {
  const invalidMasks = [
    ['[data-visual-mask="clock"]'],
    [{ x: 0, y: 0, width: 0, height: 1 }],
    [{ x: -1, y: 0, width: 1, height: 1 }],
    [{ x: 0.5, y: 0, width: 1, height: 1 }]
  ];

  invalidMasks.forEach(masks => {
    const { projectDir, packageRoot } = createProject();
    const value = validConfig();
    value.scenarios['checkout-default'].masks = masks;
    write(path.join(projectDir, 'sdd.visual.config.json'), JSON.stringify(value, null, 2));

    assert.throws(
      () => config.loadVisualConfig(projectDir, packageRoot, ['chromium']),
      error => error.code === 'VISUAL_CONFIG_INVALID'
    );
  });
});

test('requires one binding for every fidelity scenario and rejects unbound or stale config ids', () => {
  const { projectDir, packageRoot } = createProject();
  const value = validConfig();
  value.scenarios['stale-scenario'] = value.scenarios['checkout-default'];
  delete value.scenarios['checkout-default'];
  write(path.join(projectDir, 'sdd.visual.config.json'), JSON.stringify(value, null, 2));

  assert.throws(
    () => config.bindScenarios(config.loadVisualConfig(projectDir, packageRoot, ['chromium']), ['checkout-default']),
    error => error.code === 'VISUAL_SCENARIO_BINDING_INVALID'
  );
});

test('registers a separate visual-only Playwright adapter without changing the e2e gate adapter', () => {
  const visual = registry.resolveAdapter('playwright-visual');
  const e2e = registry.resolveAdapter('playwright-test');

  assert.equal(visual.id, 'playwright-visual');
  assert.deepEqual(visual.capabilities, ['visual-gate']);
  assert.ok(!visual.capabilities.includes('gate'));
  assert.deepEqual(e2e.capabilities, ['gate']);
});
