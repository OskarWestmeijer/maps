import { describe, it, expect } from 'vitest';
import {
	aggregateBalanceStats,
	EMPTY_BALANCE_STATS,
	BALANCE_CLASSES,
	balanceColorFor,
	imbalance,
	inkOnBalance,
	sexDeviation,
	toBalanceData
} from './balance';
import { DIVERGING_SCALE, NO_DATA_COLOR, type PxWebExport } from './unemployment';

/**
 * Shaped like the real 11re export: three rows per area — total, men, women — and a
 * whole-country row whose key is `['SSS', 'SSS', '2025']`, where the area code and the sex code
 * are the same string. That collision is why the parser resolves dimensions by position rather
 * than by pattern, and it is the main thing these tests pin.
 */
const px: PxWebExport = {
	columns: [
		{ code: 'alue_23_20260101', text: 'Alue', type: 'd' },
		{ code: 'sukupuoli_9_20180101', text: 'Sukupuoli', type: 'd' },
		{ code: 'timeperiod_y', text: 'Vuosi', type: 't' },
		{ code: 'vaerak-vaesto', text: 'Väestö 31.12.', type: 'c' }
	],
	data: [
		{ key: ['SSS', 'SSS', '2025'], values: ['5652881'] },
		{ key: ['SSS', '1', '2025'], values: ['2799212'] },
		{ key: ['SSS', '2', '2025'], values: ['2853669'] },
		{ key: ['KU091', 'SSS', '2025'], values: ['694392'] },
		{ key: ['KU091', '1', '2025'], values: ['331843'] },
		{ key: ['KU091', '2', '2025'], values: ['362549'] },
		{ key: ['KU837', 'SSS', '2025'], values: ['263337'] },
		{ key: ['KU837', '1', '2025'], values: ['127893'] },
		{ key: ['KU837', '2', '2025'], values: ['135444'] }
	],
	metadata: [{ source: 'Tilastokeskus, väestörakenne' }]
};

describe('toBalanceData', () => {
	const result = toBalanceData(px);

	it('pivots the three rows of an area into one set of figures', () => {
		expect(result.stats.get('091')).toEqual({
			womenShare: (362549 / 694392) * 100,
			women: 362549,
			men: 331843,
			population: 694392
		});
	});

	it('does not mistake the whole-country row for a sex, or vice versa', () => {
		// `['SSS', 'SSS', '2025']` — both codes are the same string, which is why the dimensions
		// are resolved from `columns` rather than by looking for something area-shaped.
		expect(result.national.population).toBe(5652881);
		expect(result.national.women).toBe(2853669);
		expect(result.national.womenShare).toBeCloseTo(50.48, 2);
	});

	it('reads the period and the source out of the file', () => {
		expect(result.period).toBe('2025');
		expect(result.source).toBe('Tilastokeskus, väestörakenne');
	});

	it('finds the dimensions whichever order the key happens to be in', () => {
		const swapped: PxWebExport = {
			...px,
			columns: [px.columns[1], px.columns[0], px.columns[2], px.columns[3]],
			data: px.data.map((row) => ({ ...row, key: [row.key[1], row.key[0], row.key[2]] }))
		};

		expect(toBalanceData(swapped).stats.get('091')?.women).toBe(362549);
	});
});

describe('aggregateBalanceStats', () => {
	const rolled = aggregateBalanceStats([
		toBalanceData(px).stats.get('091')!,
		toBalanceData(px).stats.get('837')!
	]);

	it('sums the counts and recomputes the share from the sums', () => {
		expect(rolled.women).toBe(362549 + 135444);
		expect(rolled.men).toBe(331843 + 127893);
		expect(rolled.womenShare).toBeCloseTo(((362549 + 135444) / (694392 + 263337)) * 100, 10);
	});

	it('is null-valued rather than zero-valued for an empty list', () => {
		expect(aggregateBalanceStats([])).toEqual(EMPTY_BALANCE_STATS);
	});
});

describe('sexDeviation', () => {
	it('measures points away from an even split, signed', () => {
		expect(sexDeviation(52.2)).toBeCloseTo(2.2, 5);
		expect(sexDeviation(42.6)).toBeCloseTo(-7.4, 5);
		expect(sexDeviation(50)).toBe(0);
		expect(sexDeviation(null)).toBeNull();
	});
});

describe('imbalance', () => {
	it('is the distance from an even split, whichever way it leans', () => {
		// The mapped measure: the map answers how lopsided, the panel answers which way.
		expect(imbalance(52.2)).toBeCloseTo(2.2, 5);
		expect(imbalance(47.8)).toBeCloseTo(2.2, 5);
		expect(imbalance(50)).toBe(0);
		expect(imbalance(null)).toBeNull();
	});
});

describe('balanceColorFor', () => {
	it('hatches an area with no published figure', () => {
		expect(balanceColorFor(null)).toBe(NO_DATA_COLOR);
	});

	it('runs green at an even split through to red at the extremes', () => {
		// 0 / 0,4 / 0,9 / 1,4 / 2,2 / 3,4 / 7,4 points off even.
		const shares = [50, 50.4, 49.1, 51.4, 52.2, 46.6, 42.6];

		expect(shares.map(balanceColorFor)).toEqual(BALANCE_CLASSES.map((c) => c.color));
	});

	it('gives the same colour whichever sex is ahead', () => {
		// The property that makes this one axis rather than two: a 2,2-point gap is the same
		// distance from even in either direction.
		expect(balanceColorFor(52.2)).toBe(balanceColorFor(47.8));
		expect(balanceColorFor(44.5)).toBe(balanceColorFor(55.5));
	});

	it('paints an exactly even municipality the best green', () => {
		// Pihtipudas and Mäntsälä are both exactly 50,0 %.
		expect(balanceColorFor(50)).toBe(DIVERGING_SCALE.green[2].color);
	});

	it('paints the most lopsided municipality the worst red', () => {
		// Sottunga, 43 women to 58 men.
		expect(balanceColorFor(42.6)).toBe(DIVERGING_SCALE.red[2].color);
	});

	it('takes no reference figure — the anchor is a constant, not a statistic', () => {
		expect(balanceColorFor.length).toBe(1);
	});
});

describe('inkOnBalance', () => {
	it('takes its ink from the palette, per class', () => {
		expect(inkOnBalance(50)).toBe(DIVERGING_SCALE.green[2].ink);
		expect(inkOnBalance(51.4)).toBe(DIVERGING_SCALE.neutral.ink);
		expect(inkOnBalance(42.6)).toBe(DIVERGING_SCALE.red[2].ink);
	});
});
