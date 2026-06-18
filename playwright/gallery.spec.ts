import { expect, test } from '@playwright/test';

test('gallery detail page renders directly from its URL', async ({ page }) => {
	await page.goto('./gallery/nl-forest');

	await expect(page.getByRole('heading', { name: 'Netherlands forest coverage' })).toBeVisible();
});

test('back link returns to the gallery', async ({ page }) => {
	await page.goto('./gallery/nl-forest');

	await page.getByRole('link', { name: 'Back to Gallery' }).click();

	await expect(page).toHaveURL('/');
});
