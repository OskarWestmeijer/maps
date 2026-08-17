/**
 * Reads the Tilastokeskus population key-figures export (PxWeb table 11ra, "Tunnuslukuja
 * väestöstä alueittain") and pulls the age structure per area, keyed by the same national code
 * (`natcode`) the map GeoJSON carries.
 *
 * The mapped measure is `vaesto_keski_ika`, the mean age of everyone living in the area on 31
 * December. Register data — it's the population register counted, not a survey.
 *
 * That table carries 43 measures across sixteen area levels; the fetch script narrows it to four
 * columns, and the numeric-code filter here drops every level but the two the maps draw (`KU`,
 * `MK`). See `scripts/fetch_statfi.py`.
 */

import { DIVERGING_SCALE, NO_DATA_COLOR, parseFigure, type PxWebExport } from './unemployment';

export type AgeStats = {
	/** Mean age of the population, in years — the mapped measure. */
	averageAge: number | null;
	/** Share of the population under 15. Percent. */
	underFifteen: number | null;
	/** Share of the population aged 65 and over. Percent. */
	overSixtyFour: number | null;
	/** Population at 31.12 — the weight a roll-up needs, not shown in the panel. */
	population: number | null;
};

/** Every field null — merged into areas the export has no row for. */
export const EMPTY_AGE_STATS: AgeStats = {
	averageAge: null,
	underFifteen: null,
	overSixtyFour: null,
	population: null
};

export type AgeData = {
	/** natcode -> figures. Individual fields are null where the source suppresses them. */
	stats: Map<string, AgeStats>;
	/** Whole-country figures (the `SSS` row), for context before anything is hovered. */
	national: AgeStats;
	/** Statistics period, e.g. "2025". */
	period: string;
	source: string;
};

const WHOLE_COUNTRY = 'SSS';

/**
 * Keyed by the part of the column code after the last "-", the convention the other annual
 * parsers share. This export mixes the two forms once more: `vaerak-vaesto` carries the prefix
 * while `vaesto_keski_ika` doesn't, and a code with no "-" is its own suffix.
 */
const COLUMNS = {
	averageAge: 'vaesto_keski_ika',
	underFifteen: 'vaesto_alle15_p',
	overSixtyFour: 'vaesto_yli64_p',
	population: 'vaesto'
} as const;

function suffixOf(code: string): string {
	return code.slice(code.lastIndexOf('-') + 1);
}

/**
 * Same PxWeb quirk as the other exports: a row's `values` array holds only the content columns,
 * so an index has to be resolved against that filtered list, not `columns`.
 */
function columnIndexes(columns: PxWebExport['columns']): Record<keyof AgeStats, number> {
	const content = columns.filter((c) => c.type === 'c');
	const indexes = {} as Record<keyof AgeStats, number>;

	for (const [field, suffix] of Object.entries(COLUMNS) as [keyof AgeStats, string][]) {
		const index = content.findIndex((c) => suffixOf(c.code) === suffix);

		if (index === -1) throw new Error(`Missing *-${suffix} column in age export`);

		indexes[field] = index;
	}

	return indexes;
}

/** The area is identified by shape rather than by position, as in the sibling parsers. */
function splitKey(key: string[]): { area: string; period: string } {
	const area = key.find((k) => k === WHOLE_COUNTRY || /^[A-Z]{2}/.test(k)) ?? '';

	return { area, period: key.find((k) => k !== area) ?? '' };
}

/**
 * @param areaPrefix Which rows to key `stats` by: `'KU'` for the 308 municipalities (the
 *   default), or `'MK'` for the 19 region rows the same export carries. Either way `national`
 *   comes from the single whole-country `SSS` row.
 */
export function toAgeData(px: PxWebExport, areaPrefix: 'KU' | 'MK' = 'KU'): AgeData {
	const indexes = columnIndexes(px.columns);
	const stats = new Map<string, AgeStats>();
	let national = EMPTY_AGE_STATS;
	let period = '';

	for (const row of px.data) {
		const { area, period: rowPeriod } = splitKey(row.key);
		const figures = Object.fromEntries(
			(Object.keys(COLUMNS) as (keyof AgeStats)[]).map((field) => [
				field,
				parseFigure(row.values[indexes[field]])
			])
		) as AgeStats;

		if (rowPeriod) period = rowPeriod;

		if (area === WHOLE_COUNTRY) {
			national = figures;
			continue;
		}

		// This export is the site's busiest for area levels — sixteen of them, from seutukunnat
		// and ELY centres to hospital districts and electoral districts. Only the requested
		// prefix followed by a numeric code lines up with the map being drawn.
		if (!area.startsWith(areaPrefix)) continue;

		const natcode = area.slice(areaPrefix.length);

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
 * Rolls a set of areas up into one, for the Tampere Metro tab.
 *
 * A mean *is* combinable, unlike the income map's median, but only when weighted: the mean age of
 * eight municipalities is the sum of every resident's age over the number of residents, which is
 * `Σ(age × population) / Σ(population)`. Averaging the eight means unweighted would give Vesilahti
 * (3 500 people) the same say as Tampere (250 000). The two shares are weighted the same way, for
 * the same reason.
 *
 * That is exact rather than approximate — no information is lost the way it is with a median —
 * which is why this tab gets a real headline. The population it weights by is carried on
 * `AgeStats` purely for this.
 */
export function aggregateAgeStats(list: AgeStats[]): AgeStats {
	const population = list.reduce((sum, s) => sum + (s.population ?? 0), 0) || null;

	// Strict: a member with figures but no population weight, or vice versa, would silently drop
	// out of the average rather than being visible as missing.
	const weightedMean = (field: 'averageAge' | 'underFifteen' | 'overSixtyFour') => {
		if (population === null) return null;
		if (list.some((s) => s[field] === null || s.population === null)) return null;

		return (
			list.reduce((sum, s) => sum + (s[field] as number) * (s.population as number), 0) / population
		);
	};

	return {
		averageAge: weightedMean('averageAge'),
		underFifteen: weightedMean('underFifteen'),
		overSixtyFour: weightedMean('overSixtyFour'),
		population
	};
}

/** The median of the municipal figures — what the scale pivots on. See `AGE_CLASSES`. */
export function medianAge(values: (number | null)[]): number | null {
	const known = values.filter((v): v is number => v !== null).sort((a, b) => a - b);

	if (!known.length) return null;

	const middle = known.length / 2;

	return known.length % 2 ? known[Math.floor(middle)] : (known[middle - 1] + known[middle]) / 2;
}

/** How far an area sits from the median municipality, in years. */
export function ageDeviation(age: number | null, reference: number | null): number | null {
	if (age === null || reference === null) return null;

	return age - reference;
}

/**
 * A *diverging* scale with the arms the same way up as the unemployment map's — **green is young,
 * red is old**, because a lower average age is treated as the better direction here, the same
 * judgement the compare map's `higherIsBetter: false` makes.
 *
 * It pivots on the **median municipality** (48,6 years), not the national mean (44,1), for exactly
 * the reason the education map does — mirrored. The national figure counts people, and young
 * people live in cities, so only 58 of the 308 municipalities are below it; pivoting there would
 * paint the country red and say nothing. Half the municipalities are above 48,6 and half below.
 *
 * Band edges (∓1 / ∓3 / ∓6 years) come from the real 2025 distribution, giving 34/48/42/51/45/52/36
 * per class — the most even spread of any map on the site, because age varies smoothly across
 * Finland where money and degrees do not. Luoto is youngest at 34,1 and Rääkkylä oldest at 59,5.
 */
export const AGE_CLASSES = [
	{ min: -Infinity, ...DIVERGING_SCALE.green[2] },
	{ min: -6, ...DIVERGING_SCALE.green[1] },
	{ min: -3, ...DIVERGING_SCALE.green[0] },
	{ min: -1, ...DIVERGING_SCALE.neutral },
	{ min: 1, ...DIVERGING_SCALE.red[0] },
	{ min: 3, ...DIVERGING_SCALE.red[1] },
	{ min: 6, ...DIVERGING_SCALE.red[2] }
] as const;

/** Index of the neutral, "about as typical as it gets" class. */
const NEUTRAL_CLASS = 3;

function ageClassIndex(deviation: number | null): number {
	return deviation === null ? NEUTRAL_CLASS : AGE_CLASSES.findLastIndex((c) => deviation >= c.min);
}

/**
 * @param age The area's mean age.
 * @param reference The median municipality's mean age, which the scale diverges around — the same
 *   figure on every tab, so an area never changes colour when the tab flips.
 */
export function ageColorFor(age: number | null, reference: number | null): string {
	if (age === null) return NO_DATA_COLOR;

	return AGE_CLASSES[ageClassIndex(ageDeviation(age, reference))].color;
}

/** Text colour for a chip filled with an area's class colour, carried by the palette itself. */
export function inkOnAge(age: number | null, reference: number | null): string {
	return AGE_CLASSES[ageClassIndex(ageDeviation(age, reference))].ink;
}
