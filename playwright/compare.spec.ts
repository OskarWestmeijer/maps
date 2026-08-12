import { expect, test } from '@playwright/test';

/**
 * The composite score. Unlike the other maps nothing here is a published figure — every
 * number is derived from the exports at page load — so these assertions double as the
 * end-to-end check that the formula in `score.ts` survives the fetch, the join and the render.
 */

test('the map switch reaches the compare map', async ({ page }) => {
	await page.goto('./interactive/unemployment');

	const nav = page.getByRole('navigation', { name: 'Interactive maps' });
	await nav.getByRole('link', { name: /Compare/ }).click();

	await expect(page.getByRole('img', { name: /^Score/ })).toBeVisible();
	await expect(nav.getByRole('link', { name: /Compare/ })).toHaveAttribute('aria-current', 'page');
});

test('every municipality is drawn and the ends of the ranking are offered', async ({ page }) => {
	await page.goto('./interactive/compare');

	const map = page.getByRole('img', { name: 'Score by municipality in Finland' });
	await expect(map.getByRole('button')).toHaveCount(308);

	// A national composite would be Finland's percentile among itself, so the no-selection
	// panel shows the ranking's two ends instead. 304 of 308 are scored — the other four have
	// no published unemployment rate.
	const panel = page.getByRole('complementary');
	await expect(panel.getByRole('button', { name: /Saltvik/ })).toBeVisible();
	await expect(panel.getByRole('button', { name: /Rääkkylä/ })).toBeVisible();

	// Five each way, ranked from the outside in: 1..5 and 304..300.
	await expect(panel.getByRole('button', { name: /^\d+ / })).toHaveCount(10);
	await expect(panel.getByRole('button', { name: /^5 Sipoo/ })).toBeVisible();
	await expect(panel.getByRole('button', { name: /^300 Ilomantsi/ })).toBeVisible();

	// Each row names the municipality's maakunta, which is most of what the two ends have to
	// say — the top is almost all Ahvenanmaa, the bottom is Karjala.
	await expect(panel.getByRole('button', { name: /Saltvik Ahvenanmaa/ })).toBeVisible();
	await expect(panel.getByRole('button', { name: /Rääkkylä P-Karjala/ })).toBeVisible();

	// Picking one from the ranking selects it, exactly as picking a search result does.
	await panel.getByRole('button', { name: /Saltvik/ }).click();
	await expect(panel.getByRole('heading', { name: 'Saltvik' })).toBeVisible();
});

test('the panel shows the score, its rank, and the figures behind it', async ({ page }) => {
	await page.goto('./interactive/compare');

	const panel = page.getByRole('complementary');

	// Pirkkala: 9,5 % unemployment (62nd percentile — lower is better) and +15,5 per 1 000
	// (98th), so a score of 80,0 and 29th of the 304 scored municipalities.
	await page.getByRole('button', { name: /^Pirkkala,/ }).hover();

	await expect(panel.getByRole('heading', { name: 'Pirkkala' })).toBeVisible();
	await expect(panel.getByText('85,3', { exact: true })).toBeVisible();
	await expect(panel.getByText('rank 21 of 304')).toBeVisible();
	await expect(panel.getByText('well above average', { exact: true })).toBeVisible();
	// The maakunta, on every hover — 308 municipality names are not something anyone holds in
	// their head, and it's the region that locates an unfamiliar one.
	await expect(panel.getByText('Pirkanmaa', { exact: true })).toBeVisible();

	// One table row per indicator: the published figure and, in its own column, where that
	// figure puts the municipality in the distribution. Addressing them as rows is what pins
	// the columns — the two were once concatenated into a single "9,5 % · 62" cell.
	await expect(panel.getByRole('row', { name: 'Jobs 9,5 % 62' })).toBeVisible();
	await expect(panel.getByRole('row', { name: 'People +15,5 per 1 000 98' })).toBeVisible();
	await expect(panel.getByRole('row', { name: 'Income 34 886 € 96' })).toBeVisible();
});

test('a municipality missing an indicator is left unscored, not scored on the rest', async ({
	page
}) => {
	await page.goto('./interactive/compare');

	const panel = page.getByRole('complementary');

	// The regression the coverage floor exists to prevent. Föglö's unemployment rate is
	// suppressed; on its population change alone it would rank first in the country.
	await page.getByRole('button', { name: /^Föglö,/ }).hover();

	await expect(panel.getByRole('heading', { name: 'Föglö' })).toBeVisible();
	await expect(panel.getByText('no score', { exact: true })).toBeVisible();
	await expect(panel.getByText('unranked of 304')).toBeVisible();
	// The figure it does have is still shown, with an em dash where the percentile would be,
	// and the panel says why that isn't enough.
	await expect(panel.getByRole('row', { name: 'People +19,5 per 1 000 99' })).toBeVisible();
	await expect(panel.getByRole('row', { name: 'Income 33 411 € 91' })).toBeVisible();
	await expect(panel.getByRole('row', { name: 'Jobs no data —' })).toBeVisible();
	await expect(panel.getByText(/Not scored: Jobs isn't published/)).toBeVisible();

	// And it's hatched on the map like every other area with no figure.
	await expect(page.getByRole('button', { name: /^Föglö,/ })).toHaveAttribute(
		'fill',
		'url(#no-data)'
	);
});

test('municipalities are coloured by where their score sits, diverging around 50', async ({
	page
}) => {
	await page.goto('./interactive/compare');

	const expectFill = (name: string, fill: string) =>
		expect(page.getByRole('button', { name: new RegExp(`^${name},`) })).toHaveAttribute(
			'fill',
			fill
		);

	// The site's shared green/red: Saltvik (97,8) takes the deepest green, Rääkkylä (3,3) the
	// deepest red, and Tampere (49,9) the neutral middle.
	await expectFill('Saltvik', '#1d6835');
	await expectFill('Rääkkylä', '#9a2929');
	await expectFill('Tampere', '#c5cbd2');
});

test("a municipality's score does not change when the Tampere tab is opened", async ({ page }) => {
	await page.goto('./interactive/compare');

	const panel = page.getByRole('complementary');

	await page.getByRole('button', { name: /^Nokia,/ }).hover();
	await expect(panel.getByText('rank 80 of 304')).toBeVisible();

	await page.getByRole('tab', { name: 'Tampere Metro' }).click();

	const map = page.getByRole('img', { name: 'Score by municipality in Tampere Metro' });
	await expect(map.getByRole('button')).toHaveCount(8);

	// Ranked against all 308, never against the metro's own eight — otherwise the same
	// municipality would carry two different numbers depending on which tab you arrived from.
	await page.getByRole('button', { name: /^Nokia,/ }).hover();
	await expect(panel.getByText('rank 80 of 304')).toBeVisible();
});

test('the Tampere tab lists its eight once each, drawn from its own geometry', async ({ page }) => {
	await page.goto('./interactive/compare');
	await page.getByRole('tab', { name: 'Tampere Metro' }).click();

	const panel = page.getByRole('complementary');

	// Eight areas against a five-and-five ranking: the lower block takes what's left rather
	// than the last five, so nothing appears in both. Every municipality shows up once.
	await expect(panel.getByRole('button', { name: /^\d+ / })).toHaveCount(8);
	await expect(panel.getByRole('button', { name: /Ylöjärvi/ })).toHaveCount(1);
	await expect(panel.getByRole('button', { name: /Kangasala/ })).toHaveCount(1);
	// All eight are Pirkanmaa, so the region column would be one word repeated — it's dropped.
	await expect(panel.getByRole('button', { name: /Pirkanmaa/ })).toHaveCount(0);

	// The metro has its own, finer geometry file; reusing the national payload's shapes here
	// drew the right municipalities at the whole-country map's 2 km simplification.
	const detail = await page
		.getByRole('button', { name: /^Nokia,/ })
		.evaluate((node) => node.getAttribute('d')?.length ?? 0);

	expect(detail).toBeGreaterThan(2000);
});

test('regions are ranked among themselves, on their own figures', async ({ page }) => {
	await page.goto('./interactive/compare');

	const panel = page.getByRole('complementary');

	await page.getByRole('tab', { name: 'Region' }).click();

	const map = page.getByRole('img', { name: 'Score by region in Finland' });
	await expect(map.getByRole('button')).toHaveCount(19);

	// 19 areas, so a rank out of 19 — a percentile only means something inside one set of
	// areas, which is why a region's score isn't comparable to a municipality's.
	await page.getByRole('button', { name: /^Pirkanmaa,/ }).hover();
	await expect(panel.getByRole('heading', { name: 'Pirkanmaa' })).toBeVisible();
	await expect(panel.getByText(/rank \d+ of 19/)).toBeVisible();
});
