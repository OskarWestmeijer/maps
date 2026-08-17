import { expect, test } from '@playwright/test';

test('age map renders every municipality and its national figures', async ({ page }) => {
	await page.goto('./interactive/age');

	const map = page.getByRole('img', { name: 'Average age by municipality in Finland' });
	await expect(map).toBeVisible();
	await expect(map.getByRole('button')).toHaveCount(308);

	const panel = page.getByRole('complementary');
	await expect(page.getByText('Data from 2025')).toBeVisible();
	await expect(panel.getByText('44,1', { exact: true })).toBeVisible();
	await expect(panel.getByText('14,3 %', { exact: true })).toBeVisible();
	await expect(panel.getByText('23,8 %', { exact: true })).toBeVisible();
	// No chip on the national panel — the line explaining the grey band takes its place.
	await expect(panel.getByText('vs median municipality')).toHaveCount(0);
	await expect(
		panel.getByText(/Grey is the median municipality, 48,6 years\s+— half are above, half below/)
	).toBeVisible();
});

test('hovering a municipality shows its mean age against the median one', async ({ page }) => {
	await page.goto('./interactive/age');

	const panel = page.getByRole('complementary');

	await page.getByRole('button', { name: /^Helsinki,/ }).hover();

	await expect(panel.getByRole('heading', { name: 'Helsinki' })).toBeVisible();
	await expect(panel.getByText('41,2', { exact: true })).toBeVisible();
	await expect(panel.getByText('−7,4 yrs', { exact: true })).toBeVisible();
	await expect(panel.getByText('vs median municipality', { exact: true })).toBeVisible();

	// The oldest municipality in the country.
	await page.getByRole('button', { name: /^Rääkkylä,/ }).hover();

	await expect(panel.getByText('59,5', { exact: true })).toBeVisible();
	await expect(panel.getByText('+10,9 yrs', { exact: true })).toBeVisible();
});

test('young municipalities are green and old ones red', async ({ page }) => {
	await page.goto('./interactive/age');

	// `toHaveAttribute` rather than a bare `getAttribute`: the figures arrive after first paint.
	const expectFill = (name: string, fill: string) =>
		expect(page.getByRole('button', { name: new RegExp(`^${name},`) })).toHaveAttribute(
			'fill',
			fill
		);

	// The arms are the other way up from the education map's, because a lower figure is treated
	// as the better direction. Pivoting on the median municipality (48,6), not Finland's 44,1 —
	// only 58 of the 308 are below that. Luoto is youngest at 34,1, Rääkkylä oldest at 59,5.
	await expectFill('Luoto', '#1d6835');
	await expectFill('Rauma', '#90b697');
	await expectFill('Äänekoski', '#c5cbd2');
	await expectFill('Virrat', '#bd615b');
	await expectFill('Rääkkylä', '#9a2929');
});

test('the region tab reads published regional figures', async ({ page }) => {
	await page.goto('./interactive/age');

	const panel = page.getByRole('complementary');

	await page.getByRole('tab', { name: 'Region' }).click();

	const map = page.getByRole('img', { name: 'Average age by region in Finland' });
	await expect(map.getByRole('button')).toHaveCount(19);

	await page.getByRole('button', { name: /^Pirkanmaa,/ }).hover();
	await expect(panel.getByRole('heading', { name: 'Pirkanmaa' })).toBeVisible();
	await expect(panel.getByText('43,3', { exact: true })).toBeVisible();
});

test('the Tampere tab weights its eight municipalities by population', async ({ page }) => {
	await page.goto('./interactive/age');

	const panel = page.getByRole('complementary');

	await page.getByRole('tab', { name: 'Tampere Metro' }).click();

	const map = page.getByRole('img', { name: 'Average age by municipality in Tampere Metro' });
	await expect(map.getByRole('button')).toHaveCount(8);

	// A weighted mean, not an average of the eight: Tampere counts for more than Vesilahti.
	await expect(panel.getByRole('heading', { name: 'Tampere Metro' })).toBeVisible();
	await expect(panel.getByText('41,6', { exact: true })).toBeVisible();

	await page.getByRole('button', { name: /^Pirkkala,/ }).hover();
	await expect(panel.getByRole('heading', { name: 'Pirkkala' })).toBeVisible();
	await expect(panel.getByText('41,3', { exact: true })).toBeVisible();
	await expect(panel.getByText('−7,3 yrs', { exact: true })).toBeVisible();
});
