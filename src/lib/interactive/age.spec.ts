import { describe, it, expect } from 'vitest';
import {
	AGE_CLASSES,
	ageColorFor,
	ageDeviation,
	aggregateAgeStats,
	EMPTY_AGE_STATS,
	inkOnAge,
	medianAge,
	toAgeData
} from './age';
import { DIVERGING_SCALE, NO_DATA_COLOR, type PxWebExport } from './unemployment';

/**
 * Shaped like the real 11ra export: `[area, year]` keys, mixed column prefixes, and a sample of
 * the sixteen area levels it carries — only `KU` and `MK` are ever drawn, and the rest have to
 * fall through the filter without a case of their own.
 */
const px: PxWebExport = {
	columns: [
		{ code: 'alue_23_20260101', text: 'Alue', type: 'd' },
		{ code: 'timeperiod_y', text: 'Vuosi', type: 't' },
		{ code: 'vaerak-vaesto', text: 'Väestö 31.12.', type: 'c' },
		{ code: 'vaesto_alle15_p', text: 'Alle 15-vuotiaiden osuus, %', type: 'c' },
		{ code: 'vaesto_yli64_p', text: '65 vuotta täyttäneiden osuus, %', type: 'c' },
		{ code: 'vaesto_keski_ika', text: 'Keski-ikä, molemmat sukupuolet', type: 'c' }
	],
	data: [
		{ key: ['SSS', '2025'], values: ['5652881', '14.3', '23.8', '44.1'] },
		{ key: ['KU837', '2025'], values: ['200000', '12.3', '19.0', '41.0'] },
		{ key: ['KU604', '2025'], values: ['100000', '17.9', '18.7', '44.0'] },
		{ key: ['MK06', '2025'], values: ['450000', '14.0', '22.6', '43.3'] },
		// Levels the maps never draw: seutukunta, ELY centre, hospital district, mainland/Åland.
		{ key: ['SK064', '2025'], values: ['432667', '14.1', '22.0', '43.0'] },
		{ key: ['EV02', '2025'], values: ['500000', '14.0', '22.0', '43.5'] },
		{ key: ['HV10', '2025'], values: ['500000', '14.0', '22.0', '43.5'] },
		{ key: ['MA1', '2025'], values: ['5620000', '14.3', '23.8', '44.1'] }
	],
	metadata: [{ source: 'Tilastokeskus, väestörakenne' }]
};

describe('toAgeData', () => {
	const result = toAgeData(px);

	it('reads each column by its suffix, not by position in `columns`', () => {
		expect(result.stats.get('837')).toEqual({
			population: 200000,
			underFifteen: 12.3,
			overSixtyFour: 19,
			averageAge: 41
		});
	});

	it('reads the period and the source out of the file rather than the filename', () => {
		expect(result.period).toBe('2025');
		expect(result.source).toBe('Tilastokeskus, väestörakenne');
	});

	it('takes the whole-country figures from the SSS row', () => {
		expect(result.national.averageAge).toBe(44.1);
	});

	it('drops every area level but the one asked for', () => {
		// This export carries sixteen of them — the busiest on the site.
		expect([...result.stats.keys()].sort()).toEqual(['604', '837']);
		expect([...toAgeData(px, 'MK').stats.keys()]).toEqual(['06']);
	});
});

describe('aggregateAgeStats', () => {
	const rolled = aggregateAgeStats([
		toAgeData(px).stats.get('837')!,
		toAgeData(px).stats.get('604')!
	]);

	it('weights the mean by population rather than averaging the means', () => {
		// (41,0 x 200 000 + 44,0 x 100 000) / 300 000 = 42,0 — not the 42,5 an unweighted mean
		// would give. Tampere has to count for more than Vesilahti.
		expect(rolled.averageAge).toBeCloseTo(42, 10);
		expect(rolled.population).toBe(300000);
	});

	it('weights the age shares the same way', () => {
		expect(rolled.underFifteen).toBeCloseTo(14.166667, 5);
		expect(rolled.overSixtyFour).toBeCloseTo(18.9, 5);
	});

	it('refuses to average a member that has no population to weight it by', () => {
		const withHole = aggregateAgeStats([
			toAgeData(px).stats.get('837')!,
			{ ...EMPTY_AGE_STATS, averageAge: 50 }
		]);

		expect(withHole.averageAge).toBeNull();
	});

	it('is null-valued rather than zero-valued for an empty list', () => {
		expect(aggregateAgeStats([])).toEqual(EMPTY_AGE_STATS);
	});
});

describe('medianAge', () => {
	it('averages the two middle values for an even count', () => {
		expect(medianAge([40, 44, 48, 52])).toBe(46);
	});

	it('ignores areas with no published figure', () => {
		expect(medianAge([40, null, 44, null, 48])).toBe(44);
	});

	it('is null when nothing is published', () => {
		expect(medianAge([null, null])).toBeNull();
	});
});

describe('ageColorFor', () => {
	// The real 2025 midpoint: half of the 308 municipalities are older, half younger.
	const MEDIAN = 48.6;

	it('hatches an area with no published figure rather than colouring it', () => {
		expect(ageColorFor(null, MEDIAN)).toBe(NO_DATA_COLOR);
	});

	it('runs green through grey to red as the population gets older', () => {
		// The arms are the other way up from the education map's: here a low figure is the good
		// direction, the same judgement the compare map's `higherIsBetter: false` makes.
		const ages = [34.1, 43, 46, 48.6, 50, 53, 59.5];

		expect(ages.map((a) => ageColorFor(a, MEDIAN))).toEqual(AGE_CLASSES.map((c) => c.color));
	});

	it('paints the youngest municipality green and the oldest red', () => {
		// Luoto 34,1 and Rääkkylä 59,5.
		expect(ageColorFor(34.1, MEDIAN)).toBe(DIVERGING_SCALE.green[2].color);
		expect(ageColorFor(59.5, MEDIAN)).toBe(DIVERGING_SCALE.red[2].color);
	});

	it('puts the median municipality itself in the neutral class', () => {
		expect(ageColorFor(MEDIAN, MEDIAN)).toBe(DIVERGING_SCALE.neutral.color);
	});

	it('puts each band edge in the class above it', () => {
		expect(ageColorFor(MEDIAN + 1, MEDIAN)).toBe(AGE_CLASSES[4].color);
		expect(ageColorFor(MEDIAN + 0.9, MEDIAN)).toBe(AGE_CLASSES[3].color);
		expect(ageColorFor(MEDIAN - 6, MEDIAN)).toBe(AGE_CLASSES[1].color);
	});

	it('is neutral rather than crashing when the reference has not loaded', () => {
		expect(ageColorFor(45, null)).toBe(DIVERGING_SCALE.neutral.color);
	});
});

describe('ageDeviation', () => {
	it('is the gap in years, signed', () => {
		expect(ageDeviation(41.2, 48.6)).toBeCloseTo(-7.4, 5);
		expect(ageDeviation(59.5, 48.6)).toBeCloseTo(10.9, 5);
	});

	it('is null when either figure is missing', () => {
		expect(ageDeviation(null, 48.6)).toBeNull();
		expect(ageDeviation(45, null)).toBeNull();
	});
});

describe('inkOnAge', () => {
	it('takes its ink from the palette, per class', () => {
		expect(inkOnAge(48.6, 48.6)).toBe(DIVERGING_SCALE.neutral.ink);
		expect(inkOnAge(34.1, 48.6)).toBe(DIVERGING_SCALE.green[2].ink);
		expect(inkOnAge(59.5, 48.6)).toBe(DIVERGING_SCALE.red[2].ink);
	});
});
