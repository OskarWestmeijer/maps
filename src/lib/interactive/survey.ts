/**
 * Reads Tilastokeskus's Labour Force Survey (työvoimatutkimus) key-figures CSV — table
 * 135z, the source behind the työttömyysaste that stat.fi puts on its front page.
 *
 * This is the well-known headline rate, but it is a ~12 000-person sample survey and has
 * no municipal breakdown, so it can only ever be a national figure here. The map itself
 * has to use the register-based series in `unemployment.ts`, which is the only one
 * published per kunta. Showing both, clearly labelled, is the point: they differ by a
 * couple of points and readers otherwise assume the map is wrong.
 */

export type LabourSurvey = {
	/** Trend series — the figure stat.fi advertises as *the* työttömyysaste. */
	rate: number | null;
	/** Unadjusted monthly figure, for reference. */
	rateOriginal: number | null;
	/** "2026M06" */
	period: string;
};

const PERIOD_COLUMN = 'Kuukausi';
const TREND_COLUMN = 'Työttömyysaste, %, trendi';
const ORIGINAL_COLUMN = 'Työttömyysaste, %';

/** The export uses `;` separators and quotes text fields; numbers may use `,` or `.`. */
function cells(line: string): string[] {
	return line.split(';').map((cell) => cell.trim().replace(/^"|"$/g, ''));
}

function parseRate(raw: string | undefined): number | null {
	if (!raw) return null;

	const value = Number(raw.replace(',', '.'));

	return Number.isFinite(value) ? value : null;
}

export function toLabourSurvey(csv: string): LabourSurvey {
	// The file opens with a free-text title line and a blank line before the header, so
	// the header is found by content rather than by line number.
	const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== '');
	const headerIndex = lines.findIndex((line) => cells(line)[0] === PERIOD_COLUMN);

	if (headerIndex === -1) throw new Error('No header row in labour survey CSV');

	const header = cells(lines[headerIndex]);
	const row = cells(lines[headerIndex + 1] ?? '');

	const valueOf = (column: string) => {
		const index = header.indexOf(column);

		return index === -1 ? null : parseRate(row[index]);
	};

	return {
		rate: valueOf(TREND_COLUMN),
		rateOriginal: valueOf(ORIGINAL_COLUMN),
		period: row[header.indexOf(PERIOD_COLUMN)] ?? ''
	};
}
