import { describe, it, expect } from 'vitest';
import {
	aggregateEducationStats,
	EDUCATION_CLASSES,
	EMPTY_EDUCATION_STATS,
	educationColorFor,
	educationDeviation,
	inkOnEducation,
	medianShare,
	shareOf,
	toEducationData
} from './education';
import { DIVERGING_SCALE, NO_DATA_COLOR, type PxWebExport } from './unemployment';

/**
 * Shaped like the real 12bs export: `[year, area]` keys — the other way round from 14ww — several
 * area levels in one file including the `MA` pair no other export carries, and the near-miss
 * column codes interleaved so a loose match would read the wrong level of education. The real file
 * carries fifteen measures around the eight that are used.
 */
const px: PxWebExport = {
	columns: [
		{ code: 'timeperiod_y', text: 'Vuosi', type: 't' },
		{ code: 'alue_23_20260101', text: 'Alue 2026', type: 'd' },
		{ code: 'vaesto_15_', text: '15 vuotta täyttänyt väestö 31.12', type: 'c' },
		{ code: 'kaste0', text: 'Ilman perusasteen jälkeistä tutkintoa', type: 'c' },
		{ code: 'kaste0osuus', text: 'Ilman perusasteen jälkeistä tutkintoa, %', type: 'c' },
		{ code: 'kaste3T8', text: 'Perusasteen jälkeisen tutkinnon suorittaneet', type: 'c' },
		{ code: 'kaste3T8osuus', text: 'Perusasteen jälkeisen tutkinnon suorittaneet, %', type: 'c' },
		{ code: 'kaste3', text: 'Toisen asteen tutkinnon suorittaneet', type: 'c' },
		{ code: 'kaste3osuus', text: 'Toisen asteen tutkinnon suorittaneet, %', type: 'c' },
		{ code: 'kaste4', text: 'Erikoisammattikoulutusaste', type: 'c' },
		{ code: 'kaste5T8', text: 'Korkea-asteen tutkinnon suorittaneet', type: 'c' },
		{ code: 'kaste5T8osuus', text: 'Korkea-asteen tutkinnon suorittaneet, %', type: 'c' },
		{ code: 'kaste5', text: 'Alimman korkea-asteen tutkinnon suorittaneet', type: 'c' },
		{ code: 'vktm', text: 'Väestön koulutustasomittain', type: 'c' }
	],
	data: [
		{
			key: ['2025', 'SSS'],
			values: [
				'4845151',
				'1190339',
				'24.6',
				'3654812',
				'75.4',
				'1922446',
				'39.7',
				'60134',
				'1672232',
				'34.5',
				'390982',
				'403.2'
			]
		},
		{
			key: ['2025', 'KU837'],
			values: [
				'200000',
				'40000',
				'20.0',
				'160000',
				'80.0',
				'78000',
				'39.0',
				'2000',
				'80000',
				'40.0',
				'20000',
				'453.9'
			]
		},
		{
			key: ['2025', 'KU604'],
			values: [
				'100000',
				'20000',
				'20.0',
				'80000',
				'80.0',
				'34000',
				'34.0',
				'1000',
				'45000',
				'45.0',
				'10000',
				'488.4'
			]
		},
		// A suppressed cell — 12bs writes a bare "." rather than 12r5's "..." — must stay null
		// rather than becoming 0.
		{
			key: ['2025', 'KU035'],
			values: [
				'393',
				'112',
				'28.5',
				'281',
				'71.5',
				'141',
				'35.9',
				'.',
				'140',
				'35.6',
				'36',
				'384.9'
			]
		},
		{
			key: ['2025', 'MK06'],
			values: [
				'450000',
				'110000',
				'24.4',
				'340000',
				'75.6',
				'180000',
				'40.0',
				'5000',
				'163000',
				'36.2',
				'40000',
				'421.9'
			]
		},
		// Mainland Finland and Åland: two area levels no other export on the site carries, and
		// neither belongs on a map of municipalities or of maakunnat.
		{
			key: ['2025', 'MA1'],
			values: ['4800000', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1']
		},
		{
			key: ['2025', 'MA2'],
			values: ['25000', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1']
		}
	],
	metadata: [{ source: 'Tilastokeskus, väestön koulutusrakenne' }]
};

describe('toEducationData', () => {
	const result = toEducationData(px);

	it('reads each column by its suffix, not by position in `columns`', () => {
		expect(result.stats.get('837')).toEqual({
			population15: 200000,
			noPostBasic: 40000,
			noPostBasicShare: 20,
			secondLevel: 78000,
			secondLevelShare: 39,
			tertiary: 80000,
			tertiaryShare: 40,
			levelIndex: 453.9
		});
	});

	it('does not confuse `kaste3` and `kaste5T8` with the codes that contain them', () => {
		// `kaste3T8`, `kaste3osuus`, `kaste5` and `kaste5T8osuus` all sit in the same export and
		// all carry different values here — a `startsWith` would silently read one of them.
		const tampere = result.stats.get('837');

		expect(tampere?.secondLevel).toBe(78000);
		expect(tampere?.tertiary).toBe(80000);
	});

	it('reads the period and the source out of the file rather than the filename', () => {
		expect(result.period).toBe('2025');
		expect(result.source).toBe('Tilastokeskus, väestön koulutusrakenne');
	});

	it('takes the whole-country figures from the SSS row', () => {
		expect(result.national.tertiaryShare).toBe(34.5);
		expect(result.national.levelIndex).toBe(403.2);
	});

	it('keeps a suppressed cell null instead of reading it as zero', () => {
		// Brändö publishes no erikoisammattikoulutusaste count; every other figure is real.
		expect(result.stats.get('035')?.tertiaryShare).toBe(35.6);
		expect(result.stats.get('035')?.population15).toBe(393);
	});

	it('leaves out the area levels the map never draws', () => {
		// MK when municipalities were asked for, and the MA pair on every read.
		expect([...result.stats.keys()].sort()).toEqual(['035', '604', '837']);
	});

	it('keys by the region rows when asked for them', () => {
		const regions = toEducationData(px, 'MK');

		expect([...regions.stats.keys()]).toEqual(['06']);
		expect(regions.stats.get('06')?.tertiaryShare).toBe(36.2);
		// `national` is the SSS row whichever level was requested.
		expect(regions.national.tertiaryShare).toBe(34.5);
	});
});

describe('aggregateEducationStats', () => {
	const rolled = aggregateEducationStats([
		toEducationData(px).stats.get('837')!,
		toEducationData(px).stats.get('604')!
	]);

	it('recomputes the share from the summed counts rather than averaging the shares', () => {
		// 125 000 of 300 000, not the (40 + 45) / 2 = 42,5 an unweighted mean would give.
		expect(rolled.tertiary).toBe(125000);
		expect(rolled.population15).toBe(300000);
		expect(rolled.tertiaryShare).toBeCloseTo(41.667, 3);
	});

	it('nulls the education level index, which has no exact weight in this export', () => {
		// vktm averages the 20+ population; only the 15+ headcount is published.
		expect(rolled.levelIndex).toBeNull();
	});

	it('refuses to understate a total when a member is suppressed', () => {
		const withHole = aggregateEducationStats([
			toEducationData(px).stats.get('837')!,
			{ ...EMPTY_EDUCATION_STATS, population15: 1000 }
		]);

		expect(withHole.tertiary).toBeNull();
		expect(withHole.tertiaryShare).toBeNull();
	});

	it('is null-valued rather than zero-valued for an empty list', () => {
		expect(aggregateEducationStats([])).toEqual(EMPTY_EDUCATION_STATS);
	});
});

describe('shareOf', () => {
	it('is null when either figure is missing or the base is empty', () => {
		expect(shareOf(null, 100)).toBeNull();
		expect(shareOf(10, null)).toBeNull();
		expect(shareOf(10, 0)).toBeNull();
	});
});

describe('educationColorFor', () => {
	// The real 2025 midpoint: half of the 308 municipalities sit above it, half below.
	const MEDIAN = 24.5;

	it('hatches an area with no published share rather than colouring it', () => {
		expect(educationColorFor(null, MEDIAN)).toBe(NO_DATA_COLOR);
	});

	it('runs red through grey to green across the seven classes', () => {
		// Deviations of −11,5 / −4 / −2 / 0 / +2,5 / +6 / +36,6 points from the median — the last
		// is Kauniainen, the first Kivijärvi.
		const shares = [13, 20.5, 22.5, 24.5, 27, 30.5, 61.1];

		expect(shares.map((s) => educationColorFor(s, MEDIAN))).toEqual(
			EDUCATION_CLASSES.map((c) => c.color)
		);
	});

	it('puts the median municipality itself in the neutral class', () => {
		expect(educationColorFor(MEDIAN, MEDIAN)).toBe(DIVERGING_SCALE.neutral.color);
	});

	it('puts each band edge in the class above it', () => {
		expect(educationColorFor(MEDIAN - 5, MEDIAN)).toBe(EDUCATION_CLASSES[1].color);
		expect(educationColorFor(MEDIAN - 5.1, MEDIAN)).toBe(EDUCATION_CLASSES[0].color);
		expect(educationColorFor(MEDIAN + 9, MEDIAN)).toBe(EDUCATION_CLASSES[6].color);
	});

	it('pivots on the reference it is given, so every tab can pass the same one', () => {
		// The property that keeps a municipality's colour still when the tab flips: the scale
		// never derives its own midpoint from whatever areas happen to be on screen.
		expect(educationColorFor(30, 24.5)).not.toBe(educationColorFor(30, 34.5));
	});

	it('is neutral rather than crashing when the reference has not loaded', () => {
		expect(educationColorFor(30, null)).toBe(DIVERGING_SCALE.neutral.color);
	});
});

describe('educationDeviation', () => {
	it('is the gap in percentage points, signed', () => {
		expect(educationDeviation(46.6, 24.5)).toBeCloseTo(22.1, 5);
		expect(educationDeviation(13, 24.5)).toBeCloseTo(-11.5, 5);
	});

	it('is null when either figure is missing', () => {
		expect(educationDeviation(null, 24.5)).toBeNull();
		expect(educationDeviation(30, null)).toBeNull();
	});
});

describe('medianShare', () => {
	it('averages the two middle values for an even count', () => {
		expect(medianShare([10, 20, 30, 40])).toBe(25);
	});

	it('takes the middle value for an odd count, in any input order', () => {
		expect(medianShare([30, 10, 20])).toBe(20);
	});

	it('ignores areas with no published share rather than counting them as zero', () => {
		expect(medianShare([10, null, 20, null, 30])).toBe(20);
	});

	it('is null when nothing is published', () => {
		expect(medianShare([])).toBeNull();
		expect(medianShare([null, null])).toBeNull();
	});
});

describe('inkOnEducation', () => {
	it('takes its ink from the palette, per class', () => {
		const MEDIAN = 24.5;

		expect(inkOnEducation(MEDIAN, MEDIAN)).toBe(DIVERGING_SCALE.neutral.ink);
		expect(inkOnEducation(13, MEDIAN)).toBe(DIVERGING_SCALE.red[2].ink);
		expect(inkOnEducation(61.1, MEDIAN)).toBe(DIVERGING_SCALE.green[2].ink);
	});
});
