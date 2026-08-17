/**
 * Reads the Tilastokeskus population export (PxWeb table 11re, "Väestö 31.12. iän ja sukupuolen
 * mukaan alueittain") and pulls the men/women split per area, keyed by the same national code
 * (`natcode`) the map GeoJSON carries.
 *
 * The mapped measure is **gender balance**: how far the area is from an even split, in percentage
 * points (`|womenShare - 50|`). The share itself is what the panel leads with and what the balance
 * is derived from. Register data, and a plain count of people — the age dimension is eliminated in the query (see
 * `scripts/fetch_statfi.py`), so what arrives is one row per area per sex.
 *
 * Two things here are unlike every other parser on the site, and both come from that shape:
 *
 * 1. **A row is not an area.** Each area has three rows — total, men, women — so the figures have
 *    to be pivoted rather than read off one row. `SEX_CODES` names them.
 * 2. **The area cannot be identified by the shape of its key.** Every other export's key has
 *    exactly one element that looks like an area code, so the parsers find it by pattern. Here
 *    the whole-country row's key is `['SSS', 'SSS', '2025']` — the area is `SSS` and so is the
 *    sex. `dimensions()` therefore resolves the two positions from `columns` instead, telling
 *    them apart by the values they actually take.
 */

import { DIVERGING_SCALE, NO_DATA_COLOR, parseFigure, type PxWebExport } from './unemployment';

export type BalanceStats = {
	/** Share of the population who are women, in percent — the mapped measure. */
	womenShare: number | null;
	women: number | null;
	men: number | null;
	population: number | null;
};

/** Every field null — merged into areas the export has no row for. */
export const EMPTY_BALANCE_STATS: BalanceStats = {
	womenShare: null,
	women: null,
	men: null,
	population: null
};

export type BalanceData = {
	/** natcode -> figures. */
	stats: Map<string, BalanceStats>;
	/** Whole-country figures, for context before anything is hovered. */
	national: BalanceStats;
	/** Statistics period, e.g. "2025". */
	period: string;
	source: string;
};

const WHOLE_COUNTRY = 'SSS';

/** The three values the sex dimension takes. `SSS` is both sexes together. */
const SEX_CODES = { total: 'SSS', men: '1', women: '2' } as const;

/**
 * Which position in a row's `key` holds the area and which the sex.
 *
 * Resolved from the data rather than hardcoded: the dimension whose values are only ever `SSS`,
 * `1` or `2` is the sex one, and the remaining non-time dimension is the area. Key *order* is a
 * per-table detail this statistics family has already changed once, and the dated variable code
 * (`alue_23_20260101`) is not something to match on either.
 */
function dimensions(px: PxWebExport): { area: number; sex: number } {
	// `key` holds one element per dimension column, in the order `columns` lists them.
	const keyed = px.columns.filter((c) => c.type === 'd' || c.type === 't');
	const timeless = keyed
		.map((column, index) => ({ column, index }))
		.filter(({ column }) => column.type !== 't');

	const isSexValue = (value: string) => (Object.values(SEX_CODES) as string[]).includes(value);
	const sex = timeless.find(({ index }) => px.data.every((row) => isSexValue(row.key[index])));

	if (!sex) throw new Error('No sex dimension in the population export');

	const area = timeless.find(({ index }) => index !== sex.index);

	if (!area) throw new Error('No area dimension in the population export');

	return { area: area.index, sex: sex.index };
}

/** The period is whichever key element belongs to the column flagged as time. */
function periodIndex(px: PxWebExport): number {
	return px.columns
		.filter((c) => c.type === 'd' || c.type === 't')
		.findIndex((c) => c.type === 't');
}

export function toBalanceData(px: PxWebExport, areaPrefix: 'KU' = 'KU'): BalanceData {
	const { area: areaAt, sex: sexAt } = dimensions(px);
	const periodAt = periodIndex(px);
	const value = px.columns.filter((c) => c.type === 'c').length ? 0 : -1;

	if (value === -1) throw new Error('No content column in the population export');

	// area code -> the three figures, gathered as the rows arrive in whatever order they come.
	const gathered = new Map<
		string,
		{ total?: number | null; men?: number | null; women?: number | null }
	>();
	let period = '';

	for (const row of px.data) {
		const area = row.key[areaAt];
		const sex = row.key[sexAt];
		const figure = parseFigure(row.values[value]);

		if (periodAt !== -1 && row.key[periodAt]) period = row.key[periodAt];

		const entry = gathered.get(area) ?? {};

		if (sex === SEX_CODES.total) entry.total = figure;
		else if (sex === SEX_CODES.men) entry.men = figure;
		else if (sex === SEX_CODES.women) entry.women = figure;

		gathered.set(area, entry);
	}

	const statsOf = (entry: {
		total?: number | null;
		men?: number | null;
		women?: number | null;
	}) => {
		// The total is published, but deriving it from the two parts costs nothing and keeps the
		// share consistent with the counts the panel shows beside it.
		const population = entry.total ?? sum(entry.men, entry.women);

		return {
			womenShare: shareOf(entry.women ?? null, population),
			women: entry.women ?? null,
			men: entry.men ?? null,
			population
		} satisfies BalanceStats;
	};

	const stats = new Map<string, BalanceStats>();
	let national = EMPTY_BALANCE_STATS;

	for (const [area, entry] of gathered) {
		if (area === WHOLE_COUNTRY) {
			national = statsOf(entry);
			continue;
		}

		if (!area.startsWith(areaPrefix)) continue;

		const natcode = area.slice(areaPrefix.length);

		if (!/^\d+$/.test(natcode)) continue;

		stats.set(natcode, statsOf(entry));
	}

	return {
		stats,
		national,
		period,
		source: px.metadata?.[0]?.source ?? 'Tilastokeskus'
	};
}

function sum(a: number | null | undefined, b: number | null | undefined): number | null {
	return a === null || a === undefined || b === null || b === undefined ? null : a + b;
}

/** One count as a percentage of another. Null when either is missing or the base is empty. */
export function shareOf(part: number | null, whole: number | null): number | null {
	if (part === null || whole === null || whole <= 0) return null;

	return (part / whole) * 100;
}

/**
 * Rolls a set of areas up into one — for the Region tab as well as Tampere Metro, because 11re
 * publishes no `MK` rows at all (309 areas: the whole country and the 308 municipalities). Both
 * are summed from municipalities the way the population map does it.
 *
 * Counts sum, and the share is recomputed from the sums rather than averaged across members —
 * Helsinki's 52,2 % and Sottunga's 42,6 % describe 694 000 and 101 people respectively.
 */
export function aggregateBalanceStats(list: BalanceStats[]): BalanceStats {
	const total = (field: 'women' | 'men' | 'population') => {
		const known = list.map((s) => s[field]).filter((v): v is number => v !== null);

		return known.length ? known.reduce((a, b) => a + b, 0) : null;
	};

	const women = total('women');
	const population = total('population');

	return { womenShare: shareOf(women, population), women, men: total('men'), population };
}

/** Percentage points away from an even split. Positive means more women, negative more men. */
export function sexDeviation(share: number | null): number | null {
	return share === null ? null : share - 50;
}

/**
 * How far from an even split, regardless of which way — the mapped measure.
 *
 * The direction is deliberately thrown away here and carried by the panel instead. A choropleth
 * has one colour axis, and the question this map answers is "how lopsided", not "which sex": the
 * share and the two counts in the panel say which way, and the map says how far.
 */
export function imbalance(share: number | null): number | null {
	const deviation = sexDeviation(share);

	return deviation === null ? null : Math.abs(deviation);
}

/**
 * The site's shared green/red, run over a single magnitude the way `SCORE_CLASSES` is: **green is
 * balanced, red is lopsided**, with no midpoint to diverge around because the measure has no sign.
 *
 * This replaced a two-hue purple/orange scale that encoded *which* sex outnumbered the other. That
 * version was neutral about direction on purpose, and it was rejected in review as hard to read —
 * two arbitrary hues, unguessable without the legend the site doesn't have. Balance is the thing
 * with a better and a worse end, so it gets the colours that already mean better and worse
 * everywhere else on the site, and the panel keeps the direction in words and figures.
 *
 * Band edges (0,3 / 0,7 / 1,2 / 1,8 / 2,8 / 4 points) come from the real 2025 distribution, giving
 * 65/68/56/60/32/20/7 municipalities per class. They tighten towards the good end because that is
 * where the country is: the median municipality is 0,9 points off parity and Finland as a whole
 * 0,5, while the tail runs out to Sottunga's 7,4. Pihtipudas and Mäntsälä are exactly even.
 */
export const BALANCE_CLASSES = [
	{ min: -Infinity, label: 'very even', ...DIVERGING_SCALE.green[2] },
	{ min: 0.3, label: 'even', ...DIVERGING_SCALE.green[1] },
	{ min: 0.7, label: 'fairly even', ...DIVERGING_SCALE.green[0] },
	{ min: 1.2, label: 'a little lopsided', ...DIVERGING_SCALE.neutral },
	{ min: 1.8, label: 'lopsided', ...DIVERGING_SCALE.red[0] },
	{ min: 2.8, label: 'very lopsided', ...DIVERGING_SCALE.red[1] },
	{ min: 4, label: 'extremely lopsided', ...DIVERGING_SCALE.red[2] }
] as const;

function balanceClassIndex(gap: number | null): number {
	return gap === null ? 0 : BALANCE_CLASSES.findLastIndex((c) => gap >= c.min);
}

/**
 * The area's fill, from its share of women. No reference parameter: the scale is anchored on an
 * even split, which is a constant, so nothing has to be carried across tabs to keep colours stable.
 */
export function balanceColorFor(share: number | null): string {
	return share === null
		? NO_DATA_COLOR
		: BALANCE_CLASSES[balanceClassIndex(imbalance(share))].color;
}

/** Text colour for a chip filled with an area's class colour, carried by the palette itself. */
export function inkOnBalance(share: number | null): string {
	return BALANCE_CLASSES[balanceClassIndex(imbalance(share))].ink;
}
