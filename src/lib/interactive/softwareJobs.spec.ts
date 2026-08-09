import { describe, it, expect } from 'vitest';
import {
	toSoftwareJobsData,
	aggregateSoftwareJobStats,
	OCCUPATION_GROUPS,
	type SoftwareJobStats
} from './softwareJobs';
import type { PxWebExport } from './unemployment';

const px: PxWebExport = {
	columns: [
		{ code: 'Alue', text: 'Alue', type: 'd' },
		{ code: 'Ammattiryhmä', text: 'Ammattiryhmä', type: 'd' },
		{ code: 'timeperiod_m', text: 'Kuukausi', type: 't' },
		{ code: 'TYOTTOMATLOPUSSA', text: 'Työttömät työnhakijat', type: 'c' },
		{ code: 'AVPAIKATLOPUSSA', text: 'Avoimet työpaikat', type: 'c' }
	],
	data: [
		// Whole country, all three occupation groups known.
		{ key: ['SSS', '2513', '2026M06'], values: ['712', '20'] },
		{ key: ['SSS', '2514', '2026M06'], values: ['1288', '34'] },
		{ key: ['SSS', '2519', '2026M06'], values: ['554', '43'] },
		// A municipality where every group is known: sums plainly.
		{ key: ['KU091', '2513', '2026M06'], values: ['193', '5'] },
		{ key: ['KU091', '2514', '2026M06'], values: ['187', '3'] },
		{ key: ['KU091', '2519', '2026M06'], values: ['124', '2'] },
		// A municipality where vacancies are suppressed for two of the three groups: the sum
		// is a lower bound, flagged rather than silently understated.
		{ key: ['KU020', '2513', '2026M06'], values: ['3', '...'] },
		{ key: ['KU020', '2514', '2026M06'], values: ['0', '0'] },
		{ key: ['KU020', '2519', '2026M06'], values: ['2', '...'] },
		// A municipality suppressed on every group for one measure: null, not zero.
		{ key: ['KU005', '2513', '2026M06'], values: ['...', '0'] },
		{ key: ['KU005', '2514', '2026M06'], values: ['...', '0'] },
		{ key: ['KU005', '2519', '2026M06'], values: ['...', '0'] },
		// Region rows share the file and must be ignored, like in the register export.
		{ key: ['ELY16', '2513', '2026M06'], values: ['40', '2'] }
	],
	metadata: [{ source: 'KEHA-keskus, Työnvälitystilasto' }]
};

describe('toSoftwareJobsData', () => {
	const result = toSoftwareJobsData(px);

	it('sums the three occupation groups per municipality', () => {
		expect(result.stats.get('091')).toEqual({
			unemployed: 193 + 187 + 124,
			unemployedIsMinimum: false,
			vacancies: 5 + 3 + 2,
			vacanciesIsMinimum: false
		});
	});

	it('flags a sum as a minimum when only some groups were suppressed', () => {
		const kunta = result.stats.get('020');

		expect(kunta?.vacancies).toBe(0); // only the known group (0) contributes
		expect(kunta?.vacanciesIsMinimum).toBe(true);
		expect(kunta?.unemployed).toBe(3 + 0 + 2);
		expect(kunta?.unemployedIsMinimum).toBe(false);
	});

	it('nulls a figure suppressed on every group rather than treating it as zero', () => {
		expect(result.stats.get('005')).toEqual({
			unemployed: null,
			unemployedIsMinimum: false,
			vacancies: 0,
			vacanciesIsMinimum: false
		});
	});

	it('sums the whole-country row separately from the municipalities', () => {
		expect(result.national).toEqual({
			unemployed: 712 + 1288 + 554,
			unemployedIsMinimum: false,
			vacancies: 20 + 34 + 43,
			vacanciesIsMinimum: false
		});
		expect(result.stats.has('SS')).toBe(false);
	});

	it('ignores region rows', () => {
		expect(result.stats.has('16')).toBe(false);
	});

	it('carries the period and source through', () => {
		expect(result.period).toBe('2026M06');
		expect(result.source).toBe('KEHA-keskus, Työnvälitystilasto');
	});
});

describe('aggregateSoftwareJobStats', () => {
	it('sums unemployed and vacancies across the list', () => {
		const a: SoftwareJobStats = {
			unemployed: 224,
			unemployedIsMinimum: false,
			vacancies: 35,
			vacanciesIsMinimum: false
		};
		const b: SoftwareJobStats = {
			unemployed: 7,
			unemployedIsMinimum: false,
			vacancies: 0,
			vacanciesIsMinimum: false
		};

		expect(aggregateSoftwareJobStats([a, b])).toEqual({
			unemployed: 231,
			unemployedIsMinimum: false,
			vacancies: 35,
			vacanciesIsMinimum: false
		});
	});

	it('sums known values even when one entry is null, and ORs the minimum flags', () => {
		const known: SoftwareJobStats = {
			unemployed: 5,
			unemployedIsMinimum: false,
			vacancies: 0,
			vacanciesIsMinimum: true
		};
		const suppressed: SoftwareJobStats = {
			unemployed: null,
			unemployedIsMinimum: false,
			vacancies: null,
			vacanciesIsMinimum: false
		};

		expect(aggregateSoftwareJobStats([known, suppressed])).toEqual({
			unemployed: 5,
			unemployedIsMinimum: false,
			vacancies: 0,
			vacanciesIsMinimum: true
		});
	});

	it('returns null for a field only when every entry is null', () => {
		const allSuppressed: SoftwareJobStats = {
			unemployed: null,
			unemployedIsMinimum: false,
			vacancies: null,
			vacanciesIsMinimum: false
		};

		expect(aggregateSoftwareJobStats([allSuppressed, allSuppressed])).toEqual({
			unemployed: null,
			unemployedIsMinimum: false,
			vacancies: null,
			vacanciesIsMinimum: false
		});
	});
});

describe('OCCUPATION_GROUPS', () => {
	it('has a Finnish label for each of the three codes the export carries', () => {
		expect(Object.keys(OCCUPATION_GROUPS).sort()).toEqual(['2513', '2514', '2519']);
	});
});
