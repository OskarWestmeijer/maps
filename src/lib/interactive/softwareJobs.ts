/**
 * Reads a second, narrower KEHA-keskus / Työnvälitystilasto export (PxWeb table 12ti):
 * unemployed jobseekers and open vacancies, broken down by municipality *and* occupation
 * group, for the three ISCO-08 / Ammattiluokitus 2010 unit groups under "Software and
 * applications developers and analysts" that the site owner is personally interested in.
 * Unlike `unemployment.ts` this is opt-in colour: it only feeds the info panel, not the map.
 */

import type { PxWebExport } from './unemployment';

/**
 * The three occupation groups present in the export, keyed by their Ammattiluokitus 2010 /
 * ISCO-08 code. Finnish labels per Tilastokeskus's classification — this table doesn't carry
 * them itself, only the bare codes, so they're hand-copied here.
 */
export const OCCUPATION_GROUPS: Record<string, string> = {
	'2513': 'Web- ja multimediakehittäjät',
	'2514': 'Sovellussuunnittelijat',
	'2519': 'Ohjelmisto- ja sovelluskehittäjät ja -analyytikot, muualla luokittelemattomat'
};

export type SoftwareJobStats = {
	/** Summed across the three occupation groups. Null only when every group is suppressed. */
	unemployed: number | null;
	/** True when at least one (but not all) of the three groups was suppressed, so `unemployed`
	 *  is a lower bound rather than an exact total. */
	unemployedIsMinimum: boolean;
	vacancies: number | null;
	vacanciesIsMinimum: boolean;
};

export type SoftwareJobsData = {
	/** natcode -> summed figures. */
	stats: Map<string, SoftwareJobStats>;
	/** Whole-country figures (the `SSS` row), for context before anything is hovered. */
	national: SoftwareJobStats;
	period: string;
	source: string;
};

/**
 * Rolls up an arbitrary set of municipalities into one figure — same idea as
 * `aggregateKuntaStats` in `unemployment.ts`, for a hand-picked region that has no
 * equivalent pre-aggregated row in the source export. The `...IsMinimum` flags are OR'd
 * across the list for type parity, but — like the per-kunta ones — stay uninspected by the
 * panel, which shows plain summed numbers rather than a "+" lower-bound marker.
 */
export function aggregateSoftwareJobStats(list: SoftwareJobStats[]): SoftwareJobStats {
	const sum = (field: 'unemployed' | 'vacancies'): number | null => {
		const known = list.map((s) => s[field]).filter((v): v is number => v !== null);

		return known.length ? known.reduce((a, b) => a + b, 0) : null;
	};

	return {
		unemployed: sum('unemployed'),
		unemployedIsMinimum: list.some((s) => s.unemployedIsMinimum),
		vacancies: sum('vacancies'),
		vacanciesIsMinimum: list.some((s) => s.vacanciesIsMinimum)
	};
}

const WHOLE_COUNTRY = 'SSS';

const COLUMNS = {
	unemployed: 'TYOTTOMATLOPUSSA',
	vacancies: 'AVPAIKATLOPUSSA'
} as const;

function columnIndexes(
	columns: PxWebExport['columns']
): Record<'unemployed' | 'vacancies', number> {
	const content = columns.filter((c) => c.type === 'c');
	const indexes = {} as Record<'unemployed' | 'vacancies', number>;

	for (const [field, code] of Object.entries(COLUMNS) as ['unemployed' | 'vacancies', string][]) {
		const index = content.findIndex((c) => c.code === code);

		if (index === -1) throw new Error(`Missing ${code} column in software jobs export`);

		indexes[field] = index;
	}

	return indexes;
}

/** PxWeb marks suppressed/unavailable figures with "..." or an empty string. */
function parseCount(raw: string | undefined): number | null {
	if (!raw) return null;

	const value = Number(raw);

	return Number.isFinite(value) ? value : null;
}

/**
 * Running sum for one area across its occupation-group rows. Counting knowns and nulls
 * separately (rather than folding straight into a running total/flag) means the order the
 * three rows arrive in can't hide a mixed known/suppressed area — see `toSoftwareJobsData`.
 */
type Accumulator = { total: number; knownCount: number; nullCount: number };

function addToSum(acc: Accumulator, value: number | null): Accumulator {
	if (value === null) return { ...acc, nullCount: acc.nullCount + 1 };

	return { ...acc, total: acc.total + value, knownCount: acc.knownCount + 1 };
}

export function toSoftwareJobsData(px: PxWebExport): SoftwareJobsData {
	const indexes = columnIndexes(px.columns);

	const emptyAcc = (): Accumulator => ({ total: 0, knownCount: 0, nullCount: 0 });
	const unemployedByArea = new Map<string, Accumulator>();
	const vacanciesByArea = new Map<string, Accumulator>();
	let period = '';

	for (const row of px.data) {
		const [area, group, timePeriod] = row.key;

		if (!(group in OCCUPATION_GROUPS)) continue;
		if (timePeriod) period = timePeriod;

		const unemployed = parseCount(row.values[indexes.unemployed]);
		const vacancies = parseCount(row.values[indexes.vacancies]);

		unemployedByArea.set(area, addToSum(unemployedByArea.get(area) ?? emptyAcc(), unemployed));
		vacanciesByArea.set(area, addToSum(vacanciesByArea.get(area) ?? emptyAcc(), vacancies));
	}

	const stats = new Map<string, SoftwareJobStats>();
	let national: SoftwareJobStats = {
		unemployed: null,
		unemployedIsMinimum: false,
		vacancies: null,
		vacanciesIsMinimum: false
	};

	const areas = new Set([...unemployedByArea.keys(), ...vacanciesByArea.keys()]);

	for (const area of areas) {
		const u = unemployedByArea.get(area);
		const v = vacanciesByArea.get(area);

		const figures: SoftwareJobStats = {
			unemployed: u && u.knownCount > 0 ? u.total : null,
			unemployedIsMinimum: (u?.knownCount ?? 0) > 0 && (u?.nullCount ?? 0) > 0,
			vacancies: v && v.knownCount > 0 ? v.total : null,
			vacanciesIsMinimum: (v?.knownCount ?? 0) > 0 && (v?.nullCount ?? 0) > 0
		};

		if (area === WHOLE_COUNTRY) {
			national = figures;
			continue;
		}

		// Same shape as the register export: region rows (MK/SK/ELY) and a "kunta unknown"
		// bucket share the file with the numeric KU codes that join the map.
		if (!area.startsWith('KU')) continue;

		const natcode = area.slice(2);

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
