/**
 * Reads the KEHA-keskus / Työnvälitystilasto municipal export (PxWeb JSON) and pulls out
 * one unemployment figure per area, keyed by the same national code (`natcode`) the map
 * GeoJSON carries. The export bundles multiple area levels in one file (municipality,
 * region, sub-region, ELY, whole country); `toUnemploymentData`'s `areaPrefix` picks which
 * one to key `stats` by.
 *
 * A note on the metric: `TYOTOSUUS` is the share of *registered unemployed jobseekers* in
 * the labour force, which is not the same statistic as Tilastokeskus's headline
 * työttömyysaste (a Labour Force Survey figure). It runs a few points higher. The survey
 * is sample-based and has no municipal breakdown, which is why this register-based series
 * is the one that can be mapped at all.
 */

export type PxWebExport = {
	columns: { code: string; text: string; type: string }[];
	data: { key: string[]; values: string[] }[];
	metadata?: { updated?: string; label?: string; source?: string }[];
};

export type KuntaStats = {
	/** Unemployed jobseekers as a percentage of the labour force. */
	rate: number | null;
	/** Labour force. Note this comes from Tilastokeskus's employment statistics and, per
	 * the export's own column comment, is typically about two years behind the monthly
	 * jobseeker counts it is divided into. */
	labourForce: number | null;
	/** All registered jobseekers, including those currently in work. */
	jobseekers: number | null;
	/** Registered jobseekers who are unemployed — the numerator behind `rate`. */
	unemployed: number | null;
	/** Open vacancies registered with the employment service on the reference day. All
	 * occupations — the software/app-development slice of the same measure lives in
	 * `softwareJobs.ts`, from a different export. */
	vacancies: number | null;
};

/** Every field null — merged into areas the export has no row for. */
export const EMPTY_KUNTA_STATS: KuntaStats = {
	rate: null,
	labourForce: null,
	jobseekers: null,
	unemployed: null,
	vacancies: null
};

export type UnemploymentData = {
	/** natcode -> figures. Individual fields are null where the source suppresses them. */
	stats: Map<string, KuntaStats>;
	/** Whole-country figures (the `SSS` row), for context before anything is hovered. */
	national: KuntaStats;
	/** Statistics period, e.g. "2026M06". */
	period: string;
	source: string;
};

/**
 * Rolls up an arbitrary set of municipalities into one figure — used for a hand-picked
 * region (e.g. Tampere metro), which has no equivalent pre-aggregated row in the source
 * export the way the whole country does (`SSS`).
 *
 * Each field is summed independently rather than the whole result going null the moment any
 * one municipality has a suppressed figure: a municipality's `labourForce` can be known even
 * when its `rate` is suppressed (same as the per-kunta data already handles), so a field is
 * only null here when *every* municipality's value for it is null.
 *
 * `rate` is recomputed from the summed `unemployed`/`labourForce`, never averaged from the
 * per-kunta rates — municipalities vary hugely in size, so an average would misweight them.
 */
export function aggregateKuntaStats(list: KuntaStats[]): KuntaStats {
	const sum = (field: 'labourForce' | 'jobseekers' | 'unemployed' | 'vacancies'): number | null => {
		const known = list.map((k) => k[field]).filter((v): v is number => v !== null);

		return known.length ? known.reduce((a, b) => a + b, 0) : null;
	};

	const labourForce = sum('labourForce');
	const jobseekers = sum('jobseekers');
	const unemployed = sum('unemployed');
	const rate =
		labourForce !== null && labourForce > 0 && unemployed !== null
			? (unemployed / labourForce) * 100
			: null;

	return { rate, labourForce, jobseekers, unemployed, vacancies: sum('vacancies') };
}

const WHOLE_COUNTRY = 'SSS';

const COLUMNS = {
	rate: 'TYOTOSUUS',
	labourForce: 'TYOVOIMATK',
	jobseekers: 'HAKIJALOPUSSA',
	unemployed: 'TYOTTOMATLOPUSSA',
	vacancies: 'AVPAIKATLOPUSSA'
} as const;

/**
 * PxWeb splits its columns into key columns (the dimensions, `type` d/t) and content
 * columns (the measures, `type` c), but each row's `values` array only holds the content
 * columns — so indexes have to be resolved against the filtered list, not `columns`.
 */
function columnIndexes(columns: PxWebExport['columns']): Record<keyof KuntaStats, number> {
	const content = columns.filter((c) => c.type === 'c');
	const indexes = {} as Record<keyof KuntaStats, number>;

	for (const [field, code] of Object.entries(COLUMNS) as [keyof KuntaStats, string][]) {
		const index = content.findIndex((c) => c.code === code);

		if (index === -1) throw new Error(`Missing ${code} column in unemployment export`);

		indexes[field] = index;
	}

	return indexes;
}

/** PxWeb marks suppressed/unavailable figures with "..." or an empty string. */
function parseRate(raw: string | undefined): number | null {
	if (!raw) return null;

	const value = Number(raw.replace(',', '.'));

	return Number.isFinite(value) ? value : null;
}

/**
 * @param areaPrefix Which rows to key `stats` by: `'KU'` for the 308 municipalities (the
 *   default), or `'MK'` for the 19 maakunta/region rows the same export carries — used for
 *   the Region tab, which shows the whole country at region rather than municipality
 *   granularity. Either way `national` always comes from the single whole-country `SSS`
 *   row, independent of which area level was requested.
 */
export function toUnemploymentData(
	px: PxWebExport,
	areaPrefix: 'KU' | 'MK' = 'KU'
): UnemploymentData {
	const indexes = columnIndexes(px.columns);
	const stats = new Map<string, KuntaStats>();
	let national: KuntaStats = EMPTY_KUNTA_STATS;
	let period = '';

	for (const row of px.data) {
		const [area, timePeriod] = row.key;
		const figures: KuntaStats = {
			rate: parseRate(row.values[indexes.rate]),
			labourForce: parseRate(row.values[indexes.labourForce]),
			jobseekers: parseRate(row.values[indexes.jobseekers]),
			unemployed: parseRate(row.values[indexes.unemployed]),
			vacancies: parseRate(row.values[indexes.vacancies])
		};

		if (timePeriod) period = timePeriod;

		if (area === WHOLE_COUNTRY) {
			national = figures;
			continue;
		}

		// The export carries several area levels in one file — KU (municipality), MK
		// (region), SK (sub-region) and ELY — plus an "area unknown" bucket per level; only
		// the requested prefix's numeric codes line up with the map being rendered.
		if (!area.startsWith(areaPrefix)) continue;

		const natcode = area.slice(areaPrefix.length);

		// An area is kept even when some figures are suppressed — the labour force is
		// published for all of them, while a handful of tiny Åland municipalities have no
		// rate.
		if (!/^\d+$/.test(natcode)) continue;

		stats.set(natcode, figures);
	}

	return {
		stats,
		national,
		period,
		source: px.metadata?.[0]?.source ?? 'Työnvälitystilasto'
	};
}

/**
 * A *diverging* scale, not a sequential one: colour encodes how far a municipality sits
 * from the whole-country rate, in percentage points, with a neutral grey at the national
 * figure. Green reads below-average, red above-average.
 *
 * This replaced a green→red sequential ramp whose middle classes were muddy olive/brown —
 * the unavoidable cost of dragging one hue across to another while keeping lightness
 * monotone. Anchoring on the national rate removes that middle entirely (the midpoint is
 * genuinely neutral) and makes the colour answer a sharper question: better or worse than
 * Finland?
 *
 * Each coloured arm is its own single-hue ramp, light (near the midpoint) to dark (at the
 * extreme), so magnitude survives when hue collapses under red-green colour blindness. Both
 * arms pass the `dataviz` skill's `validate_palette.js --ordinal` on all four checks
 * (monotone lightness, adjacent gaps, light-end contrast against the map sheet, single
 * hue). If you re-pick these, re-run that — don't eyeball it.
 *
 * Bands are chosen against the real distribution (304 municipalities with a rate, national
 * 12.8 %): roughly 78 / 84 / 45 / 46 / 22 / 20 / 9 across the seven classes.
 */
/**
 * The site's diverging pair, shared by both interactive maps so green and red mean one thing
 * across the whole site: green is the good/growing direction, red the bad/shrinking one, with
 * a neutral grey between them. Each arm runs light (nearest the midpoint) to dark (at the
 * extreme). `ink` is the text colour for a chip filled with that class — whichever of white
 * or map ink measures better against that exact colour, rather than a rule of thumb that
 * leaves the light classes at ~2:1.
 */
export const DIVERGING_SCALE = {
	neutral: { color: '#c5cbd2', ink: 'var(--map-ink)' },
	/** Light to dark. */
	green: [
		{ color: '#90b697', ink: 'var(--map-ink)' },
		{ color: '#5a8f65', ink: 'var(--map-ink)' },
		{ color: '#1d6835', ink: '#ffffff' }
	],
	/** Light to dark. */
	red: [
		{ color: '#de958e', ink: 'var(--map-ink)' },
		{ color: '#bd615b', ink: '#ffffff' },
		{ color: '#9a2929', ink: '#ffffff' }
	]
} as const;

export const DEVIATION_CLASSES = [
	{ min: -Infinity, label: 'far below', ...DIVERGING_SCALE.green[2] },
	{ min: -4, label: 'below', ...DIVERGING_SCALE.green[1] },
	{ min: -2, label: 'a little below', ...DIVERGING_SCALE.green[0] },
	{ min: -0.75, label: 'about average', ...DIVERGING_SCALE.neutral },
	{ min: 0.75, label: 'a little above', ...DIVERGING_SCALE.red[0] },
	{ min: 2, label: 'above', ...DIVERGING_SCALE.red[1] },
	{ min: 4, label: 'far above', ...DIVERGING_SCALE.red[2] }
] as const;

/** Index of the neutral, "about the national rate" class. */
const NEUTRAL_CLASS = 3;

/**
 * Municipalities with no published rate are hatched rather than given another grey — a
 * fourth flat grey next to the neutral midpoint would read as a data class. `NO_DATA_COLOR`
 * is the hatch's backing fill; the stripes are drawn by the `no-data` SVG pattern.
 */
export const NO_DATA_COLOR = '#f0f1ef';

/** The sheet the map sits on. The light ends of both arms are contrast-checked against it. */
export const MAP_SURFACE = '#f5f7f9';

/**
 * @param rate The municipality's rate.
 * @param reference The whole-country rate the scale diverges around. Kept at the *national*
 *   figure even on the regional view, so a municipality never changes colour when the region
 *   toggle flips and the two views stay directly comparable.
 */
export function colorFor(rate: number | null, reference: number | null): string {
	if (rate === null) return NO_DATA_COLOR;
	if (reference === null) return DEVIATION_CLASSES[NEUTRAL_CLASS].color;

	const deviation = rate - reference;
	let color: string = DEVIATION_CLASSES[0].color;

	for (const bucket of DEVIATION_CLASSES) {
		if (deviation >= bucket.min) color = bucket.color;
	}

	return color;
}
