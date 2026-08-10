/**
 * Reads the Tilastokeskus municipal population export (PxWeb table 121w, "Väestönmuutokset"
 * by year) and pulls out the year-end population plus the flows behind it, keyed by the same
 * `natcode` the map GeoJSON carries.
 *
 * **Annual, not monthly, on purpose.** The monthly table (12as) carries exactly the same
 * väkiluku for December — so the map is identical either way — but its flows are one month's,
 * and a single month of births/deaths/moves in a small municipality is 0 or ±1: noise, and
 * seasonally skewed on top (student moves land in August–September). The annual figures are
 * what actually say something, including the country's own headline: natural change −13 377
 * against net migration +31 233, so Finland shrank naturally and still grew.
 *
 * Two things differ from the unemployment export this sits beside:
 *
 * - **The mapped measure isn't in the file.** Density is population ÷ land area, and the
 *   land area lives in the geometry (`landarea`, km², the official maa-pinta-ala), not in
 *   any PxWeb column — so it's joined in by the loader, not parsed here.
 * - **There are no region rows.** The file is exactly the whole country (`SSS`) plus the
 *   308 municipalities, so unlike 12r5 there is no `MK` level to read for the Region tab —
 *   every regional figure is rolled up from municipalities (see `membership.ts`).
 *
 * The population figure is a stock (headcount at the end of the period); everything else
 * here is a flow *during* that period, which is why the panel labels them with it.
 */

// `NO_DATA_COLOR` is shared with the unemployment map so both sit on the same sheet and
// hatch absences the same way — the two maps differ in what they encode, not in what a
// missing figure looks like.
import { DIVERGING_SCALE, NO_DATA_COLOR, type PxWebExport } from './unemployment';

export type PopulationStats = {
	/** Väkiluku at the end of the period. */
	population: number | null;
	births: number | null;
	deaths: number | null;
	/** Births minus deaths. Negative in most of Finland. */
	naturalChange: number | null;
	/** Net of all moves in and out, between municipalities and across the border alike. */
	netMigration: number | null;
	/** Natural change plus net migration plus corrections — the period's bottom line. */
	totalChange: number | null;
};

export const EMPTY_POPULATION_STATS: PopulationStats = {
	population: null,
	births: null,
	deaths: null,
	naturalChange: null,
	netMigration: null,
	totalChange: null
};

export type PopulationData = {
	/** natcode -> figures, for whichever area level was requested. */
	stats: Map<string, PopulationStats>;
	/** Whole-country figures (the `SSS` row). */
	national: PopulationStats;
	/** Statistics period — "2025" from the annual table, "2025M12" from the monthly one. */
	period: string;
	source: string;
};

const WHOLE_COUNTRY = 'SSS';

/**
 * Matched on the part *after* the prefix: these statistics are published as a family of
 * tables that share column names but not their prefix — the annual table (121w) calls the
 * population column `ssaaty-vaesto`, the monthly one (12as) `kuol-vaesto`. Keying off the
 * suffix means dropping in either file, or a future sibling, needs no code change.
 */
const COLUMNS = {
	population: 'vaesto',
	births: 'vm01',
	deaths: 'vm11',
	naturalChange: 'luonvalisays',
	netMigration: 'koknetmuutto',
	totalChange: 'kokmuutos'
} as const;

function suffixOf(code: string): string {
	return code.slice(code.lastIndexOf('-') + 1);
}

/**
 * Same PxWeb quirk as the unemployment export: a row's `values` array holds only the
 * content columns, so an index has to be resolved against that filtered list.
 */
function columnIndexes(columns: PxWebExport['columns']): Record<keyof PopulationStats, number> {
	const content = columns.filter((c) => c.type === 'c');
	const indexes = {} as Record<keyof PopulationStats, number>;

	for (const [field, suffix] of Object.entries(COLUMNS) as [keyof PopulationStats, string][]) {
		const index = content.findIndex((c) => suffixOf(c.code) === suffix);

		if (index === -1) throw new Error(`Missing *-${suffix} column in population export`);

		indexes[field] = index;
	}

	return indexes;
}

/**
 * The two tables also disagree on key order — 12as is `[area, month]`, 121w is `[year, area]`
 * — so the area is identified by shape rather than by position: it's the one that names an
 * area level, and whatever is left is the period.
 */
function splitKey(key: string[]): { area: string; period: string } {
	const area = key.find((k) => k === WHOLE_COUNTRY || /^(KU|MK|SK|ELY)/.test(k)) ?? '';

	return { area, period: key.find((k) => k !== area) ?? '' };
}

/** Suppressed/unavailable figures come through as "..." or an empty string. */
function parseCount(raw: string | undefined): number | null {
	if (!raw) return null;

	const value = Number(raw);

	return Number.isFinite(value) ? value : null;
}

export function toPopulationData(px: PxWebExport): PopulationData {
	const indexes = columnIndexes(px.columns);
	const stats = new Map<string, PopulationStats>();
	let national = EMPTY_POPULATION_STATS;
	let period = '';

	for (const row of px.data) {
		const { area, period: rowPeriod } = splitKey(row.key);
		const figures = Object.fromEntries(
			(Object.keys(COLUMNS) as (keyof PopulationStats)[]).map((field) => [
				field,
				parseCount(row.values[indexes[field]])
			])
		) as PopulationStats;

		if (rowPeriod) period = rowPeriod;

		if (area === WHOLE_COUNTRY) {
			national = figures;
			continue;
		}

		// This export carries only KU rows besides SSS, but the guard keeps it honest if a
		// future download includes more area levels.
		if (!area.startsWith('KU')) continue;

		const natcode = area.slice(2);

		if (!/^\d+$/.test(natcode)) continue;

		stats.set(natcode, figures);
	}

	return {
		stats,
		national,
		period,
		source: px.metadata?.[0]?.source ?? 'Tilastokeskus'
	};
}

/**
 * Rolls a set of municipalities up into one area. Every field here is a plain count —
 * a headcount or a period's flow — so unlike the unemployment aggregate there is no rate to
 * recompute: summing is the whole job. Density is *not* summed; it's recomputed from the
 * summed population and the summed land area (see `loadPopulationViews`).
 */
export function aggregatePopulationStats(list: PopulationStats[]): PopulationStats {
	const sum = (field: keyof PopulationStats): number | null => {
		const known = list.map((s) => s[field]).filter((v): v is number => v !== null);

		return known.length ? known.reduce((a, b) => a + b, 0) : null;
	};

	return Object.fromEntries(
		(Object.keys(EMPTY_POPULATION_STATS) as (keyof PopulationStats)[]).map((field) => [
			field,
			sum(field)
		])
	) as PopulationStats;
}

/** Inhabitants per km² of land. Null when either input is missing. */
export function densityOf(population: number | null, landArea: number | null): number | null {
	if (population === null || landArea === null || landArea <= 0) return null;

	return population / landArea;
}

/**
 * The mapped measure: last year's change as a rate per 1 000 inhabitants.
 *
 * *Relative*, not the raw headcount, because a choropleth colours areas of wildly different
 * size — mapping absolute change would light up the five largest cities and leave 300
 * municipalities indistinguishable near zero, re-encoding population rather than change.
 * Per 1 000 puts Kökar's −16 people (−75,8) and Helsinki's +10 374 (+14,9) on one scale.
 *
 * The denominator is the end-of-period population the export publishes, not the mean of the
 * year's start and end — the difference is a fraction of a per-mille at these rates, and it
 * keeps the figure reproducible from two columns of one file.
 */
export function changePer1000(
	totalChange: number | null,
	population: number | null
): number | null {
	if (totalChange === null || population === null || population <= 0) return null;

	return (totalChange / population) * 1000;
}

/**
 * A *diverging* scale anchored at zero, because that's the question the map is asked: which
 * areas are growing and which are shrinking? Zero is a real midpoint here (unlike density,
 * which this map used to show and which has none).
 *
 * It uses `DIVERGING_SCALE` — the same green/grey/red the unemployment map uses — on purpose:
 * one colour vocabulary across the site, where red is the direction you'd rather not be going
 * in. Each arm is a single-hue ramp running light (at the midpoint) to dark (at the extreme),
 * so magnitude survives where hue collapses under red-green colour blindness; both pass all
 * four checks of the `dataviz` skill's `validate_palette.js --ordinal` against `MAP_SURFACE`.
 * Note that validator's *categorical* mode fails on any ramp by design — neighbours within an
 * arm sit close on purpose; use `--ordinal`, per arm.
 *
 * Band edges (±2 / ±7 / ±15 per 1 000) come from the real distribution, giving roughly
 * 69/91/53/23/42/23/7 municipalities per class. 227 of 308 municipalities shrank in 2025, so
 * the map leans red — that is the finding, not a scaling artefact.
 */
export const CHANGE_CLASSES = [
	{ min: -Infinity, label: 'shrinking fast', ...DIVERGING_SCALE.red[2] },
	{ min: -15, label: 'shrinking', ...DIVERGING_SCALE.red[1] },
	{ min: -7, label: 'shrinking slowly', ...DIVERGING_SCALE.red[0] },
	{ min: -2, label: 'about flat', ...DIVERGING_SCALE.neutral },
	{ min: 2, label: 'growing slowly', ...DIVERGING_SCALE.green[0] },
	{ min: 7, label: 'growing', ...DIVERGING_SCALE.green[1] },
	{ min: 15, label: 'growing fast', ...DIVERGING_SCALE.green[2] }
] as const;

/** Index of the neutral, "neither growing nor shrinking" class. */
const FLAT_CLASS = 3;

/** Index of the class a value falls in — null areas take the neutral one. */
function changeClassIndex(change: number | null): number {
	return change === null ? FLAT_CLASS : CHANGE_CLASSES.findLastIndex((c) => change >= c.min);
}

export function changeColorFor(change: number | null): string {
	return change === null ? NO_DATA_COLOR : CHANGE_CLASSES[changeClassIndex(change)].color;
}

/** "shrinking fast", "growing slowly" — the words the chip puts on the colour. */
export function changeLabelFor(change: number | null): string {
	return change === null ? 'no data' : CHANGE_CLASSES[changeClassIndex(change)].label;
}

/**
 * Text colour for a chip filled with an area's class colour. Carried by the palette itself
 * (see `DIVERGING_SCALE`) rather than derived from a threshold here, because which of white
 * or map ink wins is a property of each colour, measured: the tightest class lands at 4,1:1
 * and the rest clear 4,2:1.
 */
export function inkOnChange(change: number | null): string {
	return CHANGE_CLASSES[changeClassIndex(change)].ink;
}
