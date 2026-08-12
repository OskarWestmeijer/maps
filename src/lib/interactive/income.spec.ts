import { describe, it, expect } from 'vitest';
import {
	EMPTY_INCOME_STATS,
	INCOME_CLASSES,
	incomeColorFor,
	incomeDeviation,
	inkOnIncome,
	toIncomeData
} from './income';
import { DIVERGING_SCALE, NO_DATA_COLOR, type PxWebExport } from './unemployment';

/**
 * Shaped like the real 14ww export: `[area, year]` keys, several area levels in one file, and
 * content columns interleaved so they are not in the order the code reads them — the real file
 * carries 26 of them around the five that are used. The prefixes are deliberately mixed, since
 * that is the quirk the suffix matching exists for, and `rpt_aste` is surrounded by the three
 * near-miss codes that share its wording.
 */
const px: PxWebExport = {
	columns: [
		{ code: 'alue_23_20250101', text: 'Alue', type: 'd' },
		{ code: 'timeperiod_y', text: 'Vuosi', type: 't' },
		{ code: 'tjt-henkiloita', text: 'Asuntoväestö, henkilöä', type: 'c' },
		{ code: 'hkturaha18_med', text: 'Aikuisväestön käytettävissä oleva rahatulo', type: 'c' },
		{ code: 'tjt-ekvikturaha_med', text: 'Käytettävissä oleva rahatulo', type: 'c' },
		{ code: 'gini_kturaha', text: 'Gini-kerroin', type: 'c' },
		{ code: 'pit_rpt_aste', text: 'Pitkittyneesti pienituloisten osuus', type: 'c' },
		{ code: 'rpt_aste', text: 'Pienituloisuusaste', type: 'c' },
		{ code: 'rpt_aste_rkoy5', text: 'Pienituloisuusaste kiinteällä rajalla', type: 'c' },
		{ code: 'rpt_l_aste', text: 'Lasten pienituloisuusaste', type: 'c' },
		{ code: 'gini_bruttotu', text: 'Gini-kerroin, bruttotulot', type: 'c' }
	],
	data: [
		{
			key: ['SSS', '2024'],
			values: ['5505446', '26605', '30523', '28.4', '7.1', '14.2', '13.0', '11.0', '35.1']
		},
		{
			key: ['KU091', '2024'],
			values: ['663626', '27000', '31500', '32.0', '8.0', '16.0', '15.0', '14.0', '38.0']
		},
		{
			key: ['KU235', '2024'],
			values: ['10000', '40000', '49710', '40.0', '3.0', '6.0', '5.0', '4.0', '45.0']
		},
		// A suppressed cell must stay null rather than becoming 0.
		{
			key: ['KU766', '2024'],
			values: ['1200', '24000', '27000', '25.0', '...', '...', '...', '...', '30.0']
		},
		// Neither the "unknown municipality" bucket nor the other area levels belong on the map.
		{ key: ['KUJOU', '2024'], values: ['50', '1', '1', '1', '1', '1', '1', '1', '1'] },
		{
			key: ['MK06', '2024'],
			values: ['520000', '26200', '30117', '28.0', '7.0', '14.0', '13.0', '11.0', '34.0']
		},
		{
			key: ['SK064', '2024'],
			values: ['432667', '26400', '30473', '28.2', '7.0', '14.0', '13.0', '11.0', '34.5']
		}
	],
	metadata: [{ source: 'Tilastokeskus, tulonjakotilasto' }]
};

describe('toIncomeData', () => {
	const result = toIncomeData(px);

	it('reads each column by its suffix, not by position in `columns`', () => {
		expect(result.stats.get('091')).toEqual({
			householdPopulation: 663626,
			personalMedian: 27000,
			medianIncome: 31500,
			gini: 32,
			lowIncomeRate: 16
		});
	});

	it('does not confuse `rpt_aste` with the codes that merely contain it', () => {
		// `pit_rpt_aste`, `rpt_aste_rkoy5` and `rpt_l_aste` all sit in the same export, and all
		// three carry different values here — a loose match would silently read one of them.
		expect(result.stats.get('235')?.lowIncomeRate).toBe(6);
	});

	it('keeps a suppressed figure null rather than zero, without dropping the area', () => {
		expect(result.stats.get('766')).toEqual({
			householdPopulation: 1200,
			personalMedian: 24000,
			medianIncome: 27000,
			gini: 25,
			lowIncomeRate: null
		});
	});

	it('takes the whole-country figures from the SSS row', () => {
		expect(result.national.medianIncome).toBe(30523);
		expect(result.national.lowIncomeRate).toBe(14.2);
	});

	it('reads the period and the publisher out of the file', () => {
		expect(result.period).toBe('2024');
		expect(result.source).toBe('Tilastokeskus, tulonjakotilasto');
	});

	it('maps only numeric municipality codes', () => {
		expect([...result.stats.keys()].sort()).toEqual(['091', '235', '766']);
	});

	it('keys by the published region rows when asked for them', () => {
		const regions = toIncomeData(px, 'MK');

		// The Region tab reads Statistics Finland's own regional medians. It cannot roll them
		// up from municipalities — a median is not additive.
		expect([...regions.stats.keys()]).toEqual(['06']);
		expect(regions.stats.get('06')?.medianIncome).toBe(30117);
		expect(regions.national.medianIncome).toBe(30523);
	});

	it('throws when a column the map needs has gone', () => {
		const thinned: PxWebExport = {
			...px,
			columns: px.columns.filter((c) => c.code !== 'tjt-ekvikturaha_med')
		};

		expect(() => toIncomeData(thinned)).toThrow(/ekvikturaha_med/);
	});
});

describe('incomeDeviation', () => {
	it('reads as a percentage of the national median', () => {
		expect(incomeDeviation(30523, 30523)).toBe(0);
		expect(incomeDeviation(33575.3, 30523)).toBeCloseTo(10, 5);
	});

	it('is null when either figure is missing, or the reference is unusable', () => {
		expect(incomeDeviation(null, 30523)).toBeNull();
		expect(incomeDeviation(30523, null)).toBeNull();
		expect(incomeDeviation(30523, 0)).toBeNull();
	});
});

describe('the income colour scale', () => {
	const national = 30000;

	it('runs red below the national median and green above it', () => {
		expect(incomeColorFor(24000, national)).toBe(DIVERGING_SCALE.red[2].color); // −20 %
		expect(incomeColorFor(27000, national)).toBe(DIVERGING_SCALE.red[1].color); // −10 %
		expect(incomeColorFor(28500, national)).toBe(DIVERGING_SCALE.red[0].color); // −5 %
		expect(incomeColorFor(30000, national)).toBe(DIVERGING_SCALE.neutral.color); // 0 %
		expect(incomeColorFor(31500, national)).toBe(DIVERGING_SCALE.green[0].color); // +5 %
		expect(incomeColorFor(33000, national)).toBe(DIVERGING_SCALE.green[1].color); // +10 %
		expect(incomeColorFor(36000, national)).toBe(DIVERGING_SCALE.green[2].color); // +20 %
	});

	it('hatches an area with no published median', () => {
		expect(incomeColorFor(null, national)).toBe(NO_DATA_COLOR);
	});

	it('falls back to neutral when the national median has not loaded yet', () => {
		expect(incomeColorFor(30000, null)).toBe(DIVERGING_SCALE.neutral.color);
	});

	it('carries a measured ink colour for every class', () => {
		expect(inkOnIncome(24000, national)).toBe(DIVERGING_SCALE.red[2].ink);
		expect(inkOnIncome(30000, national)).toBe(DIVERGING_SCALE.neutral.ink);
	});

	it('is symmetric around the national median', () => {
		expect(INCOME_CLASSES.map((c) => c.min)).toEqual([-Infinity, -12, -8, -4, 4, 8, 12]);
	});
});

describe('EMPTY_INCOME_STATS', () => {
	it('is what an area shows before the fetch lands', () => {
		expect(Object.values(EMPTY_INCOME_STATS).every((v) => v === null)).toBe(true);
	});
});
