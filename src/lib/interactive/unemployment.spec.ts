import { describe, it, expect } from 'vitest';
import {
	toUnemploymentData,
	colorFor,
	NO_DATA_COLOR,
	UNEMPLOYMENT_CLASSES,
	type PxWebExport
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
		{ code: 'TYOVOIMATK', text: 'Työvoima', type: 'c' }
	],
	data: [
		{ key: ['SSS', '2026M06'], values: ['542318', '12.8', '352001', '2743596'] },
		{ key: ['KU684', '2026M06'], values: ['1494', '13.1', '529', '18440'] },
		{ key: ['KU005', '2026M06'], values: ['586', '8.4', '164', '3604'] },
		// Suppressed rate, but the labour force is still published.
		{ key: ['KU062', '2026M06'], values: ['12', '...', '...', '900'] },
		// Region-level rows and the "unknown municipality" bucket share the file.
		{ key: ['MK01', '2026M06'], values: ['100', '9.9', '50', '1000'] },
		{ key: ['ELY16', '2026M06'], values: ['1540', '5.2', '421', '15374'] },
		{ key: ['KUJOU', '2026M06'], values: ['5', '4.0', '2', '80'] }
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
			unemployed: 529
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
			unemployed: null
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

describe('colorFor', () => {
	it('returns the no-data colour for a missing figure', () => {
		expect(colorFor(null)).toBe(NO_DATA_COLOR);
	});

	it('puts a rate in the bucket whose lower bound it meets', () => {
		expect(colorFor(2.5)).toBe(UNEMPLOYMENT_CLASSES[0].color);
		expect(colorFor(8.9)).toBe(UNEMPLOYMENT_CLASSES[1].color);
		expect(colorFor(9)).toBe(UNEMPLOYMENT_CLASSES[2].color);
		expect(colorFor(19.1)).toBe(UNEMPLOYMENT_CLASSES[5].color);
	});

	it('keeps lightness falling as the rate rises, so the ramp survives colour blindness', () => {
		const luminance = (hex: string) =>
			[1, 3, 5]
				.map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
				.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
				.reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);

		const steps = UNEMPLOYMENT_CLASSES.map((b) => luminance(b.color));

		expect(steps.every((l, i) => i === 0 || l < steps[i - 1])).toBe(true);
	});
});
