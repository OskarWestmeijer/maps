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

	// Unemployed jobseekers, straight from the source export.
	await expect(panel.getByText('1 970', { exact: true })).toBeVisible();
});

test('searching a municipality highlights it blue on the map', async ({ page }) => {
	await page.goto('./interactive');

	const panel = page.getByRole('complementary');

	await page.getByPlaceholder('Search municipality…').fill('Rauma');
	await page.getByRole('button', { name: 'Rauma', exact: true }).click();

	await expect(panel.getByRole('heading', { name: 'Rauma' })).toBeVisible();
	await expect(page.getByRole('img').getByRole('button', { name: /^Rauma,/ })).toHaveAttribute(
		'fill',
		'#2563eb'
	);

	// The selection survives hovering elsewhere...
	await page.getByRole('button', { name: /^Luoto,/ }).hover();
	await expect(page.getByRole('img').getByRole('button', { name: /^Rauma,/ })).toHaveAttribute(
		'fill',
		'#2563eb'
	);

	// ...until it's cleared.
	await page.getByRole('button', { name: 'Clear selection' }).click();
	await expect(page.getByRole('img').getByRole('button', { name: /^Rauma,/ })).not.toHaveAttribute(
		'fill',
		'#2563eb'
	);
});

test('clicking a municipality on the map selects it too', async ({ page }) => {
	await page.goto('./interactive');

	const panel = page.getByRole('complementary');

	await page.getByRole('button', { name: /^Luoto,/ }).click();

	await expect(panel.getByRole('heading', { name: 'Luoto' })).toBeVisible();
	await expect(page.getByRole('button', { name: /^Luoto,/ })).toHaveAttribute('fill', '#2563eb');
	// The search box reflects the click-driven selection, ready to be cleared or replaced.
	await expect(page.getByPlaceholder('Search municipality…')).toHaveValue('Luoto');
});

test('shows software & app development jobs alongside the national and municipal figures', async ({
	page
}) => {
	await page.goto('./interactive');

	const panel = page.getByRole('complementary');

	// National, before anything is hovered: sum of the three occupation groups' SSS rows.
	// Vacancies are suppressed for one of the three groups nationally, but the panel shows
	// the sum of the known groups plainly rather than flagging it as a lower bound.
	await expect(panel.getByText('2 554', { exact: true })).toBeVisible();
	await expect(panel.getByText('77', { exact: true })).toBeVisible();

	await page.getByRole('button', { name: /^Helsinki,/ }).hover();

	await expect(panel.getByRole('heading', { name: 'Helsinki' })).toBeVisible();
	await expect(panel.getByText('504', { exact: true })).toBeVisible();
	await expect(panel.getByText('0', { exact: true })).toBeVisible();
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
