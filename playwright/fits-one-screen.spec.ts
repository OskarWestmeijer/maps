import { expect, test } from '@playwright/test';

// Both interactive maps are meant to sit in a single viewport on a desktop screen: no
// vertical scrollbar, and the search box + info button visible without scrolling. The map
// switch above them eats into that budget (see `--map-chrome` in the interactive layout),
// which is the thing most likely to push the panel below the fold.
const desktops = [
	{ name: '1280x720 (small laptop)', width: 1280, height: 720 },
	{ name: '1440x900 (macbook)', width: 1440, height: 900 },
	{ name: '1920x1080 (desktop)', width: 1920, height: 1080 }
];

async function expectFitsOneScreen(page: import('@playwright/test').Page) {
	// Measure only once the figures have arrived from /data/. A panel full of em dashes is
	// shorter than one full of numbers, so measuring mid-fetch would let real overflow past.
	// The period line is blank until the register file lands, which makes it the signal.
	await expect(page.getByText(/^Data from /)).toBeVisible();

	const overflow = await page.evaluate(
		() => document.documentElement.scrollHeight - window.innerHeight
	);

	expect(overflow, `page overflows viewport by ${overflow}px`).toBeLessThanOrEqual(0);

	// The search box and Sources popover are the things most likely to be pushed below the fold.
	await expect(page.getByPlaceholder('Search municipality…')).toBeInViewport();
	await expect(page.getByRole('group').filter({ hasText: 'Sources' })).toBeInViewport();
}

const maps = ['./interactive/unemployment', './interactive/population'];

for (const size of desktops) {
	for (const map of maps) {
		test(`${map.split('/').pop()} fits one screen at ${size.name}`, async ({ page }) => {
			await page.setViewportSize({ width: size.width, height: size.height });
			await page.goto(map);

			await expectFitsOneScreen(page);

			// The Tampere view has a differently-shaped panel (the unemployment map drops its
			// survey row there) — check it separately, since switching is a client-side toggle
			// rather than a full page reload that would already be covered above.
			await page.getByRole('tab', { name: 'Tampere Metro' }).click();
			await expectFitsOneScreen(page);
		});
	}
}
