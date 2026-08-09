import { expect, test } from '@playwright/test';

// The interactive page is meant to sit in a single viewport on a desktop screen: no
// vertical scrollbar, and the legend + info button visible without scrolling.
const desktops = [
	{ name: '1280x720 (small laptop)', width: 1280, height: 720 },
	{ name: '1440x900 (macbook)', width: 1440, height: 900 },
	{ name: '1920x1080 (desktop)', width: 1920, height: 1080 }
];

async function expectFitsOneScreen(page: import('@playwright/test').Page) {
	const overflow = await page.evaluate(
		() => document.documentElement.scrollHeight - window.innerHeight
	);

	expect(overflow, `page overflows viewport by ${overflow}px`).toBeLessThanOrEqual(0);

	// The search box and Sources popover are the things most likely to be pushed below the fold.
	await expect(page.getByPlaceholder('Search municipality…')).toBeInViewport();
	await expect(page.getByRole('group').filter({ hasText: 'Sources' })).toBeInViewport();
}

for (const size of desktops) {
	test(`fits one screen at ${size.name}`, async ({ page }) => {
		await page.setViewportSize({ width: size.width, height: size.height });
		await page.goto('./interactive');

		await expectFitsOneScreen(page);

		// The Tampere view adds a region-toggle row above the map and a differently-shaped
		// panel (no survey row) — check it separately, since switching is a client-side
		// toggle rather than a full page reload that would already be covered above.
		await page.getByRole('tab', { name: 'Tampere Metro' }).click();
		await expectFitsOneScreen(page);
	});
}
