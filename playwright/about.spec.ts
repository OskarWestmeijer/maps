import { expect, test } from '@playwright/test';

test('about page test', async ({ page }) => {
	await page.goto('./about');

	await expect(page).toHaveTitle('Maps | QGIS');
	await expect(page.getByRole('heading', { name: 'I like maps' })).toBeVisible();
});
