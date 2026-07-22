const { test, expect } = require('@playwright/test');

test('真实 Chromium smoke', { tag: '@AC-013' }, async ({ page }) => {
  await page.setContent('<main data-testid="ready">SDD verification</main>');
  await expect(page.getByTestId('ready')).toHaveText('SDD verification');
});
