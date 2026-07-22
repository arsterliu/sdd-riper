module.exports = {
  testDir: './tests',
  testMatch: 'smoke.spec.js',
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
};
