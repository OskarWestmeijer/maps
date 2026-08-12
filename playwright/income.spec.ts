import { expect, test } from '@playwright/test';

test('income map renders every municipality and its national figures', async ({ page }) => {
	await page.goto('./interactive/income');

	const map = page.getByRole('img', {
		name: 'Median disposable income by municipality in Finland'
	});
	await expect(map).toBeVisible();
	await expect(map.getByRole('button')).toHaveCount(308);

	// Whole-country figures before anything is hovered.
	const panel = page.getByRole('complementary');
	await expect(page.getByText('Data from 2024')).toBeVisible();
	await expect(panel.getByText('30 523 €', { exact: true })).toBeVisible();
	await expect(panel.getByText('26 605 €', { exact: true })).toBeVisible();
	await expect(panel.getByText('14,2 %', { exact: true })).toBeVisible();
	await expect(panel.getByText('28,4', { exact: true })).toBeVisible();
	// Asuntoväestö, not väkiluku — 147 435 fewer people than the population map's 5 652 881,
	// and the row says why rather than leaving two near-identical figures to be reconciled.
	await expect(panel.getByText('5 505 446', { exact: true })).toBeVisible();
	await expect(panel.getByText(/People counted/)).toBeVisible();
	await expect(panel.getByText(/excludes care homes, institutions/)).toBeVisible();
	// Gini is meaningless without its endpoints, so the label and hint carry them.
	await expect(panel.getByText('Gini (0–100)')).toBeVisible();
	await expect(panel.getByText(/0 = everyone earns the same/)).toBeVisible();
	// No chip on the national panel — it would compare the country with itself and read a
	// trivially true 0,0 %. Nothing stands in for it either.
	await expect(panel.getByText('vs Finland')).toHaveCount(0);
});

test('hovering a municipality shows its median against the national one', async ({ page }) => {
	await page.goto('./interactive/income');

	const panel = page.getByRole('complementary');

	// A city well above the national median.
	await page.getByRole('button', { name: /^Helsinki,/ }).hover();

	await expect(panel.getByRole('heading', { name: 'Helsinki' })).toBeVisible();
	// The maakunta, so an unfamiliar municipality is locatable without leaving the panel.
	await expect(panel.getByText('Uusimaa', { exact: true })).toBeVisible();
	await expect(panel.getByText('33 525 €', { exact: true })).toBeVisible();
	// The chip: a percentage rather than a euro gap, tinted with the map's own fill. It is the
	// only place the colour is explained — there is deliberately no second row repeating it as
	// a class name ("far above"), which read as a vaguer duplicate of this number.
	await expect(panel.getByText('+9,8 %', { exact: true })).toBeVisible();
	await expect(panel.getByText('vs Finland', { exact: true })).toBeVisible();

	// The lowest median in the country.
	await page.getByRole('button', { name: /^Rautavaara,/ }).hover();

	await expect(panel.getByText('24 794 €', { exact: true })).toBeVisible();
	await expect(panel.getByText('−18,8 %', { exact: true })).toBeVisible();
	await expect(panel.getByText('23,0 %', { exact: true })).toBeVisible();
});

test('a suppressed figure is an em dash, not a zero', async ({ page }) => {
	await page.goto('./interactive/income');

	const panel = page.getByRole('complementary');

	// Sottunga has a published median but no at-risk-of-poverty rate — 101 people is too few
	// to publish one for. The median is still shown, and the map still colours it.
	await page.getByRole('button', { name: /^Sottunga,/ }).hover();

	await expect(panel.getByText('35 446 €', { exact: true })).toBeVisible();
	await expect(panel.getByText('—', { exact: true })).toBeVisible();
});

test('municipalities are colour coded by distance from the national median', async ({ page }) => {
	await page.goto('./interactive/income');

	// `toHaveAttribute` rather than a bare `getAttribute`: the figures are fetched from /data/
	// after the page loads, so before they land every area is hatched. A one-shot read here
	// races that and sees `url(#no-data)`.
	const expectFill = (name: string, fill: string) =>
		expect(page.getByRole('button', { name: new RegExp(`^${name},`) })).toHaveAttribute(
			'fill',
			fill
		);

	// A diverging scale around the national median, in the site's shared green/grey/red — but
	// with the arms the other way up from the unemployment map, since here a high figure is the
	// good direction. Kauniainen (+62,9 %) takes the deepest green, Rautavaara (−18,8 %) the
	// deepest red, and Tampere (−4,7 %) the light red just past the neutral band.
	await expectFill('Kauniainen', '#1d6835');
	await expectFill('Rautavaara', '#9a2929');
	await expectFill('Tampere', '#de958e');
});

test('the region tab reads published regional medians rather than deriving them', async ({
	page
}) => {
	await page.goto('./interactive/income');

	const panel = page.getByRole('complementary');

	await page.getByRole('tab', { name: 'Region' }).click();

	const map = page.getByRole('img', { name: 'Median disposable income by region in Finland' });
	await expect(map.getByRole('button')).toHaveCount(19);

	// 14ww publishes MK rows, computed from the household data — the only way a regional median
	// can be had, since it cannot be averaged out of its municipalities.
	await page.getByRole('button', { name: /^Pirkanmaa,/ }).hover();
	await expect(panel.getByRole('heading', { name: 'Pirkanmaa' })).toBeVisible();
	await expect(panel.getByText('30 117 €', { exact: true })).toBeVisible();
	await expect(panel.getByText('533 813', { exact: true })).toBeVisible();
});

test('the Tampere tab shows no combined median, and says why', async ({ page }) => {
	await page.goto('./interactive/income');

	const panel = page.getByRole('complementary');

	await page.getByRole('tab', { name: 'Tampere Metro' }).click();

	const map = page.getByRole('img', {
		name: 'Median disposable income by municipality in Tampere Metro'
	});
	await expect(map.getByRole('button')).toHaveCount(8);

	// The one tab with no headline figure: a median isn't additive, and Statistics Finland
	// publishes no row for this particular set of eight municipalities.
	await expect(panel.getByText('No combined figure for Tampere Metro.')).toBeVisible();
	await expect(panel.getByText(/A median can't be summed/)).toBeVisible();

	// The municipalities themselves still carry their own published figures.
	await page.getByRole('button', { name: /^Pirkkala,/ }).hover();
	await expect(panel.getByRole('heading', { name: 'Pirkkala' })).toBeVisible();
	await expect(panel.getByText('34 886 €', { exact: true })).toBeVisible();
	await expect(panel.getByText('+14,3 %', { exact: true })).toBeVisible();
});
