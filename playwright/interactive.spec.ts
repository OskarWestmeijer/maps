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

test('the Tampere tab scopes the map, panel, and search to that region only', async ({ page }) => {
	await page.goto('./interactive');

	const panel = page.getByRole('complementary');
	const map = page.getByRole('img', { name: 'Unemployment by municipality in Tampere Metro' });

	await page.getByRole('tab', { name: 'Tampere Metro' }).click();

	// Only the 8 kaupunkiseutu municipalities render, and the map is rescoped/re-labelled.
	await expect(map).toBeVisible();
	await expect(map.getByRole('button')).toHaveCount(8);

	// Default panel is the region aggregate, rolled up from the 8 municipalities' figures
	// (not a pre-aggregated row, since none exists for a hand-picked region) — computed from
	// the same source export: 14,2 % / 30 866 unemployed, 242 unemployed + 35 vacancies in
	// the software occupations slice.
	await expect(panel.getByRole('heading', { name: 'Tampere Metro' })).toBeVisible();
	await expect(panel.getByText('14,2 %')).toBeVisible();
	await expect(panel.getByText('30 866', { exact: true })).toBeVisible();
	await expect(panel.getByText('242', { exact: true })).toBeVisible();
	await expect(panel.getByText('35', { exact: true })).toBeVisible();

	// The national-only survey rate has no regional breakdown, so it's hidden here.
	await expect(panel.getByText('Työttömyysaste')).not.toBeVisible();

	// Search is scoped to the current region's kuntas for free (it reads off the same
	// filtered list the map renders) — Helsinki isn't Tampere-area, Nokia is.
	const search = page.getByPlaceholder('Search municipality…');
	await search.fill('Helsinki');
	await expect(page.locator('ul.menu li')).toHaveCount(0);
	await search.fill('Nokia');
	await expect(page.getByRole('button', { name: 'Nokia', exact: true })).toBeVisible();

	// Selecting a municipality, then switching regions and back, resets the selection/search
	// rather than leaking a highlight or query across regions — switching is a `$state`
	// toggle, not a navigation, so nothing remounts to clear this for free.
	await page.getByRole('button', { name: 'Nokia', exact: true }).click();
	await page.getByRole('tab', { name: 'Finland' }).click();
	await page.getByRole('tab', { name: 'Tampere Metro' }).click();
	await expect(search).toHaveValue('');
	await expect(page.getByRole('button', { name: 'Clear selection' })).toHaveCount(0);

	// Switching back to Finland restores the full country.
	await page.getByRole('tab', { name: 'Finland' }).click();
	await expect(
		page.getByRole('img', { name: 'Unemployment by municipality in Finland' }).getByRole('button')
	).toHaveCount(308);
});

test('municipalities are colour coded by distance from the national rate', async ({ page }) => {
	await page.goto('./interactive');

	const fill = (name: string) =>
		page.getByRole('button', { name: new RegExp(`^${name},`) }).getAttribute('fill');

	// The scale diverges around the country's 12,8 %. Luoto (2,5 %) is 10 points under and
	// Outokumpu (19,1 %) 6 points over, so they take the extreme green and red.
	expect(await fill('Luoto')).toBe('#1d6835');
	expect(await fill('Outokumpu')).toBe('#9a2929');

	// Nokia happens to sit exactly on the national rate, which is the whole point of the
	// midpoint class: it reads as neutral grey rather than as "low".
	expect(await fill('Nokia')).toBe('#c5cbd2');

	// Sottunga's figure is suppressed, so it's hatched rather than given another flat grey.
	expect(await fill('Sottunga')).toBe('url(#no-data)');
});

test('the panel states how far a municipality sits from the national rate', async ({ page }) => {
	await page.goto('./interactive');

	const panel = page.getByRole('complementary');

	// Nothing selected: the panel *is* the national figure, so there's no delta to show.
	await expect(panel.getByText('pts vs Finland')).toHaveCount(0);

	await page.getByRole('button', { name: /^Outokumpu,/ }).hover();

	// 19,1 % against the national 12,8 % — the signed delta is what explains the map's colour
	// without a legend.
	await expect(panel.getByText('+6,3')).toBeVisible();
	await expect(panel.getByText('pts vs Finland')).toBeVisible();

	// Below the national rate the sign flips (a real minus sign, not a hyphen).
	await page.getByRole('button', { name: /^Luoto,/ }).hover();
	await expect(panel.getByText('−10,3')).toBeVisible();
});
