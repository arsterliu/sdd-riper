'use strict';

module.exports = {
  testDir: './tests',
  testMatch: 'console.spec.js',
  workers: 1,
  fullyParallel: false,
  globalSetup: require.resolve('./console.global-setup'),
  globalTeardown: require.resolve('./console.global-teardown'),
  outputDir: 'test-results/console',
  use: { baseURL: 'http://127.0.0.1:4799', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
};
