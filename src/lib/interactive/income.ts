/**
 * Reads the Tilastokeskus income export (PxWeb table 14ww, "Tulotaso, tuloerot, pienituloiset
 * ja perusturvan varassa olevat asuntoväestössä alueittain") and pulls one set of income
 * figures per area, keyed by the same national code (`natcode`) the map GeoJSON carries.
 *
 * A note on the source, in the same spirit as the register/survey distinction on the
 * unemployment map: the export's own `source` string says "tulonjakotilasto", whose headline
 * national figures come from a sample survey. These municipal figures do not — they come from
 * that statistic's register-based *total* dataset, which is what makes a 308-municipality
 * breakdown possible at all. Label it as register/total data.
 *
 * Like 12r5 and unlike 121w, this export bundles several area levels in one file (KU
 * municipalities, MK regions, SK sub-regions, and the whole-country SSS row), so
 * `toIncomeData`'s `areaPrefix` picks which one to key `stats` by — and the Region tab reads
 * Statistics Finland's own published regional medians rather than a roll-up.
 */

import { DIVERGING_SCALE, NO_DATA_COLOR, parseFigure, type PxWebExport } from './unemployment';

export type IncomeStats = {
	/** Median disposable income per consumption unit — the mapped measure. Euros per year. */
	medianIncome: number | null;
	/** Median personal disposable income of the adult population. Euros per year. */
	personalMedian: number | null;
	/** Gini coefficient of disposable income, 0–100. Higher means wider spread. */
	gini: number | null;
	/** Share of the household population below 60 % of the *national* median. Percent. */
	lowIncomeRate: number | null;
	/** Asuntoväestö — the people these figures describe. The one additive field here. */
	householdPopulation: number | null;
};

/** Every field null — merged into areas the export has no row for. */
export const EMPTY_INCOME_STATS: IncomeStats = {
	medianIncome: null,
	personalMedian: null,
	gini: null,
	lowIncomeRate: null,
	householdPopulation: null
};

export type IncomeData = {
	/** natcode -> figures. Individual fields are null where the source suppresses them. */
	stats: Map<string, IncomeStats>;
	/** Whole-country figures (the `SSS` row), for context before anything is hovered. */
	national: IncomeStats;
	/** Statistics period, e.g. "2024". */
	period: string;
	source: string;
};

/*
 * There is deliberately no `aggregateIncomeStats` here, and adding one would be a mistake.
 *
 * The other two maps roll a hand-picked region up because their measures are ratios of counts:
 * summing `unemployed` and `labourForce` across municipalities and dividing gives the region's
 * *exact* rate. A median has no such property. It is the income of the middle person once the
 * whole population is lined up, and the middles of eight separate line-ups say nothing precise
 * about the middle of the merged one — recovering it needs the household-level distribution,
 * which this export does not ship. The same goes for `gini` and `lowIncomeRate`.
 *
 * So the Region tab reads the export's published `MK` rows (Statistics Finland computed those
 * from the microdata), and the Tampere Metro tab, which has no published row of its own, shows
 * no combined headline at all. The published seutukunta row `SK064` is not a stand-in: it
 * covers 11 municipalities against the metro's 8.
 *
 * `householdPopulation` is a plain count and would sum fine, but on its own it is not worth a
 * function that invites the rest to be summed beside it.
 */

const WHOLE_COUNTRY = 'SSS';

/**
 * Keyed by the part of the column code after the last "-", the same convention `population.ts`
 * uses. This export mixes the two forms in one file — `tjt-ekvikturaha_med` and `tjt-henkiloita`
 * carry the statistic's prefix while `gini_kturaha` and `rpt_aste` do not — and a code with no
 * "-" is simply its own suffix, so both kinds resolve through one rule. Matching is exact, which
 * matters here: `rpt_aste` sits in the same export as `pit_rpt_aste`, `rpt_aste_rkoy5` and
 * `rpt_l_aste`.
 */
const COLUMNS = {
	medianIncome: 'ekvikturaha_med',
	personalMedian: 'hkturaha18_med',
	gini: 'gini_kturaha',
	lowIncomeRate: 'rpt_aste',
	householdPopulation: 'henkiloita'
} as const;

function suffixOf(code: string): string {
	return code.slice(code.lastIndexOf('-') + 1);
}

/**
 * Same PxWeb quirk as the other exports: a row's `values` array holds only the content
 * columns, so an index has to be resolved against that filtered list, not `columns`.
 */
function columnIndexes(columns: PxWebExport['columns']): Record<keyof IncomeStats, number> {
	const content = columns.filter((c) => c.type === 'c');
	const indexes = {} as Record<keyof IncomeStats, number>;

	for (const [field, suffix] of Object.entries(COLUMNS) as [keyof IncomeStats, string][]) {
		const index = content.findIndex((c) => suffixOf(c.code) === suffix);

		if (index === -1) throw new Error(`Missing *-${suffix} column in income export`);

		indexes[field] = index;
	}

	return indexes;
}

/**
 * The area is identified by shape rather than by position, as in `population.ts` — key order
 * is a per-table detail and this family has already changed it once.
 */
function splitKey(key: string[]): { area: string; period: string } {
	const area = key.find((k) => k === WHOLE_COUNTRY || /^(KU|MK|SK|ELY)/.test(k)) ?? '';

	return { area, period: key.find((k) => k !== area) ?? '' };
}

/**
 * @param areaPrefix Which rows to key `stats` by: `'KU'` for the 308 municipalities (the
 *   default), or `'MK'` for the 19 region rows the same export carries. Either way `national`
 *   comes from the single whole-country `SSS` row.
 */
export function toIncomeData(px: PxWebExport, areaPrefix: 'KU' | 'MK' = 'KU'): IncomeData {
	const indexes = columnIndexes(px.columns);
	const stats = new Map<string, IncomeStats>();
	let national = EMPTY_INCOME_STATS;
	let period = '';

	for (const row of px.data) {
		const { area, period: rowPeriod } = splitKey(row.key);
		const figures = Object.fromEntries(
			(Object.keys(COLUMNS) as (keyof IncomeStats)[]).map((field) => [
				field,
				parseFigure(row.values[indexes[field]])
			])
		) as IncomeStats;

		if (rowPeriod) period = rowPeriod;

		if (area === WHOLE_COUNTRY) {
			national = figures;
			continue;
		}

		// SK (sub-region) rows ride along in the same file and are never rendered; only the
		// requested prefix's numeric codes line up with the map being drawn.
		if (!area.startsWith(areaPrefix)) continue;

		const natcode = area.slice(areaPrefix.length);

		// Kept even when a figure is suppressed: the median is published for all 308, while one
		// municipality has no at-risk-of-poverty rate.
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
 * How far an area's median sits from the national one, as a percentage of it.
 *
 * Relative rather than a euro difference, for the same reason the population map's chip is a
 * ratio: "+1 365 €" is arithmetic the reader has to re-scale themselves, while "+4,5 % vs
 * Finland" is already the comparison. It also makes the colour bands mean one thing regardless
 * of which year's file is loaded.
 */
export function incomeDeviation(median: number | null, reference: number | null): number | null {
	if (median === null || reference === null || reference <= 0) return null;

	return (median / reference - 1) * 100;
}

/**
 * A *diverging* scale around the national median, the same shape (and the same
 * `DIVERGING_SCALE` colours) as the unemployment map's — but with the arms the other way up,
 * because here a high figure is the good direction. Green reads above the national median, red
 * below it, with a neutral grey either side of it.
 *
 * The midpoint is real: the national median is the figure every one of these is a deviation
 * from, and it is passed in rather than derived per tab so a municipality never changes colour
 * when the region toggle flips.
 *
 * Band edges (±4 / ±8 / ±12 % of the national median) come from the real 2024 distribution,
 * giving roughly 23/72/76/83/20/16/18 municipalities per class. Two things the map shows that
 * are findings rather than scaling artefacts: it leans red, because the municipal median
 * (29 079 €) sits below the national one (30 523 €) — the big cities pull the national figure
 * up — and Kauniainen sits alone at +63 %, nearly three times the next municipality's
 * deviation, which is exactly why the top class is open-ended.
 *
 * `DIVERGING_SCALE` is already validated against `MAP_SURFACE` on all four checks of the
 * `dataviz` skill's `validate_palette.js --ordinal`. If these colours are ever re-picked,
 * re-run it per arm rather than eyeballing.
 */
/*
 * Note there is no `label` per class, unlike `CHANGE_CLASSES` and `DEVIATION_CLASSES`. Those
 * two put the class name *in* the chip ("growing fast"), because their chip is the only place
 * the colour is explained. Here the chip carries the deviation itself ("+62,9 % vs Finland"),
 * which says everything the class name would and more — a row repeating it as "far above" was
 * tried and removed, since it read as a second, vaguer statistic rather than a legend.
 */
export const INCOME_CLASSES = [
	{ min: -Infinity, ...DIVERGING_SCALE.red[2] },
	{ min: -12, ...DIVERGING_SCALE.red[1] },
	{ min: -8, ...DIVERGING_SCALE.red[0] },
	{ min: -4, ...DIVERGING_SCALE.neutral },
	{ min: 4, ...DIVERGING_SCALE.green[0] },
	{ min: 8, ...DIVERGING_SCALE.green[1] },
	{ min: 12, ...DIVERGING_SCALE.green[2] }
] as const;

/** Index of the neutral, "about the national median" class. */
const NEUTRAL_CLASS = 3;

/** Index of the class a deviation falls in — null areas take the neutral one. */
function incomeClassIndex(deviation: number | null): number {
	return deviation === null
		? NEUTRAL_CLASS
		: INCOME_CLASSES.findLastIndex((c) => deviation >= c.min);
}

/**
 * @param median The area's median disposable income per consumption unit.
 * @param reference The whole-country median the scale diverges around — always the national
 *   figure, on every tab.
 */
export function incomeColorFor(median: number | null, reference: number | null): string {
	if (median === null) return NO_DATA_COLOR;

	const deviation = incomeDeviation(median, reference);

	return INCOME_CLASSES[incomeClassIndex(deviation)].color;
}

/**
 * Text colour for a chip filled with an area's class colour. Carried by the palette itself
 * (see `DIVERGING_SCALE`) rather than derived from a threshold here, because which of white or
 * map ink wins is a measured property of each colour.
 */
export function inkOnIncome(median: number | null, reference: number | null): string {
	return INCOME_CLASSES[incomeClassIndex(incomeDeviation(median, reference))].ink;
}
