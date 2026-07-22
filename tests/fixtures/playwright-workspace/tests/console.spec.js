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
