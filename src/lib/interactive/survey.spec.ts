import { describe, it, expect } from 'vitest';
import { toLabourSurvey } from './survey';
import type { PxWebExport } from './unemployment';

// Trimmed to the columns that matter, but keeps the real export's shape: the month is the
// only key column, and `values` holds the content columns in order.
function px(
	columns: [code: string, text: string][],
	values: string[],
	period = '2026M06'
): PxWebExport {
	return {
		columns: [
			{ code: 'timeperiod_m', text: 'Kuukausi', type: 't' },
			...columns.map(([code, text]) => ({ code, text, type: 'c' }))
		],
		data: [{ key: [period], values }]
	};
}

const CONTENT: [string, string][] = [
	['tyti-Tyolliset', 'Työlliset, 1000 henkilöä'],
	['tyti-Tyottomyysaste', 'Työttömyysaste, %'],
	['tyottaste_trendi', 'Työttömyysaste, %, trendi'],
	['Tyottaste_kausi', 'Työttömyysaste, %, kausitasoitettu sarja']
];

describe('toLabourSurvey', () => {
	const survey = toLabourSurvey(px(CONTENT, ['2658', '10.0', '10.5', '10.1']));

	it('takes the trend series, which is the figure Tilastokeskus advertises', () => {
		expect(survey.rate).toBe(10.5);
	});

	it('keeps the unadjusted figure separate', () => {
		// The display texts overlap by prefix — "Työttömyysaste, %" is the start of both other
		// names — which is why the lookup goes by column code instead.
		expect(survey.rateOriginal).toBe(10.0);
	});

	it('reads the period from the key', () => {
		expect(survey.period).toBe('2026M06');
	});

	it('resolves indexes against the content columns, not all columns', () => {
		// `values` omits the key column, so an index taken from `columns` would be off by one
		// and would read the unadjusted rate as the trend.
		expect(survey.rate).not.toBe(10.0);
	});

	it('accepts comma decimals, which other Tilastokeskus exports use', () => {
		const commas = px(CONTENT, ['2658', '10,0', '10,5', '10,1']);

		expect(toLabourSurvey(commas).rate).toBe(10.5);
	});

	it('returns null instead of guessing when a column is absent', () => {
		const missing = px([['tyti-Tyolliset', 'Työlliset, 1000 henkilöä']], ['2658']);

		expect(toLabourSurvey(missing).rate).toBeNull();
	});

	it('treats a suppressed figure as missing rather than zero', () => {
		expect(toLabourSurvey(px(CONTENT, ['2658', '10.0', '...', '10.1'])).rate).toBeNull();
	});

	it('throws if the export carries no data row', () => {
		expect(() => toLabourSurvey({ ...px(CONTENT, []), data: [] })).toThrow();
	});
});
