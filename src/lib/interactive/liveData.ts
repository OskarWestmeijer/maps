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
import type { FinlandMap, Kunta, KuntaBase } from './finland';
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
import { incomeDeviation, toIncomeData, EMPTY_INCOME_STATS, type IncomeStats } from './income';
import {
	aggregateEducationStats,
	medianShare,
	toEducationData,
	EMPTY_EDUCATION_STATS,
	type EducationStats
} from './education';
import { aggregateAgeStats, medianAge, toAgeData, EMPTY_AGE_STATS, type AgeStats } from './age';
import { scoreAreas, type Indicator, type ScoreBreakdown } from './score';
import { count, percent, decimal } from './format';
import { shortRegionName, TAMPERE_REGION } from './regions';

/** Where the cron writes, and nginx serves from. Filenames carry the PxWeb table id, not the
 *  period — they are overwritten in place, and every parser reads the period from the file. */
const FILES = {
	unemployment: 'unemployment_register_kunnat_12r5.json',
	software: 'software_occupations_register_kunnat_12ti.json',
	survey: 'unemployment_survey_national_135z.json',
	population: 'population_register_kunnat_121w.json',
	income: 'income_register_kunnat_14ww.json',
	education: 'education_register_kunnat_12bs.json',
	age: 'age_register_kunnat_11ra.json',
	manifest: 'manifest.json'
} as const;

/**
 * Written by `scripts/fetch_statfi.py` on every run. Per file, because the four tables are on
 * independent release cycles.
 *
 * Three dates, three questions: `period` is what the figures describe ("2026M06"), `updated`
 * is when Statistics Finland published them, `polled` is when we last asked. Only `polled`
 * moves on a run that changes nothing, which is what makes a stale `updated` beside a fresh
 * `polled` readable as "checked today, still June's release".
 *
 * Only `polled` is rendered (above the Sources button); the other two are there for anyone
 * inspecting `/data/manifest.json` directly.
 */
type Manifest = {
	polled?: string;
	files?: Record<string, { polled?: string; updated?: string | null; period?: string }>;
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

/** What every geometry payload carries for the region lookup below. */
type WithMembership = {
	maakunta: { kuntas: { code: string; name: string }[] };
	/** maakunta code -> its municipalities, derived geometrically at build time (`membership.ts`). */
	membersOf: Record<string, string[]>;
};

/**
 * kunta code -> the maakunta it's in, inverted from the `membersOf` grouping the geometry
 * ships. All three maps name the region of whatever municipality is hovered, and this is the
 * only place that membership exists: the PxWeb exports carry region *totals* (`MK` rows), never
 * a list of which municipalities are in one.
 *
 * Geometry-derived, so it's known before any figures are fetched — the empty views set it, and
 * `merge` carries it through untouched when the statistics land.
 */
function regionNames(geometry: WithMembership): Map<string, string> {
	const labels = new Map(geometry.maakunta.kuntas.map((region) => [region.code, region.name]));
	const names = new Map<string, string>();

	for (const [region, members] of Object.entries(geometry.membersOf)) {
		const label = labels.get(region);

		if (!label) continue;

		for (const member of members) names.set(member, label);
	}

	return names;
}

/** Tags each area with its maakunta. Empty for the Region tab, whose areas *are* maakunnat. */
function withRegion<A extends { code: string }>(
	areas: A[],
	names: Map<string, string>
): (A & { regionName: string })[] {
	return areas.map((area) => ({ ...area, regionName: names.get(area.code) ?? '' }));
}

// --------------------------------------------------------------------- unemployment

/** What `+page.server.ts` ships: geometry per tab, with every stat field present and null. */
export type UnemploymentGeometry = {
	finland: FinlandMap<KuntaStats>;
	maakunta: FinlandMap<KuntaStats>;
	tampere: FinlandMap<KuntaStats>;
	/** Only for naming each municipality's maakunta in the panel — this map reads 12r5's own
	 *  region rows rather than aggregating anything from it. */
	membersOf: Record<string, string[]>;
};

/** A municipality with its figures and the maakunta it sits in. */
export type UnemploymentArea = Kunta<KuntaStats> & { regionName: string };

export type UnemploymentView = Omit<FinlandMap<KuntaStats>, 'kuntas'> & {
	kuntas: UnemploymentArea[];
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
	const names = regionNames(geometry);
	const empty = (map: FinlandMap<KuntaStats>): UnemploymentView => ({
		...map,
		kuntas: withRegion(map.kuntas, names),
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
	/** The maakunta this municipality is in. Empty on the Region tab and on a roll-up. */
	regionName: string;
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

function withDerived(area: Kunta<PopulationStats> & { regionName?: string }): PopulationArea {
	return {
		...area,
		regionName: area.regionName ?? '',
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
		// A roll-up spans regions (or is the whole country), so it belongs to none.
		regionName: '',
		change: changePer1000(stats.totalChange, stats.population),
		density: densityOf(stats.population, landArea)
	};
}

export function emptyPopulationViews(geometry: PopulationGeometry): PopulationViews {
	const names = regionNames(geometry);
	const empty = (map: FinlandMap<PopulationStats>, name: string): PopulationView => {
		const areas = withRegion(map.kuntas, names).map(withDerived);

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
	const names = regionNames(geometry);
	const municipal = merge(geometry.finland.kuntas, data.stats, EMPTY_POPULATION_STATS);
	const areas = withRegion(municipal, names).map(withDerived);
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

	const tampereAreas = withRegion(
		merge(geometry.tampere.kuntas, data.stats, EMPTY_POPULATION_STATS),
		names
	).map(withDerived);

	// Finland's own total comes from the export's whole-country row; the land area behind it is
	// the sum of the municipalities', the same figure the map is drawn from.
	const countryLandArea = areas.reduce((sum, a) => sum + (a.landArea ?? 0), 0);
	const countryTotal: PopulationArea = {
		...data.national,
		name: 'Finland',
		code: '',
		landArea: countryLandArea,
		d: '',
		regionName: '',
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

// --------------------------------------------------------------------------- income

export type IncomeArea = Kunta<IncomeStats> & {
	/** The maakunta this municipality is in. Empty on the Region tab and on the metro tab's
	 *  areas' behalf only where a roll-up would span several — here every area has one. */
	regionName: string;
};

export type IncomeGeometry = {
	finland: FinlandMap<IncomeStats>;
	maakunta: FinlandMap<IncomeStats>;
	tampere: FinlandMap<IncomeStats>;
	/** Only for naming each municipality's maakunta in the panel. Unlike the population map,
	 *  nothing here is rolled up from it: 14ww publishes its own `MK` rows, and a median could
	 *  not be aggregated even if it didn't. */
	membersOf: Record<string, string[]>;
};

export type IncomeView = {
	areas: IncomeArea[];
	viewBox: string;
	/**
	 * The area's own published figures — the `SSS` row on the Finland and Region tabs, which
	 * both cover the whole country.
	 *
	 * **Null on the Tampere Metro tab, on purpose.** Every other map rolls a hand-picked region
	 * up from its municipalities, because their measures are ratios of counts. A median is not:
	 * it needs the household-level distribution, which the export doesn't ship (see the note in
	 * `income.ts`). Statistics Finland publishes no row for these eight municipalities either —
	 * the seutukunta row `SK064` covers eleven. So that tab has no headline figure and the panel
	 * says so rather than inventing one.
	 */
	total: IncomeArea | null;
	/** Finland's own median, carried on *every* view: it's what the diverging scale pivots
	 *  around and what the panel's chip compares against, so a municipality keeps its colour
	 *  when the tab flips. */
	countryMedian: number | null;
	period: string;
	source: string;
	polled: string | null;
};

export type IncomeViews = Record<'finland' | 'maakunta' | 'tampere', IncomeView>;

/** The whole-country figures shaped like an area, so the panel reads one type either way. */
function asArea(name: string, stats: IncomeStats): IncomeArea {
	return { ...stats, name, code: '', landArea: null, d: '', regionName: '' };
}

export function emptyIncomeViews(geometry: IncomeGeometry): IncomeViews {
	const names = regionNames(geometry);
	const empty = (map: FinlandMap<IncomeStats>, total: IncomeArea | null): IncomeView => ({
		areas: withRegion(map.kuntas, names),
		viewBox: map.viewBox,
		total,
		countryMedian: null,
		period: '',
		source: '',
		polled: null
	});

	return {
		finland: empty(geometry.finland, asArea('Finland', EMPTY_INCOME_STATS)),
		maakunta: empty(geometry.maakunta, asArea('Finland', EMPTY_INCOME_STATS)),
		tampere: empty(geometry.tampere, null)
	};
}

export async function loadIncomeViews(geometry: IncomeGeometry): Promise<IncomeViews> {
	const [raw, manifest] = await Promise.all([
		fetchExport(FILES.income),
		fetchExport(FILES.manifest) as Promise<Manifest | null>
	]);

	const municipal = parse(raw, (px) => toIncomeData(px, 'KU'));

	if (!municipal) return emptyIncomeViews(geometry);

	// The Region tab reads the export's own MK rows — Statistics Finland computed those from the
	// microdata, which is the only way a regional median can be had.
	const regional = parse(raw, (px) => toIncomeData(px, 'MK'));
	const names = regionNames(geometry);
	const polled = polledFor(manifest, FILES.income);
	const country = asArea('Finland', municipal.national);

	const common = {
		countryMedian: municipal.national.medianIncome,
		period: municipal.period,
		source: municipal.source,
		polled
	};

	const build = (
		map: FinlandMap<IncomeStats>,
		stats: Map<string, IncomeStats>,
		total: IncomeArea | null
	): IncomeView => ({
		areas: withRegion(merge(map.kuntas, stats, EMPTY_INCOME_STATS), names),
		viewBox: map.viewBox,
		total,
		...common
	});

	return {
		finland: build(geometry.finland, municipal.stats, country),
		// Same country, coarser areas — so the Region tab's headline stays the national figure.
		maakunta: build(geometry.maakunta, regional?.stats ?? new Map(), country),
		// No published row for these eight, and no way to derive one. See `IncomeView.total`.
		tampere: build(geometry.tampere, municipal.stats, null)
	};
}

// ------------------------------------------------------------------------ education

export type EducationArea = Kunta<EducationStats> & {
	/** The maakunta this municipality is in. Empty on the Region tab, whose areas *are* maakunnat. */
	regionName: string;
};

export type EducationGeometry = {
	finland: FinlandMap<EducationStats>;
	maakunta: FinlandMap<EducationStats>;
	tampere: FinlandMap<EducationStats>;
	/** Only for naming each municipality's maakunta in the panel — 12bs publishes its own `MK`
	 *  rows, so nothing on this map is rolled up from the grouping. */
	membersOf: Record<string, string[]>;
};

export type EducationView = {
	areas: EducationArea[];
	viewBox: string;
	/**
	 * The area's own figures: the published `SSS` row on the Finland and Region tabs, and a
	 * roll-up of the eight municipalities on Tampere Metro.
	 *
	 * Never null, which is the one structural difference from `IncomeView` and worth the contrast:
	 * a share of a headcount *is* aggregable — sum the degree-holders, sum the 15+ population,
	 * divide — so the metro tab has an exact headline where the income map honestly has none.
	 */
	total: EducationArea;
	/** Finland's own share. Not what the scale pivots on — see `medianShare` — but the figure the
	 *  panel names when it explains why not. */
	countryShare: number | null;
	/**
	 * The **median municipality's** share, which the diverging scale and the panel's chip both
	 * pivot on, carried on every view so an area keeps its colour when the tab flips.
	 *
	 * Always computed from the 308 municipal figures, including on the Region tab whose own areas
	 * are maakunnat: a region compared against the median *municipality* is the same comparison
	 * every other area on the site gets. Why the median rather than Finland's own 34,5 % is in
	 * `education.ts` — only 42 of 308 municipalities reach the national figure.
	 */
	medianShare: number | null;
	period: string;
	source: string;
	polled: string | null;
};

export type EducationViews = Record<'finland' | 'maakunta' | 'tampere', EducationView>;

/** Figures shaped like an area, so the panel reads one type whether or not something is selected. */
function asEducationArea(name: string, stats: EducationStats): EducationArea {
	return { ...stats, name, code: '', landArea: null, d: '', regionName: '' };
}

export function emptyEducationViews(geometry: EducationGeometry): EducationViews {
	const names = regionNames(geometry);
	const empty = (map: FinlandMap<EducationStats>, name: string): EducationView => ({
		areas: withRegion(map.kuntas, names),
		viewBox: map.viewBox,
		total: asEducationArea(name, EMPTY_EDUCATION_STATS),
		countryShare: null,
		medianShare: null,
		period: '',
		source: '',
		polled: null
	});

	return {
		finland: empty(geometry.finland, 'Finland'),
		maakunta: empty(geometry.maakunta, 'Finland'),
		tampere: empty(geometry.tampere, TAMPERE_REGION.label)
	};
}

export async function loadEducationViews(geometry: EducationGeometry): Promise<EducationViews> {
	const [raw, manifest] = await Promise.all([
		fetchExport(FILES.education),
		fetchExport(FILES.manifest) as Promise<Manifest | null>
	]);

	const municipal = parse(raw, (px) => toEducationData(px, 'KU'));

	if (!municipal) return emptyEducationViews(geometry);

	// The Region tab reads the export's own MK rows. They could be rolled up exactly from the
	// municipalities — unlike the income map's — but the published figure is the one to show when
	// there is one.
	const regional = parse(raw, (px) => toEducationData(px, 'MK'));
	const names = regionNames(geometry);
	const polled = polledFor(manifest, FILES.education);
	const country = asEducationArea('Finland', municipal.national);

	const common = {
		countryShare: municipal.national.tertiaryShare,
		// From the municipal figures on every tab — see `EducationView.medianShare`.
		medianShare: medianShare([...municipal.stats.values()].map((s) => s.tertiaryShare)),
		period: municipal.period,
		source: municipal.source,
		polled
	};

	const build = (
		map: FinlandMap<EducationStats>,
		stats: Map<string, EducationStats>,
		total: (areas: EducationArea[]) => EducationArea
	): EducationView => {
		const areas = withRegion(merge(map.kuntas, stats, EMPTY_EDUCATION_STATS), names);

		return { areas, viewBox: map.viewBox, total: total(areas), ...common };
	};

	return {
		finland: build(geometry.finland, municipal.stats, () => country),
		// Same country, coarser areas — so the Region tab's headline stays the national figure.
		maakunta: build(geometry.maakunta, regional?.stats ?? new Map(), () => country),
		// No published row for these eight, but this measure can be combined into one exactly.
		tampere: build(geometry.tampere, municipal.stats, (areas) =>
			asEducationArea(TAMPERE_REGION.label, aggregateEducationStats(areas))
		)
	};
}

// ------------------------------------------------------------------------------ age

export type AgeArea = Kunta<AgeStats> & {
	/** The maakunta this municipality is in. Empty on the Region tab, whose areas *are* maakunnat. */
	regionName: string;
};

export type AgeGeometry = {
	finland: FinlandMap<AgeStats>;
	maakunta: FinlandMap<AgeStats>;
	tampere: FinlandMap<AgeStats>;
	/** Only for naming each municipality's maakunta in the panel — 11ra publishes its own `MK`
	 *  rows, so nothing on this map is rolled up from the grouping. */
	membersOf: Record<string, string[]>;
};

export type AgeView = {
	areas: AgeArea[];
	viewBox: string;
	/** Published `SSS` on Finland and Region, a population-weighted roll-up on Tampere Metro.
	 *  Never null: a mean combines exactly when it's weighted, unlike the income map's median. */
	total: AgeArea;
	/** Finland's own mean age. Not what the scale pivots on — see `medianAge` — but the figure
	 *  the panel names when it explains why not. */
	countryAge: number | null;
	/** The **median municipality's** mean age, which the diverging scale and the panel's chip both
	 *  pivot on, carried on every view so an area keeps its colour when the tab flips. Only 58 of
	 *  the 308 municipalities sit below the national figure, which is why it isn't that. */
	medianAge: number | null;
	period: string;
	source: string;
	polled: string | null;
};

export type AgeViews = Record<'finland' | 'maakunta' | 'tampere', AgeView>;

/** Figures shaped like an area, so the panel reads one type whether or not something is selected. */
function asAgeArea(name: string, stats: AgeStats): AgeArea {
	return { ...stats, name, code: '', landArea: null, d: '', regionName: '' };
}

export function emptyAgeViews(geometry: AgeGeometry): AgeViews {
	const names = regionNames(geometry);
	const empty = (map: FinlandMap<AgeStats>, name: string): AgeView => ({
		areas: withRegion(map.kuntas, names),
		viewBox: map.viewBox,
		total: asAgeArea(name, EMPTY_AGE_STATS),
		countryAge: null,
		medianAge: null,
		period: '',
		source: '',
		polled: null
	});

	return {
		finland: empty(geometry.finland, 'Finland'),
		maakunta: empty(geometry.maakunta, 'Finland'),
		tampere: empty(geometry.tampere, TAMPERE_REGION.label)
	};
}

export async function loadAgeViews(geometry: AgeGeometry): Promise<AgeViews> {
	const [raw, manifest] = await Promise.all([
		fetchExport(FILES.age),
		fetchExport(FILES.manifest) as Promise<Manifest | null>
	]);

	const municipal = parse(raw, (px) => toAgeData(px, 'KU'));

	if (!municipal) return emptyAgeViews(geometry);

	const regional = parse(raw, (px) => toAgeData(px, 'MK'));
	const names = regionNames(geometry);
	const polled = polledFor(manifest, FILES.age);
	const country = asAgeArea('Finland', municipal.national);

	const common = {
		countryAge: municipal.national.averageAge,
		// From the municipal figures on every tab — see `AgeView.medianAge`.
		medianAge: medianAge([...municipal.stats.values()].map((s) => s.averageAge)),
		period: municipal.period,
		source: municipal.source,
		polled
	};

	const build = (
		map: FinlandMap<AgeStats>,
		stats: Map<string, AgeStats>,
		total: (areas: AgeArea[]) => AgeArea
	): AgeView => {
		const areas = withRegion(merge(map.kuntas, stats, EMPTY_AGE_STATS), names);

		return { areas, viewBox: map.viewBox, total: total(areas), ...common };
	};

	return {
		finland: build(geometry.finland, municipal.stats, () => country),
		maakunta: build(geometry.maakunta, regional?.stats ?? new Map(), () => country),
		// No published row for these eight, but a population-weighted mean of them is exact.
		tampere: build(geometry.tampere, municipal.stats, (areas) =>
			asAgeArea(TAMPERE_REGION.label, aggregateAgeStats(areas))
		)
	};
}

// -------------------------------------------------------------------------- compare

/**
 * The composite score's areas carry one figure per domain, plus the breakdown `score.ts`
 * computes from them. Adding a domain means one more field here and one more `INDICATORS`
 * entry — nothing else in this module changes shape.
 */
export type CompareArea = KuntaBase & {
	/** Registered unemployment rate, from 12r5. Lower is better. */
	rate: number | null;
	/** Population change per 1 000, from 121w. Higher is better. */
	change: number | null;
	/** Median disposable income per consumption unit, from 14ww. Higher is better. */
	income: number | null;
	/** Share of the 15+ population with a tertiary degree, from 12bs. Higher is better. */
	education: number | null;
	/** Mean age of the population, from 11ra. Lower is better. */
	age: number | null;
	score: ScoreBreakdown;
	/** The maakunta this municipality is in, full name — the panel shows it whole and the
	 *  ranking shortens it at render (`shortRegionName`), so the data stays the published one.
	 *  Empty on the Region tab, whose areas *are* maakunnat, and before the fetch. */
	regionName: string;
};

/**
 * The domains the score folds together, in panel order. Equal weights — see `MIN_COVERAGE` in
 * `score.ts` for why an area missing any of them isn't scored at all.
 *
 * This array is the extension point: education, economy and housing each become one more entry
 * once their table is fetched and parsed, and the page picks them up without further edits.
 */
export const INDICATORS: Indicator<CompareArea>[] = [
	{
		key: 'jobs',
		label: 'Jobs',
		valueOf: (area) => area.rate,
		format: percent,
		higherIsBetter: false,
		weight: 1
	},
	{
		key: 'people',
		label: 'People',
		valueOf: (area) => area.change,
		// Always signed, with a real minus — the same shape the population map gives it, and
		// the sign is the whole point of a change figure. `decimal` alone would render an ASCII
		// hyphen and no plus.
		format: (value) =>
			value === null
				? 'no data'
				: `${value > 0 ? '+' : value < 0 ? '−' : ''}${decimal(Math.abs(value))} per 1 000`,
		higherIsBetter: true,
		weight: 1
	},
	{
		key: 'income',
		label: 'Income',
		valueOf: (area) => area.income,
		format: (value) => (value === null ? 'no data' : `${count(value)} €`),
		higherIsBetter: true,
		weight: 1
	},
	{
		key: 'education',
		label: 'Education',
		valueOf: (area) => area.education,
		format: percent,
		higherIsBetter: true,
		weight: 1
	},
	{
		key: 'age',
		label: 'Age',
		valueOf: (area) => area.age,
		format: (value) => (value === null ? 'no data' : `${decimal(value)} yrs`),
		// A judgement rather than a fact, and the only indicator where the direction is arguable:
		// a younger population is counted as the better side here. The Sources popover says so.
		higherIsBetter: false,
		weight: 1
	}
];

const EMPTY_SCORE: ScoreBreakdown = {
	score: null,
	rank: null,
	ranked: 0,
	parts: INDICATORS.map((indicator) => ({
		key: indicator.key,
		label: indicator.label,
		percentile: null,
		value: null,
		formatted: indicator.format(null)
	})),
	isPartial: true
};

export type CompareView = {
	areas: CompareArea[];
	viewBox: string;
	/** Every table's period, since they're released on independent cycles. */
	period: string;
	populationPeriod: string;
	incomePeriod: string;
	educationPeriod: string;
	agePeriod: string;
	polled: string | null;
	populationPolled: string | null;
	incomePolled: string | null;
	educationPolled: string | null;
	agePolled: string | null;
	source: string;
	populationSource: string;
	incomeSource: string;
	educationSource: string;
	ageSource: string;
};

export type CompareViews = Record<'finland' | 'maakunta' | 'tampere', CompareView>;

/** Geometry is identical to the population page's — the Region tab needs `membersOf` for the
 *  same reason: 121w has no region rows, so its regional figures are rolled up here. */
export type CompareGeometry = PopulationGeometry;

function blankArea(area: {
	code: string;
	name: string;
	d: string;
	regionName: string;
}): CompareArea {
	return {
		...area,
		landArea: null,
		rate: null,
		change: null,
		income: null,
		education: null,
		age: null,
		score: EMPTY_SCORE
	};
}

export function emptyCompareViews(geometry: CompareGeometry): CompareViews {
	const names = regionNames(geometry);
	const empty = (map: FinlandMap<PopulationStats>): CompareView => ({
		areas: withRegion(map.kuntas, names).map(blankArea),
		viewBox: map.viewBox,
		period: '',
		populationPeriod: '',
		incomePeriod: '',
		educationPeriod: '',
		agePeriod: '',
		polled: null,
		populationPolled: null,
		incomePolled: null,
		educationPolled: null,
		agePolled: null,
		source: '',
		populationSource: '',
		incomeSource: '',
		educationSource: '',
		ageSource: ''
	});

	return {
		finland: empty(geometry.finland),
		maakunta: empty(geometry.maakunta),
		tampere: empty(geometry.tampere)
	};
}

export async function loadCompareViews(geometry: CompareGeometry): Promise<CompareViews> {
	const [registerRaw, populationRaw, incomeRaw, educationRaw, ageRaw, manifest] = await Promise.all(
		[
			fetchExport(FILES.unemployment),
			fetchExport(FILES.population),
			fetchExport(FILES.income),
			fetchExport(FILES.education),
			fetchExport(FILES.age),
			fetchExport(FILES.manifest) as Promise<Manifest | null>
		]
	);

	const register = parse(registerRaw, (px) => toUnemploymentData(px, 'KU'));
	const registerRegions = parse(registerRaw, (px) => toUnemploymentData(px, 'MK'));
	const population = parse(populationRaw, toPopulationData);
	const income = parse(incomeRaw, (px) => toIncomeData(px, 'KU'));
	const incomeRegions = parse(incomeRaw, (px) => toIncomeData(px, 'MK'));
	const education = parse(educationRaw, (px) => toEducationData(px, 'KU'));
	const educationRegions = parse(educationRaw, (px) => toEducationData(px, 'MK'));
	const age = parse(ageRaw, (px) => toAgeData(px, 'KU'));
	const ageRegions = parse(ageRaw, (px) => toAgeData(px, 'MK'));

	const blank = emptyCompareViews(geometry);

	if (!register && !population && !income && !education && !age) return blank;

	/** One accessor per indicator field, so a new domain is an extra key here rather than an
	 *  extra parameter. They differ per area level: most tabs read an export's own rows, while
	 *  the Region tab rolls population up (121w has no region rows to read). */
	type Accessors = Record<
		'rate' | 'change' | 'income' | 'education' | 'age',
		(code: string) => number | null
	>;

	const join = (areas: CompareArea[], of: Accessors): CompareArea[] =>
		areas.map((area) => ({
			...area,
			rate: of.rate(area.code),
			change: of.change(area.code),
			income: of.income(area.code),
			education: of.education(area.code),
			age: of.age(area.code)
		}));

	const rateOf = (code: string) => register?.stats.get(code)?.rate ?? null;
	const populationChangeOf = (code: string) => {
		const stats = population?.stats.get(code);

		return stats ? changePer1000(stats.totalChange, stats.population) : null;
	};
	const incomeOf = (code: string) => income?.stats.get(code)?.medianIncome ?? null;
	const educationOf = (code: string) => education?.stats.get(code)?.tertiaryShare ?? null;
	const ageOf = (code: string) => age?.stats.get(code)?.averageAge ?? null;

	// Municipal figures, joined once and scored against all 308 — never against a tab's own
	// subset. A municipality's score has to mean the same thing whichever tab it's seen on.
	// `blank` already carries each area's maakunta — it comes from the geometry, not the
	// statistics, so it's known before the fetch and survives the join untouched.
	const municipal = join(blank.finland.areas, {
		rate: rateOf,
		change: populationChangeOf,
		income: incomeOf,
		education: educationOf,
		age: ageOf
	});
	const municipalScores = scoreAreas(municipal, INDICATORS);
	const scoredMunicipal = municipal.map((area) => ({
		...area,
		score: municipalScores.get(area.code) ?? EMPTY_SCORE
	}));
	const byCode = new Map(scoredMunicipal.map((area) => [area.code, area]));

	// The Region tab: 12r5, 14ww and 12bs all publish their own MK rows, but 121w has none, so
	// only the population figure is rolled up from each region's municipalities (the grouping
	// `membership.ts` derived at build time). Income *could not* be rolled up in any case — a
	// median isn't additive, which is why reading the published row matters here rather than
	// merely being convenient. Regions are ranked against the other 18, not against the 308 —
	// they're a different kind of area, and the Sources popover says so.
	const regionAreas = join(blank.maakunta.areas, {
		rate: (code) => registerRegions?.stats.get(code)?.rate ?? null,
		change: (code) => {
			const members = geometry.membersOf[code] ?? [];
			const stats = aggregatePopulationStats(
				members.map((member) => population?.stats.get(member) ?? EMPTY_POPULATION_STATS)
			);

			return changePer1000(stats.totalChange, stats.population);
		},
		income: (code) => incomeRegions?.stats.get(code)?.medianIncome ?? null,
		education: (code) => educationRegions?.stats.get(code)?.tertiaryShare ?? null,
		age: (code) => ageRegions?.stats.get(code)?.averageAge ?? null
	});
	const regionScores = scoreAreas(regionAreas, INDICATORS);
	const scoredRegions = regionAreas.map((area) => ({
		...area,
		score: regionScores.get(area.code) ?? EMPTY_SCORE
	}));

	const common = {
		period: register?.period ?? '',
		populationPeriod: population?.period ?? '',
		incomePeriod: income?.period ?? '',
		educationPeriod: education?.period ?? '',
		agePeriod: age?.period ?? '',
		polled: polledFor(manifest, FILES.unemployment),
		populationPolled: polledFor(manifest, FILES.population),
		incomePolled: polledFor(manifest, FILES.income),
		educationPolled: polledFor(manifest, FILES.education),
		agePolled: polledFor(manifest, FILES.age),
		source: register?.source ?? '',
		populationSource: population?.source ?? '',
		incomeSource: income?.source ?? '',
		educationSource: education?.source ?? '',
		ageSource: age?.source ?? ''
	};

	return {
		finland: { areas: scoredMunicipal, viewBox: geometry.finland.viewBox, ...common },
		maakunta: { areas: scoredRegions, viewBox: geometry.maakunta.viewBox, ...common },
		// The same municipal scores, filtered to the metro's eight — not rescored among
		// themselves, which would make a kunta's number change when the tab flips.
		//
		// Only the *figures* are taken from that lookup. Spreading the whole municipal area over
		// this tab would bring its `d` with it, replacing the metro's own 20 m geometry with the
		// coarse 2 km shapes from the whole-country file — the right municipalities drawn at the
		// wrong detail, inside a viewBox meant for the finer ones.
		tampere: {
			areas: blank.tampere.areas.map((area) => {
				const scored = byCode.get(area.code);

				return scored
					? {
							...area,
							rate: scored.rate,
							change: scored.change,
							income: scored.income,
							education: scored.education,
							age: scored.age,
							score: scored.score,
							regionName: scored.regionName
						}
					: area;
			}),
			viewBox: geometry.tampere.viewBox,
			...common
		}
	};
}
