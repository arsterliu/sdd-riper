'use strict';

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const stateFile = path.resolve(__dirname, '..', '.console-e2e-state.json');

async function openProject(page) {
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const response = await page.request.post('/api/project', { data: { projectDir: state.projectDir } });
  expect(response.ok()).toBeTruthy();
  await page.goto('/');
}

test('Console 展示 Provider、Run、freshness、矩阵和安全诊断', {
  tag: ['@AC-003', '@AC-004', '@AC-005']
}, async ({ page }) => {
  await openProject(page);
  await page.getByRole('button', { name: /evidence-view/ }).click();
  await expect(page.locator('#verification-summary')).toContainText('console-e2e');
  await expect(page.locator('#verification-runs')).toContainText('new-fail');
  await expect(page.locator('#verification-runs')).toContainText('fresh');
  await expect(page.locator('#verification-matrix')).toContainText('AC-003');
  await expect(page.locator('#verification-matrix')).toContainText('FAIL');
  await expect(page.locator('#verification-matrix')).toContainText('missing');
  await expect(page.locator('#verification-details')).toContainText('[REDACTED]');
  await expect(page.locator('#verification-details')).toContainText('artifacts/trace.zip');
  await expect(page.locator('body')).not.toContainText('super-secret');
  await expect(page.locator('body')).not.toContainText('C:\\Users\\alice');
});

test('Console 区分 required、configured-no-runs、blocked 并在窄屏局部滚动', {
  tag: '@AC-006'
}, async ({ page }) => {
  await openProject(page);
  await page.getByRole('button', { name: /provider-required/ }).click();
  await expect(page.locator('#verification-summary')).toContainText('Provider required');
  await page.getByRole('button', { name: /no-runs/ }).click();
  await expect(page.locator('#verification-summary')).toContainText('configured-no-runs');
  await expect(page.locator('#verification-runs')).toContainText('Configured, no Runs');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /evidence-view/ }).click();
  await expect(page.locator('#verification-summary')).toContainText('blocked');
  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(bodyOverflow).toBeFalsy();
  await expect(page.locator('.verification-scroll').first()).toHaveCSS('overflow-x', 'auto');
});

test('Console E2E 通过正式 Provider 映射运行', { tag: '@AC-007' }, async ({ page }) => {
  await openProject(page);
  await expect(page.getByRole('heading', { name: 'Spec Control Console' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Verify Run');
});

test('Console 把 Spec 态势、Profile 与 Quality Plan 作为只读决策视图展示', {
  tag: ['@AC-001', '@AC-004', '@AC-007']
}, async ({ page }, testInfo) => {
  await openProject(page);
  await expect(page.locator('#metric-total')).toHaveText('4');
  await expect(page.locator('#spec-status-board')).toContainText('Lifecycle');
  await expect(page.locator('#spec-status-board')).toContainText('Current Phase');
  await expect(page.locator('#spec-status-board')).toContainText('Work State');
  await expect(page.getByRole('button', { name: /evidence-view/ })).toContainText('Draft');
  await expect(page.getByRole('button', { name: /evidence-view/ })).toContainText('In progress');
  const desktopLayout = await page.evaluate(() => {
    const board = document.querySelector('.spec-board-scroll');
    return { width: board.clientWidth, height: board.clientHeight };
  });
  expect(desktopLayout.width).toBeGreaterThanOrEqual(800);
  expect(desktopLayout.height).toBeGreaterThanOrEqual(150);

  await page.getByRole('button', { name: /evidence-view/ }).click();
  await expect(page.locator('#project-profile')).toContainText('Confirmed');
  await expect(page.locator('#quality-plan')).toContainText('Available');
  await expect(page.locator('#quality-plan')).toContainText('frontend');
  await expect(page.locator('body')).not.toContainText('fixture-secret-profile-evidence');
  await expect(page.locator('body')).not.toContainText('fixture-secret-profile-confirmation');
  const screenshotPath = testInfo.outputPath('console-quality-plan-desktop.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach('console-quality-plan-desktop', { path: screenshotPath, contentType: 'image/png' });

  await page.getByRole('button', { name: /provider-required/ }).click();
  await expect(page.locator('#quality-plan')).toContainText('Blocking');
  await expect(page.locator('#quality-plan')).toContainText('profile-required');

  await page.getByRole('button', { name: /archived-quality/ }).click();
  await expect(page.locator('#quality-plan')).toContainText('Not applicable');

  await page.locator('#search').fill('evidence-view');
  await expect(page.locator('#spec-total')).toContainText('1 shown / 4 total');
  await expect(page.locator('#metric-total')).toHaveText('4');

  await page.setViewportSize({ width: 390, height: 844 });
  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(bodyOverflow).toBeFalsy();
  await expect(page.locator('.spec-board-scroll')).toHaveCSS('overflow-x', 'auto');
});
