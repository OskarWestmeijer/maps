import { expect, test } from '@playwright/test';

test('home page test', async ({ page }) => {
	await page.goto('./');

	await expect(page).toHaveTitle('Maps | QGIS');
	await expect(page.getByText('Created by Oskar Westmeijer')).toBeVisible();
});

test('gallery tile links to its detail page', async ({ page }) => {
	await page.goto('./');

	const tile = page.getByRole('link').filter({ hasText: 'Finland | Political' });
	await expect(tile).toBeVisible();

	await tile.click();

	await expect(page).toHaveURL(/\/gallery\/finland-political$/);
	await expect(page.getByRole('heading', { name: 'Finland | Political' })).toBeVisible();
});
