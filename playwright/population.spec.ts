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

	await expect(page.getByRole('img', { name: /^Population density/ })).toBeVisible();
	await expect(nav.getByRole('link', { name: /Population/ })).toHaveAttribute(
		'aria-current',
		'page'
	);
});

test('population map renders every municipality and its national figures', async ({ page }) => {
	await page.goto('./interactive/population');

	const map = page.getByRole('img', { name: 'Population density by municipality in Finland' });
	await expect(map).toBeVisible();
	await expect(map.getByRole('button')).toHaveCount(308);

	// Whole-country figures before anything is hovered: 5 652 881 people over 304 065 km² of
	// land is 18,6 per km². The flows are the whole of 2025 — Finland shrank naturally
	// (−13 377) and still grew (+16 910), on net migration.
	const panel = page.getByRole('complementary');
	await expect(page.getByText('Data from 2025')).toBeVisible();
	await expect(panel.getByText('18,6', { exact: true })).toBeVisible();
	await expect(panel.getByText('5 652 881', { exact: true })).toBeVisible();
	await expect(panel.getByText('304 065 km²', { exact: true })).toBeVisible();
	await expect(panel.getByText('−13 377', { exact: true })).toBeVisible();
	await expect(panel.getByText('+16 910', { exact: true })).toBeVisible();
});

test('hovering a municipality shows its density and the year it changed by', async ({ page }) => {
	await page.goto('./interactive/population');

	const panel = page.getByRole('complementary');

	await page.getByRole('button', { name: /^Helsinki,/ }).hover();

	await expect(panel.getByRole('heading', { name: 'Helsinki' })).toBeVisible();
	// 694 392 people on 214,6 km² of land.
	await expect(panel.getByText('3 236,1', { exact: true })).toBeVisible();
	await expect(panel.getByText('694 392', { exact: true })).toBeVisible();
	await expect(panel.getByText('+9 254', { exact: true })).toBeVisible();

	// The chip answers "compared with Finland?" — 3 236,1 against the country's 18,6.
	await expect(panel.getByText('×174', { exact: true })).toBeVisible();
	await expect(panel.getByText('vs Finland')).toBeVisible();
});

test('the national panel states it is the baseline rather than comparing with itself', async ({
	page
}) => {
	await page.goto('./interactive/population');

	const panel = page.getByRole('complementary');

	// Nothing hovered: the panel *is* the whole-country figure, so a "×1,0 vs Finland" chip
	// would be trivially true — it's replaced by a line naming it as the baseline.
	await expect(panel.getByText('vs Finland')).toHaveCount(0);
	await expect(panel.getByText(/whole-country average/)).toBeVisible();

	// A sparse municipality compares downwards, with the precision the small number needs.
	await page.getByRole('button', { name: /^Savukoski,/ }).hover();
	await expect(panel.getByText('×0,01', { exact: true })).toBeVisible();
});

test('municipalities are colour coded by density class', async ({ page }) => {
	await page.goto('./interactive/population');

	const fill = (name: string) =>
		page.getByRole('button', { name: new RegExp(`^${name},`) }).getAttribute('fill');

	// A single-hue ramp, light to dark: Savukoski (0,2/km²) takes the lightest class,
	// Helsinki (3 236/km²) the darkest, and Rauma (78,1/km²) a middle one.
	expect(await fill('Savukoski')).toBe('#b4a0d2');
	expect(await fill('Helsinki')).toBe('#41266e');
	expect(await fill('Rauma')).toBe('#6d3fae');
});

test('the region tab rolls municipalities up into maakunnat', async ({ page }) => {
	await page.goto('./interactive/population');

	const panel = page.getByRole('complementary');

	await page.getByRole('tab', { name: 'Region' }).click();

	const map = page.getByRole('img', { name: 'Population density by region in Finland' });
	await expect(map.getByRole('button')).toHaveCount(19);

	// Neither the population export nor the maakunta geometry carries region figures, so both
	// the population and the land area behind this are summed from member municipalities:
	// Uusimaa is 1 799 629 people on 9 111 km².
	await page.getByRole('button', { name: /^Uusimaa,/ }).hover();
	await expect(panel.getByRole('heading', { name: 'Uusimaa' })).toBeVisible();
	await expect(panel.getByText('1 799 629', { exact: true })).toBeVisible();
	await expect(panel.getByText('9 111 km²', { exact: true })).toBeVisible();
	await expect(panel.getByText('197,5', { exact: true })).toBeVisible();
});

test('the Tampere tab scopes the population map to that region', async ({ page }) => {
	await page.goto('./interactive/population');

	const panel = page.getByRole('complementary');

	await page.getByRole('tab', { name: 'Tampere Metro' }).click();

	const map = page.getByRole('img', {
		name: 'Population density by municipality in Tampere Metro'
	});
	await expect(map.getByRole('button')).toHaveCount(8);

	// Rolled up from the 8 municipalities: 427 749 people on 4 039 km², so 105,9 per km².
	await expect(panel.getByRole('heading', { name: 'Tampere Metro' })).toBeVisible();
	await expect(panel.getByText('427 749', { exact: true })).toBeVisible();
	await expect(panel.getByText('105,9', { exact: true })).toBeVisible();

	// A genuinely smaller area than the country, so its blank state does compare with Finland.
	await expect(panel.getByText('×5,7', { exact: true })).toBeVisible();
});
