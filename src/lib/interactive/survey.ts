/**
 * Reads Tilastokeskus's Labour Force Survey (työvoimatutkimus) key-figures export — table
 * 135z, the source behind the työttömyysaste that stat.fi puts on its front page.
 *
 * This is the well-known headline rate, but it is a ~12 000-person sample survey and has
 * no municipal breakdown, so it can only ever be a national figure here. The map itself
 * has to use the register-based series in `unemployment.ts`, which is the only one
 * published per kunta. Showing both, clearly labelled, is the point: they differ by a
 * couple of points and readers otherwise assume the map is wrong.
 */

import { parseFigure, type PxWebExport } from './unemployment';

export type LabourSurvey = {
	/** Trend series — the figure stat.fi advertises as *the* työttömyysaste. */
	rate: number | null;
	/** Unadjusted monthly figure, for reference. */
	rateOriginal: number | null;
	/** "2026M06" */
	period: string;
};

export const EMPTY_LABOUR_SURVEY: LabourSurvey = { rate: null, rateOriginal: null, period: '' };

/**
 * Looked up by column *code*, not by the Finnish display text: the texts are
 * "Työttömyysaste, %" and "Työttömyysaste, %, trendi", where the first is a strict prefix of
 * the second, so any loose match silently returns the wrong series. The codes have no such
 * overlap.
 */
const COLUMNS = {
	rate: 'tyottaste_trendi',
	rateOriginal: 'tyti-Tyottomyysaste'
} as const;

export function toLabourSurvey(px: PxWebExport): LabourSurvey {
	// Same PxWeb quirk as everywhere else: a row's `values` holds only the content columns,
	// so indexes resolve against that filtered list rather than against `columns`.
	const content = px.columns.filter((column) => column.type === 'c');
	const row = px.data[0];

	if (!row) throw new Error('No data row in labour survey export');

	const valueOf = (code: string) => {
		const index = content.findIndex((column) => column.code === code);

		return index === -1 ? null : parseFigure(row.values[index]);
	};

	// The only key column is the month, so the period is the whole key.
	return {
		rate: valueOf(COLUMNS.rate),
		rateOriginal: valueOf(COLUMNS.rateOriginal),
		period: row.key[0] ?? ''
	};
}
