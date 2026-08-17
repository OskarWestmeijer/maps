import { expect, test } from '@playwright/test';

test('balance map renders every municipality and its national figures', async ({ page }) => {
	await page.goto('./interactive/balance');

	const map = page.getByRole('img', { name: 'Gender balance by municipality in Finland' });
	await expect(map).toBeVisible();
	await expect(map.getByRole('button')).toHaveCount(308);

	const panel = page.getByRole('complementary');
	await expect(page.getByText('Data from 2025')).toBeVisible();
	await expect(panel.getByText('50,5 %', { exact: true })).toBeVisible();
	await expect(panel.getByText('2 853 669', { exact: true })).toBeVisible();
	await expect(panel.getByText('2 799 212', { exact: true })).toBeVisible();
	// The chip shows on the national panel too — the country isn't at parity either, and there is
	// no reference figure it could be comparing with itself.
	await expect(panel.getByText('0,5 pts from even', { exact: true })).toBeVisible();
});

test('the chip carries the distance from even, and the panel the direction', async ({ page }) => {
	await page.goto('./interactive/balance');

	const panel = page.getByRole('complementary');

	await page.getByRole('button', { name: /^Helsinki,/ }).hover();

	await expect(panel.getByRole('heading', { name: 'Helsinki' })).toBeVisible();
	await expect(panel.getByText('52,2 %', { exact: true })).toBeVisible();
	await expect(panel.getByText('2,2 pts from even', { exact: true })).toBeVisible();
	// Which way is answered by the headline share and the two counts, not by the chip.
	await expect(panel.getByText('362 549', { exact: true })).toBeVisible();
	await expect(panel.getByText('331 843', { exact: true })).toBeVisible();

	// The most lopsided municipality in the country: 43 women to 58 men.
	await page.getByRole('button', { name: /^Sottunga,/ }).hover();

	await expect(panel.getByText('42,6 %', { exact: true })).toBeVisible();
	await expect(panel.getByText('7,4 pts from even', { exact: true })).toBeVisible();
});

test('colours run green at an even split to red at the extremes', async ({ page }) => {
	await page.goto('./interactive/balance');

	const expectFill = (name: string, fill: string) =>
		expect(page.getByRole('button', { name: new RegExp(`^${name},`) })).toHaveAttribute(
			'fill',
			fill
		);

	// One axis — how far from even, not which sex — so the site's shared green/red carries it:
	// green is balanced, red is lopsided. Mäntsälä is exactly even, Sottunga 7,4 points off.
	await expectFill('Mäntsälä', '#1d6835');
	await expectFill('Tampere', '#c5cbd2');
	await expectFill('Helsinki', '#de958e');
	await expectFill('Sottunga', '#9a2929');

	// And a municipality leaning the other way takes the same colour at the same distance.
	await expectFill('Savukoski', '#9a2929');
});

test('the region and metro tabs sum their municipalities', async ({ page }) => {
	await page.goto('./interactive/balance');

	const panel = page.getByRole('complementary');

	// This export has no regional rows at all, so both smaller tabs are roll-ups.
	await page.getByRole('tab', { name: 'Region' }).click();
	await expect(
		page.getByRole('img', { name: 'Gender balance by region in Finland' })
	).toBeVisible();
	await page.getByRole('button', { name: /^Pirkanmaa,/ }).hover();
	await expect(panel.getByRole('heading', { name: 'Pirkanmaa' })).toBeVisible();
	await expect(panel.getByText('50,7 %', { exact: true })).toBeVisible();

	await page.getByRole('tab', { name: 'Tampere Metro' }).click();
	await expect(panel.getByRole('heading', { name: 'Tampere Metro' })).toBeVisible();
	await expect(panel.getByText('51,0 %', { exact: true })).toBeVisible();
	// Summed from the eight, and the share recomputed from the sums.
	await expect(panel.getByText('218 076', { exact: true })).toBeVisible();
	await expect(panel.getByText('209 673', { exact: true })).toBeVisible();
});
