/**
 * Reads the KEHA-keskus / Työnvälitystilasto municipal export (PxWeb JSON) and pulls out
 * one unemployment figure per municipality, keyed by the same national code (`natcode`)
 * the map GeoJSON carries.
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

const WHOLE_COUNTRY = 'SSS';

const COLUMNS = {
	rate: 'TYOTOSUUS',
	labourForce: 'TYOVOIMATK',
	jobseekers: 'HAKIJALOPUSSA',
	unemployed: 'TYOTTOMATLOPUSSA'
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

export function toUnemploymentData(px: PxWebExport): UnemploymentData {
	const indexes = columnIndexes(px.columns);
	const stats = new Map<string, KuntaStats>();
	let national: KuntaStats = { rate: null, labourForce: null, jobseekers: null, unemployed: null };
	let period = '';

	for (const row of px.data) {
		const [area, timePeriod] = row.key;
		const figures: KuntaStats = {
			rate: parseRate(row.values[indexes.rate]),
			labourForce: parseRate(row.values[indexes.labourForce]),
			jobseekers: parseRate(row.values[indexes.jobseekers]),
			unemployed: parseRate(row.values[indexes.unemployed])
		};

		if (timePeriod) period = timePeriod;

		if (area === WHOLE_COUNTRY) {
			national = figures;
			continue;
		}

		// The export also carries region-level rows (MK/SK/ELY) and a "kunta unknown"
		// bucket; only the numeric KU codes line up with the map.
		if (!area.startsWith('KU')) continue;

		const natcode = area.slice(2);

		// A municipality is kept even when some figures are suppressed — the labour force
		// is published for all 308, while four tiny Åland municipalities have no rate.
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
 * Green (low) to red (high), in six classes.
 *
 * The ramp's lightness decreases monotonically across every step, which matters: a plain
 * green-to-red scale is unreadable for red-green colour blindness, but because low always
 * reads lighter than high the magnitude still comes through when the hue does not. Steps
 * were validated for monotone lightness, adjacent lightness gaps and light-end contrast
 * against the white page.
 */
export const UNEMPLOYMENT_CLASSES = [
	{ min: 0, label: 'under 6', color: '#81c593' },
	{ min: 6, label: '6–9', color: '#76af7c' },
	{ min: 9, label: '9–12', color: '#81936c' },
	{ min: 12, label: '12–15', color: '#a36945' },
	{ min: 15, label: '15–18', color: '#ac3d25' },
	{ min: 18, label: '18 and over', color: '#9c1b1b' }
] as const;

export const NO_DATA_COLOR = '#e5e5e2';

export function colorFor(rate: number | null): string {
	if (rate === null) return NO_DATA_COLOR;

	let color = UNEMPLOYMENT_CLASSES[0].color as string;

	for (const bucket of UNEMPLOYMENT_CLASSES) {
		if (rate >= bucket.min) color = bucket.color;
	}

	return color;
}
