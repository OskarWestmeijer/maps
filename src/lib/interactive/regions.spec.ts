import { describe, it, expect } from 'vitest';
import { shortRegionName, TAMPERE_REGION } from './regions';

describe('shortRegionName', () => {
	it('abbreviates the compass prefixes the way Finnish does', () => {
		expect(shortRegionName('Pohjois-Pohjanmaa')).toBe('P-Pohjanmaa');
		expect(shortRegionName('Etelä-Karjala')).toBe('E-Karjala');
		expect(shortRegionName('Keski-Suomi')).toBe('K-Suomi');
		expect(shortRegionName('Varsinais-Suomi')).toBe('V-Suomi');
	});

	it('leaves names that are already short alone, hyphenated or not', () => {
		// Only the four qualifier prefixes are touched — Kanta-Häme and Päijät-Häme are names,
		// not directions, and shortening them would read as a typo.
		expect(shortRegionName('Pirkanmaa')).toBe('Pirkanmaa');
		expect(shortRegionName('Ahvenanmaa')).toBe('Ahvenanmaa');
		expect(shortRegionName('Kanta-Häme')).toBe('Kanta-Häme');
		expect(shortRegionName('Päijät-Häme')).toBe('Päijät-Häme');
	});

	it('fits the ranking table: nothing longer than 11 characters', () => {
		// The compare map's ranking gives the region its own column beside the name and the
		// score, in a 18rem panel. The longest full name is 17 characters, which doesn't fit.
		const names = [
			'Uusimaa',
			'Varsinais-Suomi',
			'Satakunta',
			'Kanta-Häme',
			'Pirkanmaa',
			'Päijät-Häme',
			'Kymenlaakso',
			'Etelä-Karjala',
			'Etelä-Savo',
			'Pohjois-Savo',
			'Pohjois-Karjala',
			'Keski-Suomi',
			'Etelä-Pohjanmaa',
			'Pohjanmaa',
			'Keski-Pohjanmaa',
			'Pohjois-Pohjanmaa',
			'Kainuu',
			'Lappi',
			'Ahvenanmaa'
		];

		expect(Math.max(...names.map((name) => shortRegionName(name).length))).toBeLessThanOrEqual(11);
		// Still one name each — shortening must not collide two regions into one label.
		expect(new Set(names.map(shortRegionName)).size).toBe(names.length);
	});
});

describe('TAMPERE_REGION', () => {
	it('lists the metro’s eight municipalities, which the geometry is checked against', () => {
		expect(TAMPERE_REGION.natcodes).toHaveLength(8);
		expect(TAMPERE_REGION.natcodes).toContain('837');
	});
});
