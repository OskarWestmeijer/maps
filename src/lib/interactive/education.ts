/**
 * Reads the Tilastokeskus education export (PxWeb table 12bs, "15 vuotta täyttänyt väestö
 * koulutusasteen, maakunnan, kunnan, sukupuolen ja ikäryhmän mukaan") and pulls one set of
 * attainment figures per area, keyed by the same national code (`natcode`) the map GeoJSON
 * carries.
 *
 * Register data, from väestön koulutusrakenne: every degree awarded in Finland since 1970 sits in
 * the tutkintorekisteri, so this is a count rather than an estimate. The one thing it cannot see
 * is a qualification taken abroad by someone who never registered it here, which is why the
 * "no post-basic qualification" share runs a little high in municipalities with many immigrants.
 *
 * Like 12r5 and 14ww, this export bundles several area levels in one file, so `toEducationData`'s
 * `areaPrefix` picks which one to key `stats` by and the Region tab reads Statistics Finland's own
 * published `MK` rows. It carries two levels the others don't — `MA1`/`MA2`, mainland Finland and
 * Åland — which the numeric-code filter drops without needing a case of their own.
 */

import { DIVERGING_SCALE, NO_DATA_COLOR, parseFigure, type PxWebExport } from './unemployment';

export type EducationStats = {
	/** Share of the 15+ population holding a tertiary degree — the mapped measure. Percent. */
	tertiaryShare: number | null;
	/** Share with no qualification beyond comprehensive school. Percent. */
	noPostBasicShare: number | null;
	/** Share whose highest qualification is upper secondary. Percent. */
	secondLevelShare: number | null;
	/** Väestön koulutustasomittain: the 20+ population's average education level as an index.
	 *  Roughly the mean years of schooling beyond comprehensive, x 100. */
	levelIndex: number | null;
	/** The three counts behind the three shares, plus their denominator. Carried because a share
	 *  is only exactly aggregable through its numerator — see `aggregateEducationStats`. */
	tertiary: number | null;
	noPostBasic: number | null;
	secondLevel: number | null;
	/** Population aged 15 and over at 31.12 — the denominator, and the roll-up weight. */
	population15: number | null;
};

/** Every field null — merged into areas the export has no row for. */
export const EMPTY_EDUCATION_STATS: EducationStats = {
	tertiaryShare: null,
	noPostBasicShare: null,
	secondLevelShare: null,
	levelIndex: null,
	tertiary: null,
	noPostBasic: null,
	secondLevel: null,
	population15: null
};

export type EducationData = {
	/** natcode -> figures. Individual fields are null where the source suppresses them. */
	stats: Map<string, EducationStats>;
	/** Whole-country figures (the `SSS` row), for context before anything is hovered. */
	national: EducationStats;
	/** Statistics period, e.g. "2025". */
	period: string;
	source: string;
};

const WHOLE_COUNTRY = 'SSS';

/**
 * Keyed by the part of the column code after the last "-", the convention `population.ts` and
 * `income.ts` share. This export's codes carry no prefix at all today, and a code with no "-" is
 * simply its own suffix — so the rule costs nothing here and means a later `vkour-` prefix (the
 * population family already has two) wouldn't empty the map.
 */
const COLUMNS = {
	tertiaryShare: 'kaste5T8osuus',
	noPostBasicShare: 'kaste0osuus',
	secondLevelShare: 'kaste3osuus',
	levelIndex: 'vktm',
	tertiary: 'kaste5T8',
	noPostBasic: 'kaste0',
	secondLevel: 'kaste3',
	population15: 'vaesto_15_'
} as const;

function suffixOf(code: string): string {
	return code.slice(code.lastIndexOf('-') + 1);
}

/**
 * Same PxWeb quirk as the other exports: a row's `values` array holds only the content columns,
 * so an index has to be resolved against that filtered list, not `columns`.
 *
 * Matching is exact, which matters more here than anywhere else on the site: this table ships
 * fifteen measures whose codes are prefixes of one another (`kaste3` beside `kaste3T8` and
 * `kaste3osuus`, `kaste5` beside `kaste5T8`), so a `startsWith` would silently read a different
 * level of education than the one asked for.
 */
function columnIndexes(columns: PxWebExport['columns']): Record<keyof EducationStats, number> {
	const content = columns.filter((c) => c.type === 'c');
	const indexes = {} as Record<keyof EducationStats, number>;

	for (const [field, suffix] of Object.entries(COLUMNS) as [keyof EducationStats, string][]) {
		const index = content.findIndex((c) => suffixOf(c.code) === suffix);

		if (index === -1) throw new Error(`Missing *-${suffix} column in education export`);

		indexes[field] = index;
	}

	return indexes;
}

/**
 * The area is identified by shape rather than by position — 12bs keys are `[year, area]` where
 * 14ww's are `[area, year]`, and this family has already reordered them once.
 */
function splitKey(key: string[]): { area: string; period: string } {
	const area = key.find((k) => k === WHOLE_COUNTRY || /^(KU|MK|SK|ELY|MA)/.test(k)) ?? '';

	return { area, period: key.find((k) => k !== area) ?? '' };
}

/**
 * @param areaPrefix Which rows to key `stats` by: `'KU'` for the 308 municipalities (the
 *   default), or `'MK'` for the 19 region rows the same export carries. Either way `national`
 *   comes from the single whole-country `SSS` row.
 */
export function toEducationData(px: PxWebExport, areaPrefix: 'KU' | 'MK' = 'KU'): EducationData {
	const indexes = columnIndexes(px.columns);
	const stats = new Map<string, EducationStats>();
	let national = EMPTY_EDUCATION_STATS;
	let period = '';

	for (const row of px.data) {
		const { area, period: rowPeriod } = splitKey(row.key);
		const figures = Object.fromEntries(
			(Object.keys(COLUMNS) as (keyof EducationStats)[]).map((field) => [
				field,
				parseFigure(row.values[indexes[field]])
			])
		) as EducationStats;

		if (rowPeriod) period = rowPeriod;

		if (area === WHOLE_COUNTRY) {
			national = figures;
			continue;
		}

		// The other area levels ride along in the same file and are never rendered: `MK` rows when
		// the municipalities were asked for, and `MA1`/`MA2` (mainland Finland and Åland) on every
		// read. Only the requested prefix lines up with the map being drawn.
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
 * Rolls a set of areas up into one — and unlike `income.ts`, which deliberately has no such
 * function, this measure earns one.
 *
 * A share of a headcount is exactly aggregable: sum the degree-holders, sum the 15+ population,
 * divide, and the answer is the figure Statistics Finland would publish for that grouping. Summing
 * the 308 municipalities this way reproduces the published national share (34,51 against 34,5), so
 * the Tampere Metro tab gets a real headline rather than income's honest blank. The shares are
 * recomputed from the summed counts rather than averaged across members — municipalities differ by
 * three orders of magnitude in size, and an unweighted mean of eight shares is not one of them.
 *
 * `levelIndex` is the exception and stays null. It is an average over the **20+** population, and
 * the export ships only the 15+ headcount, so there is no exact weight to combine it with — a
 * near-enough weighting would look published and wouldn't be.
 */
export function aggregateEducationStats(list: EducationStats[]): EducationStats {
	// Strict on purpose: a suppressed member would silently understate the total, and here the
	// total is a numerator whose share would then read low rather than read as missing.
	const sum = (field: keyof EducationStats): number | null => {
		const values = list.map((s) => s[field]);

		return values.length && values.every((v) => v !== null)
			? (values as number[]).reduce((a, b) => a + b, 0)
			: null;
	};

	const population15 = sum('population15');
	const tertiary = sum('tertiary');
	const noPostBasic = sum('noPostBasic');
	const secondLevel = sum('secondLevel');

	return {
		tertiaryShare: shareOf(tertiary, population15),
		noPostBasicShare: shareOf(noPostBasic, population15),
		secondLevelShare: shareOf(secondLevel, population15),
		levelIndex: null,
		tertiary,
		noPostBasic,
		secondLevel,
		population15
	};
}

/** One count as a percentage of another. Null when either is missing or the base is empty. */
export function shareOf(part: number | null, whole: number | null): number | null {
	if (part === null || whole === null || whole <= 0) return null;

	return (part / whole) * 100;
}

/**
 * The median municipality's share — the figure the colour scale pivots on.
 *
 * Not the national one, and that is the whole design of this map: 34,5 % of Finland's 15+
 * population holds a degree, but only 42 of the 308 municipalities reach that. The national figure
 * counts *people*, and degree-holders concentrate in a handful of cities, so pivoting on it paints
 * 86 % of a map of *municipalities* red and leaves five in the two green classes. The median
 * municipality is the midpoint a municipal choropleth actually has: half the areas above, half
 * below.
 *
 * Computed from the 308 municipal figures once and carried on every tab (see `medianShare` in
 * `liveData.ts`), so a municipality never changes colour when the tab flips — the same discipline
 * as `countryRate` on the unemployment map.
 */
export function medianShare(values: (number | null)[]): number | null {
	const known = values.filter((v): v is number => v !== null).sort((a, b) => a - b);

	if (!known.length) return null;

	const middle = known.length / 2;

	return known.length % 2 ? known[Math.floor(middle)] : (known[middle - 1] + known[middle]) / 2;
}

/** How far an area sits from the median municipality, in percentage points. */
export function educationDeviation(share: number | null, reference: number | null): number | null {
	if (share === null || reference === null) return null;

	return share - reference;
}

/**
 * A *diverging* scale, reusing the site's shared green/grey/red so the colours mean the same thing
 * here as on the other maps: green is the better direction, as on the income map.
 *
 * **What it diverges around is the median municipality, not the national share** — see
 * `medianShare` above for why. Grey therefore reads "as typical as it gets", and it is honestly
 * centred on that: the neutral band straddles the reference rather than being shifted onto the
 * crowded side to rescue the class counts.
 *
 * Band edges (∓1 / ∓3 / ∓5 and +1 / +4 / +9 points) come from the real 2025 distribution, giving
 * 35/35/55/47/46/43/47 municipalities per class. The green arm is stretched wider than the red one
 * because the distribution is: the whole red side spans 11,5 points below the median while the
 * green side runs 36,6 above it, Kauniainen alone at 61,1 %. Equal arms would put a third of the
 * country in the darkest green.
 *
 * A note for whoever revisits this: a sequential single-hue ramp was built first and rejected in
 * review as harder to read — decoding lightness is work that hue does for free. If it ever comes
 * back, the purple steps that passed `validate_palette.js --ordinal` against `MAP_SURFACE` were
 * `#c294be #ab78a9 #945c94 #7c447f #632d68 #4a1750 #300a38`.
 *
 * No `label` per class, for the same reason `INCOME_CLASSES` has none: the chip carries the
 * deviation itself, which says more than a class name would.
 */
export const EDUCATION_CLASSES = [
	{ min: -Infinity, ...DIVERGING_SCALE.red[2] },
	{ min: -5, ...DIVERGING_SCALE.red[1] },
	{ min: -3, ...DIVERGING_SCALE.red[0] },
	{ min: -1, ...DIVERGING_SCALE.neutral },
	{ min: 1, ...DIVERGING_SCALE.green[0] },
	{ min: 4, ...DIVERGING_SCALE.green[1] },
	{ min: 9, ...DIVERGING_SCALE.green[2] }
] as const;

/** Index of the neutral, "about as typical as it gets" class. */
const NEUTRAL_CLASS = 3;

/** Index of the class a deviation falls in — null areas take the neutral one. */
function educationClassIndex(deviation: number | null): number {
	return deviation === null
		? NEUTRAL_CLASS
		: EDUCATION_CLASSES.findLastIndex((c) => deviation >= c.min);
}

/**
 * @param share The area's share of 15+ with a tertiary degree.
 * @param reference The median municipality's share, which the scale diverges around — the same
 *   figure on every tab, so an area never changes colour when the tab flips.
 */
export function educationColorFor(share: number | null, reference: number | null): string {
	if (share === null) return NO_DATA_COLOR;

	return EDUCATION_CLASSES[educationClassIndex(educationDeviation(share, reference))].color;
}

/**
 * Text colour for a chip filled with an area's class colour. Carried by the palette itself (see
 * `DIVERGING_SCALE`) rather than derived from a threshold here, because which of white or map ink
 * wins is a measured property of each colour.
 */
export function inkOnEducation(share: number | null, reference: number | null): string {
	return EDUCATION_CLASSES[educationClassIndex(educationDeviation(share, reference))].ink;
}
