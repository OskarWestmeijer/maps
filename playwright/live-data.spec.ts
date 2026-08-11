import { expect, test, type Page } from '@playwright/test';

// The interactive maps read their figures from /data/ when the page opens, rather than having
// them baked into the prerendered HTML — that is what lets `scripts/fetch_statfi.py` refresh
// them on the production host with no rebuild. These tests cover the two things that only
// matter because of that: new numbers on disk really do reach the page, and a directory that
// is missing or broken degrades instead of rendering nonsense.

const REGISTER = '**/data/unemployment_register_kunnat_12r5.json';

/** Serves the real file with one municipality's rate rewritten — a stand-in for a cron run. */
async function serveEditedRegister(page: Page, edit: (payload: RegisterExport) => void) {
	await page.route(REGISTER, async (route) => {
		const response = await route.fetch();
		const payload = (await response.json()) as RegisterExport;

		edit(payload);

		await route.fulfill({ json: payload });
	});
}

type RegisterExport = {
	columns: { code: string; type: string }[];
	data: { key: string[]; values: string[] }[];
};

/** The rate's index is resolved against the content columns only — `values` omits the keys. */
function setRate(payload: RegisterExport, area: string, rate: string) {
	const index = payload.columns
		.filter((c) => c.type === 'c')
		.findIndex((c) => c.code === 'TYOTOSUUS');
	const row = payload.data.find((r) => r.key[0] === area);

	if (!row) throw new Error(`no ${area} row in the register export`);

	row.values[index] = rate;
}

test('a refreshed file on disk changes what the page shows', async ({ page }) => {
	// Rauma reads 10,7 % from the committed export; pretend the cron fetched a month where it
	// is 3,1 % instead. Nothing is rebuilt — only the served file differs.
	await serveEditedRegister(page, (payload) => setRate(payload, 'KU684', '3.1'));

	await page.goto('./interactive/unemployment');

	const panel = page.getByRole('complementary');
	await page.getByRole('button', { name: /^Rauma,/ }).hover();

	await expect(panel.getByRole('heading', { name: 'Rauma' })).toBeVisible();
	await expect(panel.getByText('3,1 %')).toBeVisible();

	// And the colour follows the number: 3,1 % is far enough below the national 12,8 % to land
	// in the darkest green, where 10,7 % was a class lighter.
	await expect(page.getByRole('button', { name: /^Rauma,/ })).toHaveAttribute('fill', '#1d6835');
});

test('the poll date comes from the manifest the script writes', async ({ page }) => {
	await page.route('**/data/manifest.json', (route) =>
		route.fulfill({ json: { polled: '2026-08-11T05:31:04Z' } })
	);

	await page.goto('./interactive/unemployment');

	// Two different dates, deliberately labelled apart: what the figures describe, and when we
	// last asked for them.
	await expect(page.getByText('Data from June 2026 · polled 11 Aug 2026')).toBeVisible();
});

test('a missing manifest drops the poll date instead of showing a placeholder', async ({
	page
}) => {
	await page.route('**/data/manifest.json', (route) => route.fulfill({ status: 404 }));

	await page.goto('./interactive/population');

	await expect(page.getByText('Data from 2025')).toBeVisible();
	await expect(page.getByText('polled')).toHaveCount(0);
});

test('an unreadable data directory leaves an outline map and says so', async ({ page }) => {
	await page.route('**/data/*.json', (route) => route.fulfill({ status: 500 }));

	await page.goto('./interactive/unemployment');

	const panel = page.getByRole('complementary');

	// The page itself is fine — geometry is baked in, so all 308 municipalities still render.
	const map = page.getByRole('img', { name: 'Unemployment by municipality in Finland' });
	await expect(map.getByRole('button')).toHaveCount(308);

	// But they're hatched rather than coloured, and the panel says why instead of leaving a
	// screen of em dashes to be read as real data.
	await expect(page.getByRole('button', { name: /^Rauma,/ })).toHaveAttribute(
		'fill',
		'url(#no-data)'
	);
	await expect(panel.getByText('Live figures unavailable')).toBeVisible();
});

test('one missing file degrades only its own figures', async ({ page }) => {
	// 12ti is a separate export on a separate release cycle; losing it must not blank the map.
	await page.route('**/data/software_occupations_register_kunnat_12ti.json', (route) =>
		route.fulfill({ status: 404 })
	);

	await page.goto('./interactive/unemployment');

	const panel = page.getByRole('complementary');

	await expect(panel.getByText('12,8 %')).toBeVisible();
	await expect(panel.getByText('Live figures unavailable')).toHaveCount(0);

	// The software slice is the only thing that goes blank.
	const softwareBlock = panel
		.locator('div')
		.filter({ hasText: 'Software & app development' })
		.last();
	await expect(softwareBlock.getByText('—').first()).toBeVisible();
});
