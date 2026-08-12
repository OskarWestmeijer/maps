import { describe, it, expect } from 'vitest';
import {
	aggregatePopulationStats,
	changeColorFor,
	changeLabelFor,
	changePer1000,
	CHANGE_CLASSES,
	densityOf,
	inkOnChange,
	toPopulationData,
	type PopulationStats
} from './population';
import { DIVERGING_SCALE, NO_DATA_COLOR, type PxWebExport } from './unemployment';

/**
 * Shaped like the annual export (121w) the map ships: `[year, area]` keys and `ssaaty-`
 * prefixed columns, interleaved so the content columns are not in the order the code reads
 * them — the real file carries 21 of them around the seven that are used.
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
		{ code: 'ssaaty-vakorjaus', text: 'Väkiluvun korjaus', type: 'c' },
		{ code: 'ssaaty-kokmuutos', text: 'Kokonaismuutos', type: 'c' },
		{ code: 'ssaaty-vaesto', text: 'Väkiluku', type: 'c' }
	],
	data: [
		{
			key: ['2025', 'SSS'],
			values: ['45832', '59209', '-13377', '584612', '31233', '-946', '16910', '5652881']
		},
		{
			key: ['2025', 'KU091'],
			values: ['6300', '4995', '1305', '60000', '9254', '-185', '10374', '694392']
		},
		{ key: ['2025', 'KU742'], values: ['3', '18', '-15', '30', '-40', '0', '-55', '954'] },
		// A suppressed cell must stay null rather than becoming 0.
		{ key: ['2025', 'KU060'], values: ['...', '11', '...', '44', '22', '0', '11', '1300'] },
		// Neither the "unknown municipality" bucket nor any non-KU level belongs on the map.
		{ key: ['2025', 'KUJOU'], values: ['1', '1', '0', '0', '0', '0', '0', '50'] },
		{ key: ['2025', 'MK01'], values: ['900', '800', '100', '9000', '500', '0', '600', '1799629'] }
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
			correction: -185,
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
				{ code: 'kuol-vakorjaus', text: 'Väkiluvun korjaus', type: 'c' },
				{ code: 'kuol-kokmuutos', text: 'Kokonaismuutos', type: 'c' },
				{ code: 'kuol-vaesto', text: 'Väkiluku', type: 'c' }
			],
			data: [
				{
					key: ['KU091', '2025M12'],
					values: ['550', '516', '34', '6000', '823', '-185', '672', '694392']
				}
			]
		});

		expect(monthly.period).toBe('2025M12');
		expect(monthly.stats.get('091')?.population).toBe(694392);
		expect(monthly.stats.get('091')?.naturalChange).toBe(34);
	});

	it('carries the register correction, without which the flows do not add up to the total', () => {
		// Kokonaismuutos is *not* natural change plus net migration: Väkiluvun korjaus is the
		// third term. Reading it is what lets the panel show three rows that sum to the headline
		// instead of two that visibly do not.
		const helsinki = result.stats.get('091')!;

		expect(helsinki.naturalChange! + helsinki.netMigration! + helsinki.correction!).toBe(
			helsinki.totalChange
		);
		expect(result.national.correction).toBe(-946);
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
		correction: -185,
		totalChange: 10374
	};
	const b: PopulationStats = {
		population: 954,
		births: 3,
		deaths: 18,
		naturalChange: -15,
		netMigration: -40,
		correction: 0,
		totalChange: -55
	};

	it('sums every field, negative flows included', () => {
		expect(aggregatePopulationStats([a, b])).toEqual({
			population: 694392 + 954,
			births: 6303,
			deaths: 5013,
			naturalChange: 1290,
			netMigration: 9214,
			correction: -185,
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
			correction: null,
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

describe('changePer1000', () => {
	it("scales change by the area's own size, so a village and a city compare", () => {
		// Kökar lost 16 of 211; Helsinki gained 10 374 of 694 392. The city's change is 600×
		// larger in people and a third the size as a rate — which is the point of the measure.
		expect(changePer1000(-16, 211)?.toFixed(1)).toBe('-75.8');
		expect(changePer1000(10374, 694392)?.toFixed(1)).toBe('14.9');
	});

	it('is null when either side is missing, and never divides by zero', () => {
		expect(changePer1000(null, 1000)).toBeNull();
		expect(changePer1000(10, null)).toBeNull();
		expect(changePer1000(10, 0)).toBeNull();
	});
});

describe('changeColorFor', () => {
	it('is diverging: a neutral midpoint with one hue either side of zero', () => {
		const flat = CHANGE_CLASSES[3];

		expect(flat.min).toBe(-2);
		// Symmetric band edges, so a loss and a gain of the same size sit the same distance out.
		expect(CHANGE_CLASSES.map((c) => c.min)).toEqual([-Infinity, -15, -7, -2, 2, 7, 15]);
		expect(new Set(CHANGE_CLASSES.map((c) => c.color)).size).toBe(CHANGE_CLASSES.length);
	});

	it('picks the class the value falls in, edges included', () => {
		expect(changeColorFor(-75.8)).toBe(CHANGE_CLASSES[0].color);
		expect(changeColorFor(-15)).toBe(CHANGE_CLASSES[1].color);
		expect(changeColorFor(-2.1)).toBe(CHANGE_CLASSES[2].color);
		// Bands run [min, next), so an edge belongs to the class above it: −2 is the bottom of
		// "about flat", not the top of "shrinking slowly".
		expect(changeColorFor(-2)).toBe(CHANGE_CLASSES[3].color);
		// Zero is the anchor and must land in the neutral class, not either arm.
		expect(changeColorFor(0)).toBe(CHANGE_CLASSES[3].color);
		expect(changeColorFor(2)).toBe(CHANGE_CLASSES[4].color);
		expect(changeColorFor(23.6)).toBe(CHANGE_CLASSES[6].color);
	});

	it('hands an area with no figure the hatch colour, not a class', () => {
		expect(changeColorFor(null)).toBe(NO_DATA_COLOR);
	});

	it('names the direction in words, which is what the chip puts on the colour', () => {
		expect(changeLabelFor(-30)).toBe('shrinking fast');
		expect(changeLabelFor(0)).toBe('about flat');
		expect(changeLabelFor(20)).toBe('growing fast');
		expect(changeLabelFor(null)).toBe('no data');
	});

	it("takes each class's measured ink, so chip text stays legible on every fill", () => {
		expect(inkOnChange(-30)).toBe('#ffffff');
		expect(inkOnChange(-5)).toBe('var(--map-ink)');
		expect(inkOnChange(0)).toBe('var(--map-ink)');
		expect(inkOnChange(5)).toBe('var(--map-ink)');
		expect(inkOnChange(20)).toBe('#ffffff');
	});

	it("reuses the unemployment map's arms, so green and red mean one thing site-wide", () => {
		// Growing takes the green the other map spends on "below the national rate"; shrinking
		// takes its red. Sharing `DIVERGING_SCALE` is what stops the two drifting apart.
		expect(changeColorFor(20)).toBe(DIVERGING_SCALE.green[2].color);
		expect(changeColorFor(0)).toBe(DIVERGING_SCALE.neutral.color);
		expect(changeColorFor(-30)).toBe(DIVERGING_SCALE.red[2].color);
	});
});
