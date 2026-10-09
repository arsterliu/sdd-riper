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

async function openTechnicalDetails(page) {
  await page.locator('#technical-details').evaluate(function(node) { node.open = true; });
}

test('任务搜索支持版本、中文状态、范围筛选与空结果清除', { tag: '@AC-002' }, async ({ page }) => {
  await openProject(page);
  await page.locator('#search').fill('EVIDENCE-VIEW');
  await expect(page.locator('#spec-list button.spec-item')).toHaveCount(1);
  await expect(page.locator('#metric-total')).toHaveText('4');
  await page.locator('#search').fill('已归档');
  await expect(page.locator('#spec-list button.spec-item')).toHaveCount(1);
  await page.getByRole('button', { name: '活动', exact: true }).click();
  await expect(page.locator('#spec-list')).toContainText('没有匹配的任务');
  await page.locator('#empty-clear').click();
  await expect(page.locator('#search')).toHaveValue('');
  await expect(page.locator('#spec-list button.spec-item')).toHaveCount(4);
  var version = await page.getByRole('button', { name: /archived-quality/ }).locator('small').first().textContent();
  await page.locator('#search').fill(version.split(' · ')[0]);
  await expect(page.locator('#spec-list button.spec-item').first()).toBeVisible();
  await page.getByRole('button', { name: '归档', exact: true }).click();
  await expect(page.locator('#spec-list button.spec-item')).toHaveCount(1);
  await page.locator('#search').fill('no-such-task');
  await expect(page.locator('#spec-list')).toContainText('没有匹配的任务');
});

test('窄屏先呈现目标，搜索时展开结果，选择后回到任务内容', { tag: '@AC-002' }, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openProject(page);
  await expect(page.locator('#task-navigation-panel')).not.toHaveAttribute('open', '');
  await expect(page.locator('#detail-title')).toBeVisible();
  expect((await page.locator('#task-goal').boundingBox()).y).toBeLessThan(650);
  await page.locator('#search').fill('archived-quality');
  await expect(page.getByRole('button', { name: /archived-quality/ })).toBeVisible();
  await page.getByRole('button', { name: /archived-quality/ }).click();
  await expect(page.locator('#detail-title')).toContainText('archived-quality');
  await expect(page.locator('#task-navigation-panel')).not.toHaveAttribute('open', '');
  await expect(page.locator('#detail-title')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBeFalsy();
});

test('归档任务阅读时没有活动门禁、编辑或重开入口', { tag: '@AC-005' }, async ({ page }) => {
  await openProject(page);
  await page.getByRole('button', { name: /archived-quality/ }).click();
  await expect(page.locator('#detail-work-state')).toContainText('只读');
  await expect(page.locator('#validate')).toBeHidden();
  await expect(page.locator('#gate-list')).not.toContainText('Not started');
  await expect(page.locator('#artifact-list [data-open-artifact]')).toHaveCount(0);
  await page.locator('#artifact-list [data-preview-artifact="spec"]').click();
  await expect(page.locator('#artifact-reader')).toBeVisible();
  await expect(page.locator('#reader-title')).toContainText('archived-quality');
  await expect(page.locator('#reader-content')).toContainText('Archived quality');
  await expect(page.locator('#reader-open')).toBeHidden();
  await page.getByRole('button', { name: '原文', exact: true }).click();
  await expect(page.locator('#reader-raw')).toContainText('status: archived');
  await page.getByRole('button', { name: '返回任务', exact: true }).click();
  await expect(page.locator('#artifact-reader')).toBeHidden();
});

test('切换项目清理搜索、旧详情和阅读状态', { tag: '@AC-002' }, async ({ page }) => {
  await openProject(page);
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  await expect(page.locator('#project-input')).toHaveValue(state.projectDir);
  await page.locator('#search').fill('evidence-view');
  await page.getByRole('button', { name: /evidence-view/ }).click();
  await page.locator('#artifact-list [data-preview-artifact="spec"]').click();
  await expect(page.locator('#artifact-reader')).toBeVisible();
  await page.locator('#use-current').click();
  await expect(page.locator('#project-input')).not.toHaveValue(state.projectDir);
  await expect(page.locator('#search')).toHaveValue('');
  await expect(page.locator('#artifact-reader')).toBeHidden();
  if (await page.locator('#spec-detail').isVisible()) {
    await expect(page.locator('#detail-title')).not.toContainText('evidence-view');
  } else {
    await expect(page.locator('#detail-title')).toBeHidden();
  }
});

test('Console 展示 Provider、Run、freshness、矩阵和安全诊断', {
  tag: '@AC-005'
}, async ({ page }) => {
  await openProject(page);
  await page.getByRole('button', { name: /evidence-view/ }).click();
  await openTechnicalDetails(page);
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
  tag: '@AC-005'
}, async ({ page }) => {
  await openProject(page);
  await page.getByRole('button', { name: /provider-required/ }).click();
  await openTechnicalDetails(page);
  await expect(page.locator('#verification-summary')).toContainText('Provider required');
  await page.getByRole('button', { name: /no-runs/ }).click();
  await openTechnicalDetails(page);
  await expect(page.locator('#verification-summary')).toContainText('configured-no-runs');
  await expect(page.locator('#verification-runs')).toContainText('Configured, no Runs');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#task-navigation-panel > summary').click();
  await page.getByRole('button', { name: /evidence-view/ }).click();
  await openTechnicalDetails(page);
  await expect(page.locator('#verification-summary')).toContainText('blocked');
  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(bodyOverflow).toBeFalsy();
  await expect(page.locator('.verification-scroll').first()).toHaveCSS('overflow-x', 'auto');
});

test('Console E2E 通过正式 Provider 映射运行', { tag: '@AC-005' }, async ({ page }) => {
  await openProject(page);
  await expect(page.getByRole('heading', { name: '聚焦任务台' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Verify Run');
});

test('Console 把 Spec 态势、Profile 与 Quality Plan 作为只读决策视图展示', {
  tag: '@AC-005'
}, async ({ page }, testInfo) => {
  await openProject(page);
  await expect(page.locator('#metric-total')).toHaveText('4');
  await expect(page.getByRole('button', { name: /evidence-view/ })).toContainText('草稿');
  await expect(page.getByRole('button', { name: /evidence-view/ })).toContainText('进行中');
  const desktopLayout = await page.evaluate(() => {
    const board = document.querySelector('.spec-board-scroll');
    return { width: board.clientWidth, height: board.clientHeight };
  });
  expect(desktopLayout.width).toBeGreaterThanOrEqual(180);
  expect(desktopLayout.height).toBeGreaterThanOrEqual(150);

  await page.getByRole('button', { name: /evidence-view/ }).click();
  await openTechnicalDetails(page);
  await expect(page.locator('#project-profile')).toContainText('Confirmed');
  await expect(page.locator('#quality-plan')).toContainText('Available');
  await expect(page.locator('#quality-plan')).toContainText('frontend');
  await expect(page.locator('body')).not.toContainText('fixture-secret-profile-evidence');
  await expect(page.locator('body')).not.toContainText('fixture-secret-profile-confirmation');
  const screenshotPath = testInfo.outputPath('console-quality-plan-desktop.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach('console-quality-plan-desktop', { path: screenshotPath, contentType: 'image/png' });

  await page.getByRole('button', { name: /provider-required/ }).click();
  await openTechnicalDetails(page);
  await expect(page.locator('#quality-plan')).toContainText('Blocking');
  await expect(page.locator('#quality-plan')).toContainText('profile-required');

  await page.getByRole('button', { name: /archived-quality/ }).click();
  await openTechnicalDetails(page);
  await expect(page.locator('#quality-plan')).toContainText('Not applicable');

  await page.locator('#search').fill('evidence-view');
  await expect(page.locator('#spec-total')).toContainText('1 / 4 项');
  await expect(page.locator('#metric-total')).toHaveText('4');

  await page.setViewportSize({ width: 390, height: 844 });
  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(bodyOverflow).toBeFalsy();
  await expect(page.locator('.spec-board-scroll')).toHaveCSS('overflow-x', 'auto');
});
