/**
 * The statistics half of both interactive maps, fetched in the browser.
 *
 * These figures used to be `import`ed and baked into the prerendered page. They are now read
 * from `/data/` when the page opens, which is what lets a cron on the server refresh the maps
 * without rebuilding the image: `scripts/fetch_statfi.py` overwrites those files and the next
 * page load picks them up. See `loadGeometry.ts` for the half that still runs at build time.
 *
 * The parsing itself is unchanged and still lives in `unemployment.ts` / `softwareJobs.ts` /
 * `survey.ts` / `population.ts` — this module only fetches, and then does the joining and
 * rolling-up the two `+page.server.ts` loaders used to do.
 *
 * Nothing here throws. A file that 404s or arrives malformed leaves its figures null, which
 * every consumer already renders as a hatched area and an em dash — the same state the page
 * is in before the fetch resolves.
 */

import { base } from '$app/paths';
import type { FinlandMap, Kunta } from './finland';
import {
	aggregateKuntaStats,
	toUnemploymentData,
	EMPTY_KUNTA_STATS,
	type KuntaStats,
	type PxWebExport
} from './unemployment';
import {
	aggregateSoftwareJobStats,
	toSoftwareJobsData,
	type SoftwareJobStats,
	type SoftwareJobsData
} from './softwareJobs';
import { toLabourSurvey, EMPTY_LABOUR_SURVEY, type LabourSurvey } from './survey';
import {
	aggregatePopulationStats,
	changePer1000,
	densityOf,
	toPopulationData,
	EMPTY_POPULATION_STATS,
	type PopulationStats
} from './population';
import { TAMPERE_REGION } from './regions';

/** Where the cron writes, and nginx serves from. Filenames carry the PxWeb table id, not the
 *  period — they are overwritten in place, and every parser reads the period from the file. */
const FILES = {
	unemployment: 'unemployment_register_kunnat_12r5.json',
	software: 'software_occupations_register_kunnat_12ti.json',
	survey: 'unemployment_survey_national_135z.json',
	population: 'population_register_kunnat_121w.json',
	manifest: 'manifest.json'
} as const;

/** Written by `scripts/fetch_statfi.py` on every run — the only record of when we last asked
 *  Statistics Finland, as opposed to the period the figures describe. Per file, because the
 *  four tables are on independent release cycles. */
type Manifest = {
	polled?: string;
	files?: Record<string, { polled?: string; period?: string }>;
};

const EMPTY_SOFTWARE_JOB_STATS: SoftwareJobStats = {
	unemployed: null,
	unemployedIsMinimum: false,
	vacancies: null,
	vacanciesIsMinimum: false
};

/**
 * Fetch one export. Returns null — never throws — on a 404, a network failure or malformed
 * JSON, so one missing file degrades its own figures instead of blanking the page.
 */
async function fetchExport(filename: string): Promise<unknown | null> {
	try {
		const response = await fetch(`${base}/data/${filename}`);

		if (!response.ok) return null;

		return await response.json();
	} catch {
		return null;
	}
}

/** Applies a parser to a fetched file, treating a parse error like a missing file. */
function parse<T>(payload: unknown | null, parser: (px: PxWebExport) => T): T | null {
	if (payload === null) return null;

	try {
		return parser(payload as PxWebExport);
	} catch {
		return null;
	}
}

function polledFor(manifest: Manifest | null, filename: string): string | null {
	return manifest?.files?.[filename]?.polled ?? manifest?.polled ?? null;
}

/** Replaces every area's stats with the freshly parsed ones, keeping name/code/path/landArea. */
function merge<A extends { code: string }, S>(
	areas: A[],
	stats: Map<string, S>,
	empty: S
): (A & S)[] {
	return areas.map((area) => ({ ...area, ...(stats.get(area.code) ?? empty) }));
}

// --------------------------------------------------------------------- unemployment

/** What `+page.server.ts` ships: geometry per tab, with every stat field present and null. */
export type UnemploymentGeometry = {
	finland: FinlandMap<KuntaStats>;
	maakunta: FinlandMap<KuntaStats>;
	tampere: FinlandMap<KuntaStats>;
};

export type UnemploymentView = FinlandMap<KuntaStats> & {
	national: KuntaStats;
	/** The whole-country rate, carried on *every* view: it's what the diverging colour scale
	 *  pivots around, and the panel's "vs Finland" delta compares against. Keeping it national
	 *  even on a subset or a coarser area level keeps colours stable across tabs — a
	 *  municipality that's red on the Finland map stays red on the Tampere Metro map. */
	countryRate: number | null;
	period: string;
	source: string;
	/** When the cron last asked for this file, as opposed to the period it describes. */
	polled: string | null;
	survey: LabourSurvey;
	softwareJobs: SoftwareJobsBlock;
};

/** 12ti is fetched separately from 12r5 and released on its own cycle, so it carries its own
 *  period and its own poll time rather than borrowing the register file's. */
export type SoftwareJobsBlock = SoftwareJobsData & { polled: string | null };

export type UnemploymentViews = Record<'finland' | 'maakunta' | 'tampere', UnemploymentView>;

const EMPTY_SOFTWARE_JOBS: SoftwareJobsBlock = {
	stats: new Map(),
	national: EMPTY_SOFTWARE_JOB_STATS,
	period: '',
	source: '',
	polled: null
};

/** The state the page renders in until the fetch resolves: real shapes, no figures. */
export function emptyUnemploymentViews(geometry: UnemploymentGeometry): UnemploymentViews {
	const empty = (map: FinlandMap<KuntaStats>): UnemploymentView => ({
		...map,
		national: EMPTY_KUNTA_STATS,
		countryRate: null,
		period: '',
		source: '',
		polled: null,
		survey: EMPTY_LABOUR_SURVEY,
		softwareJobs: EMPTY_SOFTWARE_JOBS
	});

	return {
		finland: empty(geometry.finland),
		maakunta: empty(geometry.maakunta),
		tampere: empty(geometry.tampere)
	};
}

export async function loadUnemploymentViews(
	geometry: UnemploymentGeometry
): Promise<UnemploymentViews> {
	const [registerRaw, softwareRaw, surveyRaw, manifest] = await Promise.all([
		fetchExport(FILES.unemployment),
		fetchExport(FILES.software),
		fetchExport(FILES.survey),
		fetchExport(FILES.manifest) as Promise<Manifest | null>
	]);

	const survey = parse(surveyRaw, toLabourSurvey) ?? EMPTY_LABOUR_SURVEY;
	const blank = emptyUnemploymentViews(geometry);

	// The three files are independent: a lagging 12ti leaves the software-jobs block empty
	// while the map still colours from 12r5. The UI already labels their periods separately.
	const registerPolled = polledFor(manifest, FILES.unemployment);
	const softwarePolled = polledFor(manifest, FILES.software);

	// `countryRate` always comes from the municipal read's `SSS` row, whichever tab is shown.
	const country = parse(registerRaw, (px) => toUnemploymentData(px, 'KU'));

	const build = (
		view: UnemploymentView,
		areaPrefix: 'KU' | 'MK',
		/** True for a hand-picked subset with no pre-aggregated row of its own in the source
		 *  (Tampere metro): its totals are rolled up from the areas the map itself renders, so
		 *  the aggregate and the map always cover exactly the same set. The Region tab isn't a
		 *  subset — its 19 areas cover the whole country — so it reads `SSS` directly. */
		isSubset: boolean
	): UnemploymentView => {
		const register = parse(registerRaw, (px) => toUnemploymentData(px, areaPrefix));
		const software = parse(softwareRaw, (px) => toSoftwareJobsData(px, areaPrefix));

		const kuntas = register ? merge(view.kuntas, register.stats, EMPTY_KUNTA_STATS) : view.kuntas;

		const softwareStats = software?.stats ?? EMPTY_SOFTWARE_JOBS.stats;

		return {
			...view,
			kuntas,
			national: isSubset ? aggregateKuntaStats(kuntas) : (register?.national ?? EMPTY_KUNTA_STATS),
			countryRate: country?.national.rate ?? null,
			period: register?.period ?? '',
			source: register?.source ?? '',
			polled: registerPolled,
			survey,
			softwareJobs: {
				stats: softwareStats,
				national: isSubset
					? aggregateSoftwareJobStats(
							kuntas.map((k) => softwareStats.get(k.code) ?? EMPTY_SOFTWARE_JOB_STATS)
						)
					: (software?.national ?? EMPTY_SOFTWARE_JOB_STATS),
				period: software?.period ?? '',
				source: software?.source ?? '',
				polled: softwarePolled
			}
		};
	};

	return {
		finland: build(blank.finland, 'KU', false),
		maakunta: build(blank.maakunta, 'MK', false),
		tampere: build(blank.tampere, 'KU', true)
	};
}

// ----------------------------------------------------------------------- population

export type PopulationArea = Kunta<PopulationStats> & {
	/** Last year's change per 1 000 inhabitants — the mapped figure. */
	change: number | null;
	/** Inhabitants per km² of land. Shown in the panel; no longer what colours the map. */
	density: number | null;
};

export type PopulationGeometry = {
	finland: FinlandMap<PopulationStats>;
	maakunta: FinlandMap<PopulationStats>;
	tampere: FinlandMap<PopulationStats>;
	/** maakunta code -> the municipalities inside it, derived geometrically at build time
	 *  (see `membership.ts`). Shipped because the population export has no region rows and the
	 *  maakunta geometry has no land area, so the Region tab has to be rolled up from
	 *  municipalities — and doing that in the browser must not mean shipping the GeoJSON. */
	membersOf: Record<string, string[]>;
};

export type PopulationView = {
	areas: PopulationArea[];
	viewBox: string;
	/** The area's own totals: the `SSS` row for Finland, a roll-up for anything smaller.
	 *  Shaped like an area so the panel reads one type whether or not something is selected. */
	total: PopulationArea;
	/** Finland's own change per 1 000, carried on *every* view, so the panel's "vs Finland"
	 *  row means the same thing on every tab. */
	countryChange: number | null;
	period: string;
	source: string;
	polled: string | null;
};

export type PopulationViews = Record<'finland' | 'maakunta' | 'tampere', PopulationView>;

function withDerived(area: Kunta<PopulationStats>): PopulationArea {
	return {
		...area,
		change: changePer1000(area.totalChange, area.population),
		density: densityOf(area.population, area.landArea)
	};
}

/**
 * A whole view's fallback figures, shaped like an area — `d` is empty because nothing draws
 * it. Both derived figures are recomputed from the summed counts rather than averaged across
 * members: municipalities differ hugely in size, so an average would misweight them.
 */
function rollUp(name: string, areas: PopulationArea[]): PopulationArea {
	const stats = aggregatePopulationStats(areas);
	const landArea = areas.reduce((sum, a) => sum + (a.landArea ?? 0), 0) || null;

	return {
		...stats,
		name,
		code: '',
		landArea,
		d: '',
		change: changePer1000(stats.totalChange, stats.population),
		density: densityOf(stats.population, landArea)
	};
}

export function emptyPopulationViews(geometry: PopulationGeometry): PopulationViews {
	const empty = (map: FinlandMap<PopulationStats>, name: string): PopulationView => {
		const areas = map.kuntas.map(withDerived);

		return {
			areas,
			viewBox: map.viewBox,
			total: rollUp(name, areas),
			countryChange: null,
			period: '',
			source: '',
			polled: null
		};
	};

	return {
		finland: empty(geometry.finland, 'Finland'),
		maakunta: empty(geometry.maakunta, 'Finland'),
		tampere: empty(geometry.tampere, TAMPERE_REGION.label)
	};
}

export async function loadPopulationViews(geometry: PopulationGeometry): Promise<PopulationViews> {
	const [raw, manifest] = await Promise.all([
		fetchExport(FILES.population),
		fetchExport(FILES.manifest) as Promise<Manifest | null>
	]);

	const data = parse(raw, toPopulationData);

	if (!data) return emptyPopulationViews(geometry);

	const polled = polledFor(manifest, FILES.population);
	const municipal = merge(geometry.finland.kuntas, data.stats, EMPTY_POPULATION_STATS);
	const areas = municipal.map(withDerived);
	const byCode = new Map(areas.map((a) => [a.code, a]));

	// The Region tab: municipal figures grouped by the maakunta each municipality's geometry
	// falls in, since neither the export nor the maakunta file supplies them. The land area
	// has to be summed too — the maakunta geometry carries none of its own.
	const regionStats = new Map<string, PopulationStats & { landArea: number }>();

	for (const [region, members] of Object.entries(geometry.membersOf)) {
		const parts = members.map((code) => byCode.get(code)).filter((a) => a !== undefined);

		regionStats.set(region, {
			...aggregatePopulationStats(parts),
			landArea: parts.reduce((sum, a) => sum + (a.landArea ?? 0), 0)
		});
	}

	const regionAreas = merge(geometry.maakunta.kuntas, regionStats, {
		...EMPTY_POPULATION_STATS,
		landArea: 0
	}).map(withDerived);

	const tampereAreas = merge(geometry.tampere.kuntas, data.stats, EMPTY_POPULATION_STATS).map(
		withDerived
	);

	// Finland's own total comes from the export's whole-country row; the land area behind it is
	// the sum of the municipalities', the same figure the map is drawn from.
	const countryLandArea = areas.reduce((sum, a) => sum + (a.landArea ?? 0), 0);
	const countryTotal: PopulationArea = {
		...data.national,
		name: 'Finland',
		code: '',
		landArea: countryLandArea,
		d: '',
		change: changePer1000(data.national.totalChange, data.national.population),
		density: densityOf(data.national.population, countryLandArea)
	};

	const common = {
		countryChange: countryTotal.change,
		period: data.period,
		source: data.source,
		polled
	};

	return {
		finland: { areas, viewBox: geometry.finland.viewBox, total: countryTotal, ...common },
		// Same country, coarser areas — so the Region tab's headline stays the national total.
		maakunta: {
			areas: regionAreas,
			viewBox: geometry.maakunta.viewBox,
			total: countryTotal,
			...common
		},
		tampere: {
			areas: tampereAreas,
			viewBox: geometry.tampere.viewBox,
			total: rollUp(TAMPERE_REGION.label, tampereAreas),
			...common
		}
	};
}
