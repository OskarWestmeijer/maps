import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import register from '../../../static/data/unemployment_register_kunnat_12r5.json';
import software from '../../../static/data/software_occupations_register_kunnat_12ti.json';
import survey from '../../../static/data/unemployment_survey_national_135z.json';
import population from '../../../static/data/population_register_kunnat_121w.json';
import {
	emptyCompareViews,
	emptyPopulationViews,
	emptyUnemploymentViews,
	loadCompareViews,
	loadPopulationViews,
	loadUnemploymentViews,
	type CompareGeometry,
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
/**
 * Written by `scripts/fetch_statfi.py` on every run, so it isn't committed — its poll
 * timestamp would churn on every local run. Synthesized here rather than imported, so a fresh
 * clone can run the tests without fetching anything first.
 */
const manifest = {
	polled: '2026-08-11T18:39:44Z',
	files: {
		'unemployment_register_kunnat_12r5.json': {
			period: '2026M06',
			updated: '2026-07-21T05:00:00Z',
			polled: '2026-08-11T18:39:44Z'
		},
		'software_occupations_register_kunnat_12ti.json': {
			period: '2026M06',
			updated: '2026-07-21T05:00:00Z',
			polled: '2026-08-11T18:39:44Z'
		},
		'population_register_kunnat_121w.json': {
			period: '2025',
			updated: '2026-05-27T05:00:00Z',
			polled: '2026-08-11T18:39:44Z'
		}
	}
};

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
	]),
	// Only used to name each municipality's maakunta in the panel — this map reads the export's
	// own MK rows for its regional figures.
	membersOf: { '06': ['837', '211', '536'] }
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

	it('reads each file its own poll date out of the manifest', async () => {
		// Per file, because the tables are on independent release cycles — 12r5 and 12ti can
		// legitimately have been polled at different times.
		const views = await loadUnemploymentViews(unemploymentGeometry);

		expect(views.finland.polled).toBe('2026-08-11T18:39:44Z');
		expect(views.finland.softwareJobs.polled).toBe('2026-08-11T18:39:44Z');
	});

	it('falls back to the run-level poll date for a file with no entry of its own', async () => {
		// The fixture manifest has no `files` entry for the survey export, which is what a
		// manifest written before that table was added would look like.
		const views = await loadUnemploymentViews(unemploymentGeometry);

		expect(views.finland.polled).toBe(manifest.polled);
	});

	it('leaves the poll date null when there is no manifest at all', async () => {
		// The normal state of a fresh clone: the file is generated, so it isn't committed.
		install({ 'manifest.json': new Response('', { status: 404 }) });

		const views = await loadUnemploymentViews(unemploymentGeometry);

		expect(views.finland.polled).toBeNull();
		// ...and the figures are unaffected: the manifest carries no data of its own.
		expect(views.finland.national.rate).toBe(12.8);
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

/**
 * Föglö is in this fixture on purpose: its unemployment rate is suppressed in the real 12r5
 * export (four Åland municipalities are), which is exactly the case the coverage floor exists
 * for. See `MIN_COVERAGE` in `score.ts`.
 */
const compareGeometry: CompareGeometry = {
	finland: map([
		area('091', 'Helsinki', EMPTY_POPULATION_STATS, 214.21),
		area('837', 'Tampere', EMPTY_POPULATION_STATS, 524.97),
		area('536', 'Nokia', EMPTY_POPULATION_STATS, 289.44),
		area('062', 'Föglö', EMPTY_POPULATION_STATS, 135.37)
	]),
	maakunta: map([area('06', 'Pirkanmaa', EMPTY_POPULATION_STATS, 0)]),
	tampere: map([
		area('837', 'Tampere', EMPTY_POPULATION_STATS, 524.97),
		area('536', 'Nokia', EMPTY_POPULATION_STATS, 289.44)
	]),
	membersOf: { '06': ['837', '536'] }
};

describe('loadCompareViews', () => {
	it('joins both tables onto one area and scores it', async () => {
		const views = await loadCompareViews(compareGeometry);
		const tampere = views.finland.areas.find((a) => a.code === '837');

		// One figure from each export, and a score built from both.
		expect(tampere?.rate).toBeGreaterThan(0);
		expect(tampere?.change).not.toBeNull();
		expect(tampere?.score.score).toBeGreaterThanOrEqual(0);
		expect(tampere?.score.parts.map((p) => p.key)).toEqual(['jobs', 'people']);
	});

	it('names each municipality’s maakunta, for the ranking’s region column', async () => {
		// Neither export carries membership — 12r5's MK rows are region totals — so this is
		// inverted from the same `membersOf` grouping the Region tab is rolled up with, and
		// shortened to fit a table column.
		const views = await loadCompareViews(compareGeometry);

		expect(views.finland.areas.find((a) => a.code === '837')?.regionName).toBe('Pirkanmaa');
		// Areas outside the fixture's one region have no name to show rather than a wrong one.
		expect(views.finland.areas.find((a) => a.code === '091')?.regionName).toBe('');
	});

	it('leaves a municipality with a suppressed indicator unscored', async () => {
		// The regression the coverage floor exists to prevent: scored on population change
		// alone, Föglö ranks first in the country.
		const views = await loadCompareViews(compareGeometry);
		const foglo = views.finland.areas.find((a) => a.code === '062');

		expect(foglo?.rate).toBeNull();
		expect(foglo?.change).not.toBeNull();
		expect(foglo?.score.score).toBeNull();
		expect(foglo?.score.rank).toBeNull();
		expect(foglo?.score.isPartial).toBe(true);
	});

	it('draws the Tampere tab from its own geometry, not the whole-country shapes', async () => {
		// The metro tab reuses the *figures* computed over the national list, and taking the
		// whole area object instead would carry its `d` along — the coarse 2 km outline from
		// the country file, drawn inside a viewBox meant for the dedicated 20 m one.
		const views = await loadCompareViews({
			...compareGeometry,
			tampere: {
				kuntas: [{ ...area('837', 'Tampere', EMPTY_POPULATION_STATS), d: 'M9,9L8,8Z' }],
				viewBox: '0 0 10 10'
			}
		});

		expect(views.tampere.areas[0].d).toBe('M9,9L8,8Z');
		expect(views.tampere.viewBox).toBe('0 0 10 10');
		// ...while still carrying the national figures and score.
		expect(views.tampere.areas[0].score.score).toBe(
			views.finland.areas.find((a) => a.code === '837')?.score.score
		);
	});

	it("keeps a municipality's score identical on the Tampere tab", async () => {
		// The scores are computed once over the municipal list and reused, never recomputed
		// among the metro's own areas — a kunta's number must not move when the tab flips.
		const views = await loadCompareViews(compareGeometry);
		const national = views.finland.areas.find((a) => a.code === '837');
		const metro = views.tampere.areas.find((a) => a.code === '837');

		expect(metro?.score.score).toBe(national?.score.score);
		expect(metro?.score.rank).toBe(national?.score.rank);
		expect(metro?.score.ranked).toBe(national?.score.ranked);
	});

	it('takes the region rate from the export and rolls its population change up', async () => {
		const views = await loadCompareViews(compareGeometry);
		const pirkanmaa = views.maakunta.areas.find((a) => a.code === '06');

		// 12r5 publishes MK rows, so the rate is read rather than derived...
		expect(pirkanmaa?.rate).toBeGreaterThan(0);
		// ...but 121w has none, so the change comes from `membersOf`. Two municipalities here,
		// so it must sit between theirs rather than equal either.
		const members = views.finland.areas.filter((a) => ['837', '536'].includes(a.code));
		const changes = members.map((a) => a.change ?? 0);

		expect(pirkanmaa?.change).toBeGreaterThan(Math.min(...changes));
		expect(pirkanmaa?.change).toBeLessThan(Math.max(...changes));
	});

	it('carries both periods, since the two tables are on different cycles', async () => {
		const views = await loadCompareViews(compareGeometry);

		expect(views.finland.period).toBe('2026M06');
		expect(views.finland.populationPeriod).toBe('2025');
		expect(views.finland.period).not.toBe(views.finland.populationPeriod);
	});

	it('scores nothing when one of the two files is missing', async () => {
		// Half the indicators is below the coverage floor for every area, so the map hatches
		// entirely rather than ranking the country on jobs alone.
		install({ 'population_register_kunnat_121w.json': new Response('', { status: 404 }) });

		const views = await loadCompareViews(compareGeometry);

		expect(views.finland.areas.every((a) => a.score.score === null)).toBe(true);
		expect(views.finland.areas.find((a) => a.code === '837')?.rate).toBeGreaterThan(0);
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

	it('gives the compare map an unscored shape per area, with its rows already named', () => {
		// The panel renders the same rows before and after the fetch — labels present, figures
		// em-dashed — so nothing jumps into place when the score arrives.
		const views = emptyCompareViews(compareGeometry);

		expect(views.finland.areas).toHaveLength(4);
		expect(views.finland.areas.every((a) => a.score.score === null)).toBe(true);
		expect(views.finland.areas[0].score.parts.map((p) => p.label)).toEqual(['Jobs', 'People']);
		expect(views.finland.areas[0].score.ranked).toBe(0);
	});
});
