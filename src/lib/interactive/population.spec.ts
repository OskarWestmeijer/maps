import { describe, it, expect } from 'vitest';
import {
	aggregatePopulationStats,
	densityColorFor,
	densityOf,
	DENSITY_CLASSES,
	toPopulationData,
	type PopulationStats
} from './population';
import { NO_DATA_COLOR, type PxWebExport } from './unemployment';

/**
 * Shaped like the annual export (121w) the map ships: `[year, area]` keys and `ssaaty-`
 * prefixed columns, interleaved so the content columns are not in the order the code reads
 * them — the real file carries 21 of them around the six that are used.
 */
const px: PxWebExport = {
	columns: [
		{ code: 'timeperiod_y', text: 'Vuosi', type: 't' },
		{ code: 'alue_23_20260101', text: 'Alue', type: 'd' },
		{ code: 'ssaaty-vm01', text: 'Elävänä syntyneet', type: 'c' },
		{ code: 'ssaaty-vm11', text: 'Kuolleet', type: 'c' },
		{ code: 'ssaaty-luonvalisays', text: 'Luonnollinen väestönlisäys', type: 'c' },
		{ code: 'ssaaty-vm44', text: 'Kunnan sisäinen muutto', type: 'c' },
		{ code: 'ssaaty-koknetmuutto', text: 'Kokonaisnettomuutto', type: 'c' },
		{ code: 'ssaaty-kokmuutos', text: 'Kokonaismuutos', type: 'c' },
		{ code: 'ssaaty-vaesto', text: 'Väkiluku', type: 'c' }
	],
	data: [
		{
			key: ['2025', 'SSS'],
			values: ['45832', '59209', '-13377', '584612', '31233', '16910', '5652881']
		},
		{
			key: ['2025', 'KU091'],
			values: ['6300', '4995', '1305', '60000', '9254', '10374', '694392']
		},
		{ key: ['2025', 'KU742'], values: ['3', '18', '-15', '30', '-40', '-55', '954'] },
		// A suppressed cell must stay null rather than becoming 0.
		{ key: ['2025', 'KU060'], values: ['...', '11', '...', '44', '22', '11', '1300'] },
		// Neither the "unknown municipality" bucket nor any non-KU level belongs on the map.
		{ key: ['2025', 'KUJOU'], values: ['1', '1', '0', '0', '0', '0', '50'] },
		{ key: ['2025', 'MK01'], values: ['900', '800', '100', '9000', '500', '600', '1799629'] }
	],
	metadata: [{ source: 'Tilastokeskus, siviilisäädyn muutokset' }]
};

describe('toPopulationData', () => {
	const result = toPopulationData(px);

	it('reads each column by its suffix, not by position in `columns`', () => {
		expect(result.stats.get('091')).toEqual({
			population: 694392,
			births: 6300,
			deaths: 4995,
			naturalChange: 1305,
			netMigration: 9254,
			totalChange: 10374
		});
	});

	it('reads the monthly sibling table too, despite its other prefix and key order', () => {
		// 12as is `[area, month]` with `kuol-` columns where 121w is `[year, area]` with
		// `ssaaty-` ones. Both are the same statistics; neither shape may need a code change.
		const monthly = toPopulationData({
			columns: [
				{ code: 'alue_23_20260101', text: 'Alue', type: 'd' },
				{ code: 'timeperiod_m', text: 'Kuukausi', type: 't' },
				{ code: 'kuol-vm01', text: 'Elävänä syntyneet', type: 'c' },
				{ code: 'kuol-vm11', text: 'Kuolleet', type: 'c' },
				{ code: 'kuol-luonvalisays', text: 'Luonnollinen väestönlisäys', type: 'c' },
				{ code: 'kuol-vm44', text: 'Kunnan sisäinen muutto', type: 'c' },
				{ code: 'kuol-koknetmuutto', text: 'Kokonaisnettomuutto', type: 'c' },
				{ code: 'kuol-kokmuutos', text: 'Kokonaismuutos', type: 'c' },
				{ code: 'kuol-vaesto', text: 'Väkiluku', type: 'c' }
			],
			data: [
				{ key: ['KU091', '2025M12'], values: ['550', '516', '34', '6000', '823', '672', '694392'] }
			]
		});

		expect(monthly.period).toBe('2025M12');
		expect(monthly.stats.get('091')?.population).toBe(694392);
		expect(monthly.stats.get('091')?.naturalChange).toBe(34);
	});

	it('keys municipalities by natcode so they join the map GeoJSON', () => {
		expect([...result.stats.keys()].sort()).toEqual(['060', '091', '742']);
	});

	it('nulls suppressed figures rather than treating them as zero', () => {
		const suppressed = result.stats.get('060');

		expect(suppressed?.births).toBeNull();
		expect(suppressed?.naturalChange).toBeNull();
		// The rest of the row is still published.
		expect(suppressed?.population).toBe(1300);
	});

	it('takes the whole-country row as the national figure and keeps region rows off the map', () => {
		expect(result.national.population).toBe(5652881);
		expect(result.stats.has('01')).toBe(false);
		expect(result.stats.has('JOU')).toBe(false);
	});

	it('carries the period and source through', () => {
		expect(result.period).toBe('2025');
		expect(result.source).toBe('Tilastokeskus, siviilisäädyn muutokset');
	});
});

describe('aggregatePopulationStats', () => {
	const a: PopulationStats = {
		population: 694392,
		births: 6300,
		deaths: 4995,
		naturalChange: 1305,
		netMigration: 9254,
		totalChange: 10374
	};
	const b: PopulationStats = {
		population: 954,
		births: 3,
		deaths: 18,
		naturalChange: -15,
		netMigration: -40,
		totalChange: -55
	};

	it('sums every field, negative flows included', () => {
		expect(aggregatePopulationStats([a, b])).toEqual({
			population: 694392 + 954,
			births: 6303,
			deaths: 5013,
			naturalChange: 1290,
			netMigration: 9214,
			totalChange: 10319
		});
	});

	it('sums each field independently, so one suppressed field does not null the others', () => {
		const partial: PopulationStats = { ...b, births: null };
		const result = aggregatePopulationStats([a, partial]);

		expect(result.births).toBe(6300);
		expect(result.population).toBe(694392 + 954);
	});

	it('returns null for a field only when every entry is null', () => {
		const empty: PopulationStats = {
			population: null,
			births: null,
			deaths: null,
			naturalChange: null,
			netMigration: null,
			totalChange: null
		};

		expect(aggregatePopulationStats([empty, empty]).population).toBeNull();
	});
});

describe('densityOf', () => {
	it('divides population by land area', () => {
		expect(densityOf(694392, 214.6)?.toFixed(1)).toBe('3235.8');
	});

	it('is null when either side is missing, and never divides by zero', () => {
		expect(densityOf(null, 100)).toBeNull();
		expect(densityOf(1000, null)).toBeNull();
		expect(densityOf(1000, 0)).toBeNull();
	});
});

describe('densityColorFor', () => {
	it('is a one-hue ramp: every class has its own colour, light to dark', () => {
		const colors = DENSITY_CLASSES.map((c) => c.color);

		expect(new Set(colors).size).toBe(DENSITY_CLASSES.length);
	});

	it('picks the class the value falls in, edges included', () => {
		expect(densityColorFor(0.15)).toBe(DENSITY_CLASSES[0].color);
		expect(densityColorFor(2)).toBe(DENSITY_CLASSES[1].color);
		expect(densityColorFor(4.9)).toBe(DENSITY_CLASSES[1].color);
		expect(densityColorFor(25)).toBe(DENSITY_CLASSES[4].color);
		expect(densityColorFor(3236.1)).toBe(DENSITY_CLASSES[6].color);
	});

	it('hands an area with no density the hatch colour, not a class', () => {
		expect(densityColorFor(null)).toBe(NO_DATA_COLOR);
	});
});
