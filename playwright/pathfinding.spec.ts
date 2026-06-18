import { expect, test } from '@playwright/test';

test('graph renders with 7 nodes', async ({ page }) => {
	await page.goto('./pathfinding');

	await expect(page.locator('svg')).toBeVisible();
	await expect(page.getByRole('button', { name: /^Node [A-Z]$/ })).toHaveCount(7);
});

test('running Dijkstra assigns a distance to every node', async ({ page }) => {
	await page.goto('./pathfinding');

	await expect(page.getByText('∞')).toHaveCount(7);

	await page.getByRole('button', { name: 'Run Dijkstra' }).click();

	await expect(page.getByText('∞')).toHaveCount(0);
});

test('regenerating resets the graph', async ({ page }) => {
	await page.goto('./pathfinding');

	await page.getByRole('button', { name: 'Run Dijkstra' }).click();
	await expect(page.getByText('∞')).toHaveCount(0);

	await page.getByRole('button', { name: 'Regenerate Graph' }).click();
	await expect(page.getByText('∞')).toHaveCount(7);
});
