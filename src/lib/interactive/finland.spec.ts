import { describe, it, expect } from 'vitest';
import { toFinlandMap, type KuntaCollection } from './finland';

function feature(namefin: string, coordinates: number[][][][]) {
	return {
		type: 'Feature' as const,
		properties: {
			natcode: namefin === 'Bravo' ? '002' : '001',
			namefin
		},
		geometry: { type: 'MultiPolygon' as const, coordinates }
	};
}

const collection: KuntaCollection = {
	type: 'FeatureCollection',
	features: [
		// Listed second alphabetically, but first in the input — checks the sort.
		feature('Bravo', [
			[
				[
					[300, 7000],
					[400, 7000],
					[400, 7100],
					[300, 7000]
				]
			]
		]),
		// Two polygons, so this one exercises the multi-subpath join.
		feature('Alfa', [
			[
				[
					[100.4, 6000.6],
					[200, 6000],
					[200, 6100],
					[100.4, 6000.6]
				]
			],
			[
				[
					[0, 5000],
					[50, 5000],
					[50, 5050],
					[0, 5000]
				]
			]
		])
	]
};

describe('toFinlandMap', () => {
	const { kuntas, viewBox } = toFinlandMap(collection);

	it('sorts municipalities by Finnish name', () => {
		expect(kuntas.map((k) => k.name)).toEqual(['Alfa', 'Bravo']);
	});

	it('flips the Y axis and rounds coordinates to whole metres', () => {
		expect(kuntas[1].d).toBe('M300,-7000L400,-7000L400,-7100L300,-7000Z');
	});

	it('emits one subpath per ring so islands stay a single element', () => {
		expect(kuntas[0].d).toBe(
			'M100,-6001L200,-6000L200,-6100L100,-6001Z' + 'M0,-5000L50,-5000L50,-5050L0,-5000Z'
		);
	});

	it('derives the viewBox from the flipped bounds', () => {
		// x: 0..400, y: 5000..7100 -> flipped top edge is -7100
		expect(viewBox).toBe('0 -7100 400 2100');
	});

	it('maps the human readable properties', () => {
		expect(kuntas[0]).toMatchObject({
			name: 'Alfa',
			code: '001'
		});
	});

	it('leaves every figure null when no statistics are supplied', () => {
		expect(kuntas[0]).toMatchObject({
			rate: null,
			labourForce: null,
			jobseekers: null,
			unemployed: null
		});
	});

	it('merges statistics in by natcode', () => {
		const stats = new Map([
			['002', { rate: 13.1, labourForce: 7747, jobseekers: 1494, unemployed: 1013 }]
		]);
		const merged = toFinlandMap(collection, stats).kuntas;

		expect(merged[1]).toMatchObject({ name: 'Bravo', rate: 13.1, labourForce: 7747 });
		// Alfa has no row in the statistics, so it must stay null rather than inherit.
		expect(merged[0].rate).toBeNull();
	});
});
