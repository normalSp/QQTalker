import { expect, test, type Page } from '@playwright/test';

async function openSelfLearning(page: Page) {
  await page.goto('/');
  await page.locator('[data-page="selflearning"]').click();
  await expect(page.getByTestId('sl-strategy-panel')).toBeVisible();
  await expect(page.getByTestId('sl-group-select')).toBeVisible();
}

test('runs immediate learning for selected group', async ({ page }) => {
  await openSelfLearning(page);

  await page.getByTestId('sl-group-select').selectOption('1001');
  await page.getByTestId('sl-run-learning').click();

  await expect(page.getByText('已触发一次完整学习周期')).toBeVisible();
  await expect(page.locator('#slRunsPanel')).toContainText('手动学习完成 1001');
  await expect(page.locator('#slAdvancedSummaryPanel')).toContainText('分析更新完成');
});

test('switches groups and reloads group-specific learning data', async ({ page }) => {
  await openSelfLearning(page);

  await page.getByTestId('sl-group-select').selectOption('1001');
  await expect(page.locator('#slStylesPanel')).toContainText('语气词');
  await expect(page.locator('#slAdvancedSummaryPanel')).toContainText('1001 群');

  await page.getByTestId('sl-group-select').selectOption('2002');
  await expect(page.locator('#slStylesPanel')).toContainText('口头禅');
  await expect(page.locator('#slAdvancedSummaryPanel')).toContainText('2002 群');
});

test('approves a persona review from the dashboard flow', async ({ page }) => {
  await openSelfLearning(page);

  await page.getByTestId('sl-group-select').selectOption('1001');
  await expect(page.getByTestId('sl-approve-review-9001')).toBeVisible();

  await page.getByTestId('sl-approve-review-9001').click();

  await expect(page.getByText('已批准人格建议并应用到 Prompt 上下文')).toBeVisible();
  await expect(page.getByTestId('sl-approve-review-9001')).toBeDisabled();
  await expect(page.locator('#slReviewsPanel')).toContainText('approved');
});
