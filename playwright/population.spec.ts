import { expect, test } from '@playwright/test';

test('/interactive redirects to the default map', async ({ page }) => {
	await page.goto('./interactive');

	await expect(page).toHaveURL(/\/interactive\/unemployment$/);
});

test('the map switch moves between the two interactive maps', async ({ page }) => {
	await page.goto('./interactive/unemployment');

	const nav = page.getByRole('navigation', { name: 'Interactive maps' });
	await expect(nav.getByRole('link', { name: /Unemployment/ })).toHaveAttribute(
		'aria-current',
		'page'
	);

	await nav.getByRole('link', { name: /Population/ }).click();

	await expect(page.getByRole('img', { name: /^Population change/ })).toBeVisible();
	await expect(nav.getByRole('link', { name: /Population/ })).toHaveAttribute(
		'aria-current',
		'page'
	);
});

test('population map renders every municipality and its national figures', async ({ page }) => {
	await page.goto('./interactive/population');

	const map = page.getByRole('img', { name: 'Population change by municipality in Finland' });
	await expect(map).toBeVisible();
	await expect(map.getByRole('button')).toHaveCount(308);

	// Whole-country figures before anything is hovered: +16 910 people on 5 652 881 is +3,0
	// per 1 000, and it happened despite natural change of −13 377, on net migration +31 233.
	const panel = page.getByRole('complementary');
	await expect(page.getByText('Data from 2025')).toBeVisible();
	await expect(panel.getByText('+3,0', { exact: true })).toBeVisible();
	await expect(panel.getByText('+16 910 people', { exact: true })).toBeVisible();
	// The country is what everything else is measured against, so it says so rather than
	// comparing with itself and reading a trivially true 0,0.
	await expect(panel.getByText('baseline', { exact: true })).toBeVisible();
	await expect(panel.getByText('−13 377', { exact: true })).toBeVisible();
	await expect(panel.getByText('+31 233', { exact: true })).toBeVisible();
	// Density is still there, just no longer what the colour means.
	await expect(panel.getByText('18,6 / km²', { exact: true })).toBeVisible();
	await expect(panel.getByText('5 652 881', { exact: true })).toBeVisible();
});

test('hovering a municipality shows how much it grew or shrank', async ({ page }) => {
	await page.goto('./interactive/population');

	const panel = page.getByRole('complementary');

	// A city that grew: +10 374 people on 694 392 is +14,9 per 1 000, 11,9 points above the
	// national +3,0 — and almost all of it migration rather than births.
	await page.getByRole('button', { name: /^Helsinki,/ }).hover();

	await expect(panel.getByRole('heading', { name: 'Helsinki' })).toBeVisible();
	await expect(panel.getByText('+14,9', { exact: true })).toBeVisible();
	await expect(panel.getByText('+10 374 people', { exact: true })).toBeVisible();
	await expect(panel.getByText('+11,9 pts', { exact: true })).toBeVisible();
	await expect(panel.getByText('growing', { exact: true })).toBeVisible();

	// A village that shrank hardest in relative terms: 16 people out of 211.
	await page.getByRole('button', { name: /^Kökar,/ }).hover();

	await expect(panel.getByText('−75,8', { exact: true })).toBeVisible();
	await expect(panel.getByText('−16 people', { exact: true })).toBeVisible();
	await expect(panel.getByText('shrinking fast', { exact: true })).toBeVisible();
});

test('municipalities are colour coded by growth or decline around zero', async ({ page }) => {
	await page.goto('./interactive/population');

	const fill = (name: string) =>
		page.getByRole('button', { name: new RegExp(`^${name},`) }).getAttribute('fill');

	// A diverging scale anchored at zero, in the same green/grey/red the unemployment map
	// uses: Kökar (−75,8) takes the deepest red, Pelkosenniemi (+23,6) the deepest green, and
	// Rauma (−5,0) the light red on the way in.
	expect(await fill('Kökar')).toBe('#9a2929');
	expect(await fill('Pelkosenniemi')).toBe('#1d6835');
	expect(await fill('Rauma')).toBe('#de958e');
});

test('the region tab rolls municipalities up into maakunnat', async ({ page }) => {
	await page.goto('./interactive/population');

	const panel = page.getByRole('complementary');

	await page.getByRole('tab', { name: 'Region' }).click();

	const map = page.getByRole('img', { name: 'Population change by region in Finland' });
	await expect(map.getByRole('button')).toHaveCount(19);

	// Neither the population export nor the maakunta geometry carries region figures, so every
	// figure here is summed from member municipalities: Uusimaa is 1 799 629 people, and its
	// rate is recomputed from the summed counts rather than averaged across 26 municipalities.
	await page.getByRole('button', { name: /^Uusimaa,/ }).hover();
	await expect(panel.getByRole('heading', { name: 'Uusimaa' })).toBeVisible();
	await expect(panel.getByText('1 799 629', { exact: true })).toBeVisible();
	await expect(panel.getByText('197,5 / km²', { exact: true })).toBeVisible();
});

test('the Tampere tab scopes the population map to that region', async ({ page }) => {
	await page.goto('./interactive/population');

	const panel = page.getByRole('complementary');

	await page.getByRole('tab', { name: 'Tampere Metro' }).click();

	const map = page.getByRole('img', {
		name: 'Population change by municipality in Tampere Metro'
	});
	await expect(map.getByRole('button')).toHaveCount(8);

	// Rolled up from the 8 municipalities: +4 462 people on 427 749, so +10,4 per 1 000 —
	// 7,4 points above the country, which is the region's whole story in one number.
	await expect(panel.getByRole('heading', { name: 'Tampere Metro' })).toBeVisible();
	await expect(panel.getByText('427 749', { exact: true })).toBeVisible();
	await expect(panel.getByText('+10,4', { exact: true })).toBeVisible();
	await expect(panel.getByText('+7,4 pts', { exact: true })).toBeVisible();
});
