import { expect, test } from '@playwright/test';

test('creates and runs the Pressure Plate Door recipe', async ({ page }) => {
  await page.goto('/');

  const recipeButton = page.getByRole('button', { name: 'Plate + Door' });
  await expect(recipeButton).toBeVisible();
  await recipeButton.click();

  await expect(page.getByText('Recipe Pressure Plate', { exact: true })).toBeVisible();
  await expect(page.getByText('Recipe Door', { exact: true })).toBeVisible();
  await expect(page.getByText('Recipe Test Crate', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Play', exact: true }).click();

  await expect(page.getByText(/Physics ready: 4 bodies at 60 Hz\./)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Opening Recipe Door\./)).toBeVisible({ timeout: 12_000 });

  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByText('Edit mode', { exact: true })).toBeVisible();
  await expect(recipeButton).toBeEnabled();
});
