import { expect, test } from '@playwright/test';

test('education map renders every municipality and its national figures', async ({ page }) => {
	await page.goto('./interactive/education');

	const map = page.getByRole('img', {
		name: 'Share with a higher education degree by municipality in Finland'
	});
	await expect(map).toBeVisible();
	await expect(map.getByRole('button')).toHaveCount(308);

	// Whole-country figures before anything is hovered.
	const panel = page.getByRole('complementary');
	await expect(page.getByText('Data from 2025')).toBeVisible();
	await expect(panel.getByText('34,5 %', { exact: true })).toBeVisible();
	await expect(panel.getByText('39,7 %', { exact: true })).toBeVisible();
	await expect(panel.getByText('24,6 %', { exact: true })).toBeVisible();
	await expect(panel.getByText('403,2', { exact: true })).toBeVisible();
	// The 15+ population, not the väkiluku the population map shows.
	await expect(panel.getByText('4 845 151', { exact: true })).toBeVisible();
	// No chip on the national panel: the country isn't an area on this map, and its own share is
	// deliberately not the midpoint. The line that replaces it explains the grey band instead.
	await expect(panel.getByText('vs median municipality')).toHaveCount(0);
	// `\s+` where the source happens to wrap: unlike string matching, a regex is tested against
	// the text as-is, so a prettier line break inside the sentence would fail a literal space.
	await expect(
		panel.getByText(/Grey is the median municipality, 24,5 %\s+— half are above, half below/)
	).toBeVisible();
	await expect(panel.getByText(/Finland's\s+own 34,5 % is higher/)).toBeVisible();
});

test('hovering a municipality shows its share against the national one', async ({ page }) => {
	await page.goto('./interactive/education');

	const panel = page.getByRole('complementary');

	await page.getByRole('button', { name: /^Helsinki,/ }).hover();

	await expect(panel.getByRole('heading', { name: 'Helsinki' })).toBeVisible();
	// The maakunta, so an unfamiliar municipality is locatable without leaving the panel.
	await expect(panel.getByText('Uusimaa', { exact: true })).toBeVisible();
	await expect(panel.getByText('46,6 %', { exact: true })).toBeVisible();
	// Percentage *points*, not percent: the measure is itself a percentage. Against the median
	// municipality rather than Finland, because that is what the colour beneath the chip does.
	await expect(panel.getByText('+22,1 pts', { exact: true })).toBeVisible();
	await expect(panel.getByText('vs median municipality', { exact: true })).toBeVisible();

	// The lowest share in the country, and the far end of the ramp from Helsinki.
	await page.getByRole('button', { name: /^Kivijärvi,/ }).hover();

	await expect(panel.getByText('13,0 %', { exact: true })).toBeVisible();
	await expect(panel.getByText('−11,5 pts', { exact: true })).toBeVisible();
});

test('municipalities are colour coded around the median municipality', async ({ page }) => {
	await page.goto('./interactive/education');

	// `toHaveAttribute` rather than a bare `getAttribute`: the figures are fetched from /data/
	// after the page loads, so before they land every area is hatched. A one-shot read here
	// races that and sees `url(#no-data)`.
	const expectFill = (name: string, fill: string) =>
		expect(page.getByRole('button', { name: new RegExp(`^${name},`) })).toHaveAttribute(
			'fill',
			fill
		);

	// The site's shared green/grey/red, diverging around the median municipality (24,5 %) rather
	// than around Finland's own 34,5 % — only 42 of 308 reach that, so pivoting there would paint
	// 86 % of the map red. Kauniainen (+36,6 pts) takes the deepest green, Kivijärvi (−11,5) the
	// deepest red, and Kuusamo (−0,2) the neutral middle.
	await expectFill('Kauniainen', '#1d6835');
	await expectFill('Muhos', '#5a8f65');
	await expectFill('Kuusamo', '#c5cbd2');
	await expectFill('Äänekoski', '#de958e');
	await expectFill('Kivijärvi', '#9a2929');
});

test('the region tab reads published regional shares', async ({ page }) => {
	await page.goto('./interactive/education');

	const panel = page.getByRole('complementary');

	await page.getByRole('tab', { name: 'Region' }).click();

	const map = page.getByRole('img', {
		name: 'Share with a higher education degree by region in Finland'
	});
	await expect(map.getByRole('button')).toHaveCount(19);

	await page.getByRole('button', { name: /^Pirkanmaa,/ }).hover();
	await expect(panel.getByRole('heading', { name: 'Pirkanmaa' })).toBeVisible();
	await expect(panel.getByText('36,2 %', { exact: true })).toBeVisible();
	await expect(panel.getByText('421,9', { exact: true })).toBeVisible();
});

test('the Tampere tab combines its eight municipalities exactly', async ({ page }) => {
	await page.goto('./interactive/education');

	const panel = page.getByRole('complementary');

	await page.getByRole('tab', { name: 'Tampere Metro' }).click();

	const map = page.getByRole('img', {
		name: 'Share with a higher education degree by municipality in Tampere Metro'
	});
	await expect(map.getByRole('button')).toHaveCount(8);

	// The contrast with the income map, which has no metro headline and cannot have one: a share
	// of a headcount combines exactly, so this figure is real — the eight municipalities'
	// degree-holders over their 15+ residents.
	await expect(panel.getByRole('heading', { name: 'Tampere Metro' })).toBeVisible();
	await expect(panel.getByText('39,3 %', { exact: true })).toBeVisible();
	await expect(panel.getByText('366 554', { exact: true })).toBeVisible();
	// ...except the education level index, which averages a population this export doesn't count.
	await expect(panel.getByText('—', { exact: true })).toBeVisible();

	await page.getByRole('button', { name: /^Pirkkala,/ }).hover();
	await expect(panel.getByRole('heading', { name: 'Pirkkala' })).toBeVisible();
	await expect(panel.getByText('44,6 %', { exact: true })).toBeVisible();
	await expect(panel.getByText('+20,1 pts', { exact: true })).toBeVisible();
});
