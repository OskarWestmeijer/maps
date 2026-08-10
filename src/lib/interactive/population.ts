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
import { NO_DATA_COLOR, type PxWebExport } from './unemployment';

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

/**
 * Density is *sequential*, not diverging like the unemployment map: there is no meaningful
 * midpoint to sit either side of — more people per km² is simply more — so it takes a
 * single-hue ramp running light to dark, which is what encodes magnitude when hue is held
 * constant (and what survives colour blindness).
 *
 * The classes are roughly logarithmic because the data is: Finland's municipalities run from
 * 0,15/km² (Savukoski) to 3 236/km² (Helsinki), four orders of magnitude, and equal-width
 * classes would put ~305 of 308 municipalities in the lightest one. These breaks give
 * roughly 30/59/65/77/50/17/10 municipalities per class.
 *
 * The ramp passes all four checks of the `dataviz` skill's `validate_palette.js --ordinal`
 * against `MAP_SURFACE` (monotone lightness, adjacent ΔL ≥ 0.06, light end 2,20:1 against
 * the sheet, one hue). Re-run that if you re-pick the colours; don't eyeball it.
 */
export const DENSITY_CLASSES = [
	{ min: 0, label: 'under 2', color: '#b4a0d2' },
	{ min: 2, label: '2–5', color: '#a387cd' },
	{ min: 5, label: '5–10', color: '#916ec7' },
	{ min: 10, label: '10–25', color: '#8055be' },
	{ min: 25, label: '25–100', color: '#6d3fae' },
	{ min: 100, label: '100–500', color: '#583093' },
	{ min: 500, label: '500 and over', color: '#41266e' }
] as const;

/** Inhabitants per km² of land. Null (hatched on the map) when either input is missing. */
export function densityOf(population: number | null, landArea: number | null): number | null {
	if (population === null || landArea === null || landArea <= 0) return null;

	return population / landArea;
}

/**
 * Ink for text sitting on a class colour — white on the dark half of the ramp, the map's
 * dark ink on the light half, whichever contrasts better against that exact fill. The worst
 * case is the middle class at 3,9:1; every other class clears 5:1.
 */
export function inkOnDensity(density: number | null): string {
	const index = DENSITY_CLASSES.findLastIndex((c) => density !== null && density >= c.min);

	return index >= 2 ? '#ffffff' : 'var(--map-ink)';
}

export function densityColorFor(density: number | null): string {
	if (density === null) return NO_DATA_COLOR;

	let color: string = DENSITY_CLASSES[0].color;

	for (const bucket of DENSITY_CLASSES) {
		if (density >= bucket.min) color = bucket.color;
	}

	return color;
}
