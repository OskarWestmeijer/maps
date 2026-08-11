import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import register from '../../../static/data/unemployment_register_kunnat_12r5.json';
import software from '../../../static/data/software_occupations_register_kunnat_12ti.json';
import survey from '../../../static/data/unemployment_survey_national_135z.json';
import population from '../../../static/data/population_register_kunnat_121w.json';
import manifest from '../../../static/data/manifest.json';
import {
	emptyPopulationViews,
	emptyUnemploymentViews,
	loadPopulationViews,
	loadUnemploymentViews,
	type PopulationGeometry,
	type UnemploymentGeometry
} from './liveData';
import { EMPTY_KUNTA_STATS } from './unemployment';
import { EMPTY_POPULATION_STATS } from './population';
import type { FinlandMap, Kunta } from './finland';
import type { KuntaStats } from './unemployment';
import type { PopulationStats } from './population';

/**
 * These run against the *real* files in `static/data` — the same bytes the browser fetches —
 * so the whole client-side path is covered: fetch, parse, join onto geometry, roll up. The
 * per-parser specs next door cover the parsing in isolation; what's tested here is everything
 * that used to happen in the two build-time loaders.
 */
const DATA_DIR: Record<string, unknown> = {
	'unemployment_register_kunnat_12r5.json': register,
	'software_occupations_register_kunnat_12ti.json': software,
	'unemployment_survey_national_135z.json': survey,
	'population_register_kunnat_121w.json': population,
	'manifest.json': manifest
};

/** Stands in for nginx: serves `static/data`, 404s anything else. */
function serveDataDir(overrides: Record<string, Response | null> = {}) {
	return vi.fn(async (url: string | URL) => {
		const name = String(url).split('/').pop() ?? '';

		if (name in overrides) {
			const override = overrides[name];

			// null stands for the request never completing — the offline case.
			if (override === null) throw new TypeError('network error');

			return override;
		}

		if (!(name in DATA_DIR)) return new Response('not found', { status: 404 });

		return new Response(JSON.stringify(DATA_DIR[name]), { status: 200 });
	});
}

/** Geometry as `+page.server.ts` ships it: shapes with every stat field present and null. */
function area<S>(code: string, name: string, empty: S, landArea = 100): Kunta<S> {
	return { code, name, landArea, d: 'M0,0L1,1Z', ...empty };
}

function map<S>(kuntas: Kunta<S>[]): FinlandMap<S> {
	return { kuntas, viewBox: '0 0 100 100' };
}

// Real codes: Helsinki, Tampere and three of Tampere metro's eight.
const unemploymentGeometry: UnemploymentGeometry = {
	finland: map([
		area('091', 'Helsinki', EMPTY_KUNTA_STATS),
		area('837', 'Tampere', EMPTY_KUNTA_STATS)
	]),
	maakunta: map([area('06', 'Pirkanmaa', EMPTY_KUNTA_STATS)]),
	tampere: map([
		area('837', 'Tampere', EMPTY_KUNTA_STATS),
		area('211', 'Kangasala', EMPTY_KUNTA_STATS),
		area('536', 'Nokia', EMPTY_KUNTA_STATS)
	])
};

const populationGeometry: PopulationGeometry = {
	finland: map([
		area('091', 'Helsinki', EMPTY_POPULATION_STATS, 214.21),
		area('837', 'Tampere', EMPTY_POPULATION_STATS, 524.97)
	]),
	maakunta: map([area('06', 'Pirkanmaa', EMPTY_POPULATION_STATS, 0)]),
	tampere: map([area('837', 'Tampere', EMPTY_POPULATION_STATS, 524.97)]),
	membersOf: { '06': ['837'] }
};

let fetchMock: ReturnType<typeof serveDataDir>;

function install(overrides: Record<string, Response | null> = {}) {
	fetchMock = serveDataDir(overrides);
	vi.stubGlobal('fetch', fetchMock);
}

beforeEach(() => install());
afterEach(() => vi.unstubAllGlobals());

describe('loadUnemploymentViews', () => {
	it('joins the register figures onto the geometry it was given', async () => {
		const views = await loadUnemploymentViews(unemploymentGeometry);
		const helsinki = views.finland.kuntas.find((k) => k.code === '091');

		expect(helsinki?.rate).toBeGreaterThan(0);
		expect(helsinki?.unemployed).toBeGreaterThan(0);
	});

	it('keeps the geometry untouched while replacing the figures', async () => {
		const views = await loadUnemploymentViews(unemploymentGeometry);
		const helsinki = views.finland.kuntas.find((k) => k.code === '091');

		expect(helsinki?.name).toBe('Helsinki');
		expect(helsinki?.d).toBe('M0,0L1,1Z');
		expect(views.finland.viewBox).toBe('0 0 100 100');
	});

	it('reads the whole-country row for the national figures', async () => {
		const views = await loadUnemploymentViews(unemploymentGeometry);

		expect(views.finland.national.rate).toBe(12.8);
		expect(views.finland.period).toBe('2026M06');
	});

	it('carries the same national rate on every tab, so colours never shift', async () => {
		// The diverging scale pivots around this; a municipality that's red on Finland has to
		// stay red on Region and on Tampere Metro.
		const views = await loadUnemploymentViews(unemploymentGeometry);

		expect(views.maakunta.countryRate).toBe(views.finland.countryRate);
		expect(views.tampere.countryRate).toBe(views.finland.countryRate);
	});

	it('reads region rows for the Region tab rather than re-summing municipalities', async () => {
		const views = await loadUnemploymentViews(unemploymentGeometry);
		const pirkanmaa = views.maakunta.kuntas.find((k) => k.code === '06');

		expect(pirkanmaa?.rate).toBeGreaterThan(0);
		// Not a subset: its 19 areas are the whole country, so it reads SSS directly.
		expect(views.maakunta.national.rate).toBe(12.8);
	});

	it('rolls Tampere Metro up from its own municipalities', async () => {
		const views = await loadUnemploymentViews(unemploymentGeometry);
		const summed = views.tampere.kuntas.reduce((total, k) => total + (k.unemployed ?? 0), 0);

		expect(views.tampere.national.unemployed).toBe(summed);
		// Recomputed from the summed counts, never averaged across municipalities.
		expect(views.tampere.national.rate).not.toBe(12.8);
	});

	it('brings in the software-jobs slice and the survey rate', async () => {
		const views = await loadUnemploymentViews(unemploymentGeometry);

		expect(views.finland.softwareJobs.national.unemployed).toBeGreaterThan(0);
		expect(views.finland.survey.rate).toBe(10.5);
	});

	it('reads the poll date out of the manifest', async () => {
		const views = await loadUnemploymentViews(unemploymentGeometry);

		expect(views.finland.polled).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		expect(views.finland.softwareJobs.polled).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it('degrades one file at a time: a missing 12ti still leaves a coloured map', async () => {
		install({
			'software_occupations_register_kunnat_12ti.json': new Response('', { status: 404 })
		});

		const views = await loadUnemploymentViews(unemploymentGeometry);

		expect(views.finland.national.rate).toBe(12.8);
		expect(views.finland.softwareJobs.national.unemployed).toBeNull();
	});

	it('survives a malformed file rather than throwing', async () => {
		install({
			'unemployment_register_kunnat_12r5.json': new Response('{"nope":1}', { status: 200 })
		});

		const views = await loadUnemploymentViews(unemploymentGeometry);

		expect(views.finland.national.rate).toBeNull();
		expect(views.finland.period).toBe('');
	});

	it('survives the network being down', async () => {
		install(
			Object.fromEntries(
				[
					'unemployment_register_kunnat_12r5.json',
					'software_occupations_register_kunnat_12ti.json',
					'unemployment_survey_national_135z.json',
					'manifest.json'
				].map((name) => [name, null])
			)
		);

		const views = await loadUnemploymentViews(unemploymentGeometry);

		expect(views.finland.period).toBe('');
		expect(views.finland.kuntas).toHaveLength(2);
	});
});

describe('loadPopulationViews', () => {
	it('joins the figures and derives change and density from them', async () => {
		const views = await loadPopulationViews(populationGeometry);
		const helsinki = views.finland.areas.find((a) => a.code === '091');

		expect(helsinki?.population).toBeGreaterThan(600_000);
		// Density needs the land area, which comes from the geometry rather than the export.
		expect(helsinki?.density).toBeCloseTo((helsinki?.population ?? 0) / 214.21, 3);
		expect(helsinki?.change).toBeCloseTo(
			((helsinki?.totalChange ?? 0) / (helsinki?.population ?? 1)) * 1000,
			6
		);
	});

	it('rolls the Region tab up from the municipalities in each maakunta', async () => {
		// The export has no region rows and the maakunta geometry has no land area, so both
		// have to come from `membersOf` — here, Pirkanmaa standing in for Tampere alone.
		const views = await loadPopulationViews(populationGeometry);
		const pirkanmaa = views.maakunta.areas.find((a) => a.code === '06');
		const tampere = views.finland.areas.find((a) => a.code === '837');

		expect(pirkanmaa?.population).toBe(tampere?.population);
		expect(pirkanmaa?.landArea).toBe(524.97);
		expect(pirkanmaa?.density).toBeCloseTo(tampere?.density ?? 0, 6);
	});

	it('keeps the national total as the Region tab headline', async () => {
		const views = await loadPopulationViews(populationGeometry);

		expect(views.maakunta.total).toEqual(views.finland.total);
		expect(views.finland.total.population).toBeGreaterThan(5_000_000);
	});

	it('gives Tampere Metro its own roll-up instead of the national total', async () => {
		const views = await loadPopulationViews(populationGeometry);

		expect(views.tampere.total.name).not.toBe('Finland');
		expect(views.tampere.total.population).toBe(
			views.finland.areas.find((a) => a.code === '837')?.population
		);
	});

	it('compares against Finland on every tab', async () => {
		const views = await loadPopulationViews(populationGeometry);

		expect(views.tampere.countryChange).toBe(views.finland.countryChange);
		expect(views.maakunta.countryChange).toBe(views.finland.countryChange);
	});

	it('falls back to empty views when the export is missing', async () => {
		install({ 'population_register_kunnat_121w.json': new Response('', { status: 404 }) });

		const views = await loadPopulationViews(populationGeometry);

		expect(views.finland.period).toBe('');
		expect(views.finland.areas.every((a) => a.change === null)).toBe(true);
		expect(views.finland.areas).toHaveLength(2);
	});
});

describe('the pre-fetch state', () => {
	it('has the real shapes but no figures, so the map draws as an outline', () => {
		const views = emptyUnemploymentViews(unemploymentGeometry);

		expect(views.finland.kuntas).toHaveLength(2);
		expect(views.finland.kuntas[0].d).toBe('M0,0L1,1Z');
		expect(views.finland.kuntas.every((k) => k.rate === null)).toBe(true);
		expect(views.finland.countryRate).toBeNull();
	});

	it('leaves the period and poll date blank rather than inventing them', () => {
		const views = emptyPopulationViews(populationGeometry);

		expect(views.finland.period).toBe('');
		expect(views.finland.polled).toBeNull();
		expect(views.finland.total.density).toBeNull();
	});
});
