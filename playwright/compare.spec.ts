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
	await expect(panel.getByRole('button', { name: /Mustasaari/ })).toBeVisible();
	await expect(panel.getByRole('button', { name: /Rääkkylä/ })).toBeVisible();

	// Five each way, ranked from the outside in: 1..5 and 304..300.
	await expect(panel.getByRole('button', { name: /^\d+ / })).toHaveCount(10);
	await expect(panel.getByRole('button', { name: /^3 Jomala/ })).toBeVisible();
	await expect(panel.getByRole('button', { name: /^302 Juuka/ })).toBeVisible();

	// Each row names the municipality's maakunta, which is most of what the two ends have to
	// say — the bottom is Karjala almost throughout.
	await expect(panel.getByRole('button', { name: /Jomala Ahvenanmaa/ })).toBeVisible();
	await expect(panel.getByRole('button', { name: /Mustasaari Pohjanmaa/ })).toBeVisible();
	await expect(panel.getByRole('button', { name: /Rääkkylä P-Karjala/ })).toBeVisible();

	// Picking one from the ranking selects it, exactly as picking a search result does.
	await panel.getByRole('button', { name: /Mustasaari/ }).click();
	await expect(panel.getByRole('heading', { name: 'Mustasaari' })).toBeVisible();
});

test('the panel shows the score, its rank, and the figures behind it', async ({ page }) => {
	await page.goto('./interactive/compare');

	const panel = page.getByRole('complementary');

	// Pirkkala: 9,5 % unemployment (62nd percentile — lower is better), +15,5 per 1 000 (98th),
	// 34 886 € (96th), 44,6 % with a degree (99th), a mean age of 41,3 (94th) and 0,2 points off
	// an even split (88th), so a score of 89,5 and 4th of the 304 scored municipalities.
	await page.getByRole('button', { name: /^Pirkkala,/ }).hover();

	await expect(panel.getByRole('heading', { name: 'Pirkkala' })).toBeVisible();
	await expect(panel.getByText('89,5', { exact: true })).toBeVisible();
	await expect(panel.getByText('rank 4 of 304')).toBeVisible();
	// The chip reads the score's *rank*, not the score: 4th of 304 is the top 10 %, where the
	// raw 89,5 fell just short of the 90 band and used to read "well above average".
	await expect(panel.getByText('top 10 %', { exact: true })).toBeVisible();
	// The maakunta, on every hover — 308 municipality names are not something anyone holds in
	// their head, and it's the region that locates an unfamiliar one.
	await expect(panel.getByText('Pirkanmaa', { exact: true })).toBeVisible();

	// One table row per indicator: the published figure and, in its own column, where that
	// figure puts the municipality in the distribution. Addressing them as rows is what pins
	// the columns — the two were once concatenated into a single "9,5 % · 62" cell.
	// Four columns: category, figure, its own ranking on that category alone, and the percentile
	// the score is a mean of. Addressing them as rows is what pins the columns.
	await expect(panel.getByRole('row', { name: 'Jobs 9,5 % 113/304 62' })).toBeVisible();
	await expect(panel.getByRole('row', { name: 'Income 34 886 € 13/308 96' })).toBeVisible();
	await expect(panel.getByRole('row', { name: 'Balance 0,2 pts 39/308 88' })).toBeVisible();
	// Jobs ranks out of 304, the rest out of 308 — four Åland municipalities publish no rate, and
	// a category ranks only the areas that have a figure for it, which is why the denominator is
	// printed per row rather than once in the header.
	await expect(panel.getByRole('row', { name: 'Education 44,6 % 4/308 99' })).toBeVisible();
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
	await expect(panel.getByRole('row', { name: 'People +19,5 ‰ 3/308 99' })).toBeVisible();
	await expect(panel.getByRole('row', { name: 'Income 33 411 € 29/308 91' })).toBeVisible();
	await expect(panel.getByRole('row', { name: 'Education 19,6 % 272/308 12' })).toBeVisible();
	await expect(panel.getByRole('row', { name: 'Age 48,6 yrs 154/308 50' })).toBeVisible();
	await expect(panel.getByRole('row', { name: 'Balance 0,6 pts 119/308 62' })).toBeVisible();
	// Two em dashes on the missing category: no rank either, since a rank counts only the areas
	// that have a figure.
	await expect(panel.getByRole('row', { name: 'Jobs no data — —' })).toBeVisible();
	await expect(panel.getByText(/Not scored: Jobs isn't published/)).toBeVisible();

	// And it's hatched on the map like every other area with no figure.
	await expect(page.getByRole('button', { name: /^Föglö,/ })).toHaveAttribute(
		'fill',
		'url(#no-data)'
	);
});

test('municipalities are coloured green through yellow to red by rank', async ({ page }) => {
	await page.goto('./interactive/compare');

	const expectFill = (name: string, fill: string) =>
		expect(page.getByRole('button', { name: new RegExp(`^${name},`) })).toHaveAttribute(
			'fill',
			fill
		);

	// A traffic light rather than the site's grey-midpoint scale — this is the one map whose
	// middle is a verdict ("middling") rather than an absence. Mustasaari (rank 1) takes the
	// deepest green, Rääkkylä (304th) the deepest red, and Loimaa the yellow middle.
	await expectFill('Mustasaari', '#1d6835');
	await expectFill('Rääkkylä', '#9a2929');
	await expectFill('Loimaa', '#ecd15f');
});

test("a municipality's score does not change when the Tampere tab is opened", async ({ page }) => {
	await page.goto('./interactive/compare');

	const panel = page.getByRole('complementary');

	await page.getByRole('button', { name: /^Nokia,/ }).hover();
	await expect(panel.getByText('rank 34 of 304')).toBeVisible();

	await page.getByRole('tab', { name: 'Tampere Metro' }).click();

	const map = page.getByRole('img', { name: 'Score by municipality in Tampere Metro' });
	await expect(map.getByRole('button')).toHaveCount(8);

	// Ranked against all 308, never against the metro's own eight — otherwise the same
	// municipality would carry two different numbers depending on which tab you arrived from.
	await page.getByRole('button', { name: /^Nokia,/ }).hover();
	await expect(panel.getByText('rank 34 of 304')).toBeVisible();
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

test('categories can be switched out of the score', async ({ page }) => {
	await page.goto('./interactive/compare');

	const panel = page.getByRole('complementary');
	const toggle = (name: string) => panel.getByRole('button', { name, exact: true });

	// All six on by default — the page means something before anything is configured.
	for (const name of ['Jobs', 'People', 'Income', 'Education', 'Age', 'Balance']) {
		await expect(toggle(name)).toHaveAttribute('aria-pressed', 'true');
	}

	await page.getByRole('button', { name: /^Pirkkala,/ }).hover();
	await expect(panel.getByRole('row', { name: /^Age / })).toBeVisible();
	await expect(panel.getByText('rank 4 of 304')).toBeVisible();

	// Switching one off drops its row and rescores everything from the remaining five.
	await toggle('Age').click();

	await expect(toggle('Age')).toHaveAttribute('aria-pressed', 'false');
	await page.getByRole('button', { name: /^Pirkkala,/ }).hover();
	await expect(panel.getByRole('row', { name: /^Age / })).toHaveCount(0);
	await expect(panel.getByRole('row', { name: /^Jobs / })).toBeVisible();
	await expect(panel.getByText('rank 4 of 304')).toHaveCount(0);

	// And back.
	await toggle('Age').click();
	await page.getByRole('button', { name: /^Pirkkala,/ }).hover();
	await expect(panel.getByText('rank 4 of 304')).toBeVisible();
});

test('dropping the unemployment category scores the Åland municipalities', async ({ page }) => {
	await page.goto('./interactive/compare');

	const panel = page.getByRole('complementary');

	// Föglö is unscored only because its unemployment rate is suppressed. Take that category out
	// and the coverage floor is satisfied by the five that remain.
	await page.getByRole('button', { name: /^Föglö,/ }).hover();
	await expect(panel.getByText('no score', { exact: true })).toBeVisible();

	await panel.getByRole('button', { name: 'Jobs', exact: true }).click();

	await page.getByRole('button', { name: /^Föglö,/ }).hover();
	await expect(panel.getByText('no score', { exact: true })).toHaveCount(0);
	await expect(panel.getByText(/rank \d+ of 308/)).toBeVisible();
});

test('switching every category off empties the score rather than breaking', async ({ page }) => {
	await page.goto('./interactive/compare');

	const panel = page.getByRole('complementary');

	for (const name of ['Jobs', 'People', 'Income', 'Education', 'Age', 'Balance']) {
		await panel.getByRole('button', { name, exact: true }).click();
	}

	await expect(panel.getByText('Nothing to score — switch a category back on.')).toBeVisible();
	await expect(page.getByRole('button', { name: /^Tampere,/ })).toHaveAttribute(
		'fill',
		'url(#no-data)'
	);
});
