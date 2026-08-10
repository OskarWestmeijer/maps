import { describe, it, expect } from 'vitest';
import {
	toUnemploymentData,
	aggregateKuntaStats,
	colorFor,
	NO_DATA_COLOR,
	DEVIATION_CLASSES,
	type PxWebExport,
	type KuntaStats
} from './unemployment';

const px: PxWebExport = {
	// Deliberately interleaved: the content columns are not in the order the code reads
	// them, and two key columns sit in front of them.
	columns: [
		{ code: 'Alue', text: 'Alue', type: 'd' },
		{ code: 'timeperiod_m', text: 'Kuukausi', type: 't' },
		{ code: 'HAKIJALOPUSSA', text: 'Työnhakijoita', type: 'c' },
		{ code: 'TYOTOSUUS', text: 'Työttömien %-osuus', type: 'c' },
		{ code: 'TYOTTOMATLOPUSSA', text: 'Työttömät työnhakijat', type: 'c' },
		{ code: 'TYOVOIMATK', text: 'Työvoima', type: 'c' },
		{ code: 'AVPAIKATLOPUSSA', text: 'Avoimet työpaikat', type: 'c' }
	],
	data: [
		{ key: ['SSS', '2026M06'], values: ['542318', '12.8', '352001', '2743596', '68000'] },
		{ key: ['KU684', '2026M06'], values: ['1494', '13.1', '529', '18440', '212'] },
		{ key: ['KU005', '2026M06'], values: ['586', '8.4', '164', '3604', '77'] },
		// Suppressed rate, but the labour force is still published.
		{ key: ['KU062', '2026M06'], values: ['12', '...', '...', '900', '4'] },
		// Region-level rows and the "unknown municipality" bucket share the file.
		{ key: ['MK01', '2026M06'], values: ['100', '9.9', '50', '1000', '30'] },
		{ key: ['ELY16', '2026M06'], values: ['1540', '5.2', '421', '15374', '400'] },
		{ key: ['KUJOU', '2026M06'], values: ['5', '4.0', '2', '80', '1'] }
	],
	metadata: [{ source: 'KEHA-keskus, Työnvälitystilasto' }]
};

describe('toUnemploymentData', () => {
	const result = toUnemploymentData(px);

	it('reads each column by code, not by position in `columns`', () => {
		// `values` holds only the content columns, so TYOTOSUUS sits at index 1 there even
		// though it is the fourth entry in `columns`.
		expect(result.stats.get('684')).toEqual({
			rate: 13.1,
			labourForce: 18440,
			jobseekers: 1494,
			unemployed: 529,
			vacancies: 212
		});
	});

	it('keys municipalities by natcode so they join the map GeoJSON', () => {
		expect([...result.stats.keys()].sort()).toEqual(['005', '062', '684']);
	});

	it('nulls suppressed figures rather than treating them as zero', () => {
		// This municipality still has a labour force; only the rate is withheld.
		expect(result.stats.get('062')).toEqual({
			rate: null,
			labourForce: 900,
			jobseekers: 12,
			unemployed: null,
			vacancies: 4
		});
	});

	it('ignores region rows and the whole-country row', () => {
		expect(result.national.rate).toBe(12.8);
		expect(result.national.labourForce).toBe(2743596);
		expect(result.stats.has('01')).toBe(false);
	});

	it('carries the period and source through', () => {
		expect(result.period).toBe('2026M06');
		expect(result.source).toBe('KEHA-keskus, Työnvälitystilasto');
	});
});

describe('aggregateKuntaStats', () => {
	it('sums fields and recomputes the rate from the sums, not by averaging per-kunta rates', () => {
		// A big and a small kunta with very different rates: averaging the rates (13% and 8%)
		// would give ~10.5%, but the weighted rate from the sums is what should come out.
		const big: KuntaStats = {
			rate: 13.1,
			labourForce: 18440,
			jobseekers: 1494,
			unemployed: 529,
			vacancies: 212
		};
		const small: KuntaStats = {
			rate: 8.4,
			labourForce: 3604,
			jobseekers: 586,
			unemployed: 164,
			vacancies: 77
		};

		expect(aggregateKuntaStats([big, small])).toEqual({
			rate: ((529 + 164) / (18440 + 3604)) * 100,
			labourForce: 18440 + 3604,
			jobseekers: 1494 + 586,
			unemployed: 529 + 164,
			vacancies: 212 + 77
		});
	});

	it('sums each field independently, so one suppressed field does not null the others', () => {
		// Mirrors the Åland-style case in the source data: a rate can be suppressed while the
		// labour force is still published.
		const suppressedRate: KuntaStats = {
			rate: null,
			labourForce: 900,
			jobseekers: 12,
			unemployed: null,
			vacancies: 4
		};
		const known: KuntaStats = {
			rate: 13.1,
			labourForce: 18440,
			jobseekers: 1494,
			unemployed: 529,
			vacancies: 212
		};

		const result = aggregateKuntaStats([suppressedRate, known]);

		expect(result.labourForce).toBe(900 + 18440);
		expect(result.jobseekers).toBe(12 + 1494);
		// `unemployed` is known for one of the two, so it sums rather than going null.
		expect(result.unemployed).toBe(529);
		expect(result.rate).toBe((529 / (900 + 18440)) * 100);
	});

	it('returns null for a field only when every entry is null', () => {
		const allSuppressed: KuntaStats = {
			rate: null,
			labourForce: null,
			jobseekers: null,
			unemployed: null,
			vacancies: null
		};

		expect(aggregateKuntaStats([allSuppressed, allSuppressed])).toEqual({
			rate: null,
			labourForce: null,
			jobseekers: null,
			unemployed: null,
			vacancies: null
		});
	});
});

describe('colorFor', () => {
	// The national rate the scale diverges around, matching the current export.
	const national = 12.8;

	const luminance = (hex: string) =>
		[1, 3, 5]
			.map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
			.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
			.reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);

	it('returns the no-data colour for a missing figure', () => {
		expect(colorFor(null, national)).toBe(NO_DATA_COLOR);
	});

	it('buckets by distance from the reference rate, not by the rate itself', () => {
		// 9,4 % is a low rate in absolute terms but only 3,4 points under the national one,
		// so it lands in the middle green — not the darkest.
		expect(colorFor(9.4, national)).toBe(DEVIATION_CLASSES[1].color);
		// The same rate against a lower reference is 2,9 points above average: red, not green.
		expect(colorFor(9.4, 6.5)).toBe(DEVIATION_CLASSES[5].color);
	});

	it('gives the neutral midpoint to rates sitting on the reference', () => {
		expect(colorFor(national, national)).toBe(DEVIATION_CLASSES[3].color);
		expect(colorFor(national + 0.5, national)).toBe(DEVIATION_CLASSES[3].color);
		expect(colorFor(national - 0.5, national)).toBe(DEVIATION_CLASSES[3].color);
	});

	it('reaches the extreme classes at the real ends of the data', () => {
		// Luoto is the lowest municipality (2.5 %) and Outokumpu the highest (19.1 %).
		expect(colorFor(2.5, national)).toBe(DEVIATION_CLASSES[0].color);
		expect(colorFor(19.1, national)).toBe(DEVIATION_CLASSES[6].color);
	});

	it('falls back to the neutral class when there is no reference to diverge around', () => {
		expect(colorFor(9.4, null)).toBe(DEVIATION_CLASSES[3].color);
	});

	it('keeps each arm darkening away from the midpoint, so it survives colour blindness', () => {
		// Both arms are single-hue ramps running light (at the neutral midpoint) to dark (at
		// the extreme), which is what preserves magnitude when hue collapses. Validated in
		// full by the `dataviz` skill's validate_palette.js --ordinal; this pins the property.
		const below = DEVIATION_CLASSES.slice(0, 3).map((b) => luminance(b.color));
		const above = DEVIATION_CLASSES.slice(4).map((b) => luminance(b.color));

		// Green arm is ordered dark -> light as it approaches the midpoint.
		expect(below.every((l, i) => i === 0 || l > below[i - 1])).toBe(true);
		// Red arm runs light -> dark leaving the midpoint.
		expect(above.every((l, i) => i === 0 || l < above[i - 1])).toBe(true);
		// The midpoint is lighter than either neighbour, as a diverging midpoint must be.
		expect(luminance(DEVIATION_CLASSES[3].color)).toBeGreaterThan(below[2]);
		expect(luminance(DEVIATION_CLASSES[3].color)).toBeGreaterThan(above[0]);
	});
});
