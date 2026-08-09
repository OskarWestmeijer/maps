import { expect, test } from '@playwright/test';

test('map renders every municipality', async ({ page }) => {
	await page.goto('./interactive');

	const map = page.getByRole('img', { name: 'Unemployment by municipality in Finland' });
	await expect(map).toBeVisible();
	await expect(map.getByRole('button')).toHaveCount(308);
});

test('hovering a municipality shows its details', async ({ page }) => {
	await page.goto('./interactive');

	const panel = page.getByRole('complementary');

	// The period stays visible outside the panel, so it survives hovering a municipality.
	await expect(page.getByText('Data from June 2026')).toBeVisible();

	// Both national figures are shown before anything is hovered: the register measure the
	// map is coloured by, and Tilastokeskus's better-known survey rate beside it.
	await expect(panel.getByText('12,8 %')).toBeVisible();
	await expect(panel.getByText('10,5 %')).toBeVisible();

	await page.getByRole('button', { name: /^Rauma,/ }).hover();

	await expect(panel.getByRole('heading', { name: 'Rauma' })).toBeVisible();
	await expect(panel.getByText('10,7 %')).toBeVisible();

	// Labour force / jobseekers / unemployed jobseekers, straight from the source export.
	await expect(panel.getByText('18 440', { exact: true })).toBeVisible();
	await expect(panel.getByText('2 994', { exact: true })).toBeVisible();
	await expect(panel.getByText('1 970', { exact: true })).toBeVisible();
});

test('municipalities are colour coded by unemployment rate', async ({ page }) => {
	await page.goto('./interactive');

	// Luoto is the lowest in the data (2.5 %) and Outokumpu the highest (19.1 %), so they
	// must land in the first and last colour class respectively.
	const fill = (name: string) =>
		page.getByRole('button', { name: new RegExp(`^${name},`) }).getAttribute('fill');

	expect(await fill('Luoto')).toBe('#81c593');
	expect(await fill('Outokumpu')).toBe('#9c1b1b');

	// Sottunga's figure is suppressed in the source data.
	expect(await fill('Sottunga')).toBe('#e5e5e2');
});
