import { describe, it, expect } from 'vitest';
import { assertCompleteAssignment, assignToRegions } from './membership';
import type { KuntaCollection } from './finland';

/** A rectangle, closed, wound counter-clockwise. */
function box(
	namefin: string,
	natcode: string,
	[x1, y1]: [number, number],
	[x2, y2]: [number, number]
) {
	return {
		type: 'Feature' as const,
		properties: { natcode, namefin },
		geometry: {
			type: 'MultiPolygon' as const,
			coordinates: [
				[
					[
						[x1, y1],
						[x2, y1],
						[x2, y2],
						[x1, y2],
						[x1, y1]
					]
				]
			]
		}
	};
}

/** Two regions side by side, splitting the plane at x = 100. */
const regions: KuntaCollection = {
	type: 'FeatureCollection',
	features: [box('West', '01', [0, 0], [100, 100]), box('East', '02', [100, 0], [200, 100])]
};

describe('assignToRegions', () => {
	it('places each municipality in the region containing its centroid', () => {
		const kunnat: KuntaCollection = {
			type: 'FeatureCollection',
			features: [
				box('Alfa', '001', [10, 10], [30, 30]),
				box('Bravo', '002', [110, 10], [130, 30]),
				box('Charlie', '003', [140, 40], [160, 60])
			]
		};

		const { regionOf, membersOf } = assignToRegions(kunnat, regions);

		expect(regionOf.get('001')).toBe('01');
		expect(regionOf.get('002')).toBe('02');
		expect(membersOf.get('02')).toEqual(['002', '003']);
	});

	it('uses the largest ring, so an island cannot drag the centroid into the wrong region', () => {
		// The mainland sits well inside West; a far-flung islet lies over in East. Averaging
		// both rings would put the centroid near the border — the largest ring must decide.
		const withIsland: KuntaCollection = {
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					properties: { natcode: '004', namefin: 'Delta' },
					geometry: {
						type: 'MultiPolygon',
						coordinates: [
							box('Delta', '004', [10, 10], [90, 90]).geometry.coordinates[0],
							box('Islet', '004', [190, 90], [195, 95]).geometry.coordinates[0]
						]
					}
				}
			]
		};

		expect(assignToRegions(withIsland, regions).regionOf.get('004')).toBe('01');
	});

	it('reports a municipality that lands in no region instead of guessing', () => {
		const offshore: KuntaCollection = {
			type: 'FeatureCollection',
			features: [box('Echo', '005', [300, 300], [320, 320])]
		};

		const result = assignToRegions(offshore, regions);

		expect(result.unassigned).toEqual(['Echo']);
		expect(result.regionOf.size).toBe(0);
	});
});

describe('assertCompleteAssignment', () => {
	const kunnat: KuntaCollection = {
		type: 'FeatureCollection',
		features: [box('Alfa', '001', [10, 10], [30, 30]), box('Bravo', '002', [110, 10], [130, 30])]
	};

	it('returns the membership when every municipality is placed', () => {
		const membership = assertCompleteAssignment(assignToRegions(kunnat, regions), {
			kuntas: 2,
			regions: 2
		});

		expect(membership.regionOf.size).toBe(2);
	});

	it('throws rather than shipping a map whose regions silently omit municipalities', () => {
		const withOffshore: KuntaCollection = {
			type: 'FeatureCollection',
			features: [...kunnat.features, box('Echo', '005', [300, 300], [320, 320])]
		};

		expect(() =>
			assertCompleteAssignment(assignToRegions(withOffshore, regions), { kuntas: 3, regions: 2 })
		).toThrow(/Echo/);
	});

	it('throws when a region ends up with no municipalities at all', () => {
		const westOnly: KuntaCollection = {
			type: 'FeatureCollection',
			features: [box('Alfa', '001', [10, 10], [30, 30])]
		};

		expect(() =>
			assertCompleteAssignment(assignToRegions(westOnly, regions), { kuntas: 1, regions: 2 })
		).toThrow(/1\/2 regions/);
	});
});
