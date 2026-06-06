import { expect, test } from '@playwright/test';

test('home page has expected footer', async ({ page }) => {
	await page.goto('/');

	const footerText = page.getByText('Created by Oskar Westmeijer');

	await expect(footerText).toBeVisible();
});
