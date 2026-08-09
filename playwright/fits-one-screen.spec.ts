import { expect, test } from '@playwright/test';

// The interactive page is meant to sit in a single viewport on a desktop screen: no
// vertical scrollbar, and the legend + info button visible without scrolling.
const desktops = [
	{ name: '1280x720 (small laptop)', width: 1280, height: 720 },
	{ name: '1440x900 (macbook)', width: 1440, height: 900 },
	{ name: '1920x1080 (desktop)', width: 1920, height: 1080 }
];

for (const size of desktops) {
	test(`fits one screen at ${size.name}`, async ({ page }) => {
		await page.setViewportSize({ width: size.width, height: size.height });
		await page.goto('./interactive');

		const overflow = await page.evaluate(
			() => document.documentElement.scrollHeight - window.innerHeight
		);

		expect(overflow, `page overflows viewport by ${overflow}px`).toBeLessThanOrEqual(0);

		// The legend is the thing most likely to be pushed below the fold.
		await expect(page.getByText('18 and over %')).toBeInViewport();
		await expect(page.getByRole('group').filter({ hasText: 'Sources' })).toBeInViewport();
	});
}
