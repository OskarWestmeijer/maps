/**
 * Works out which maakunta each municipality belongs to, by geometry.
 *
 * Why this exists: nothing in this repo's data carries a kunta → maakunta membership list.
 * The unemployment export sidesteps the problem by shipping pre-aggregated `MK` rows, but
 * the population export (121w) has none — it is the whole country plus the 308
 * municipalities and nothing in between — and the maakunta GeoJSON carries no `landarea`
 * either. Both of the Region tab's inputs therefore have to be rolled up from
 * municipalities, which needs a membership map.
 *
 * The alternative was hand-maintaining 308 assignments (the way `regions.ts` hand-maintains
 * 8). Deriving them from the two geometry files instead keeps them correct by construction:
 * replace either file and the mapping follows.
 *
 * Method: assign a municipality to the maakunta whose polygon contains the municipality's
 * centroid. Two details make that safe on these simplified files:
 *
 * - the centroid is taken from the municipality's **largest ring**, not all its rings, so a
 *   coastal municipality's archipelago can't drag the point out to sea; and
 * - the result is checked, not trusted — `assertCompleteAssignment` fails the build if any
 *   municipality lands in zero or several maakunnat.
 *
 * Cross-checked against the unemployment export's own `MK` rows when it was written: summing
 * each derived group's municipal `TYOTTOMATLOPUSSA` reproduced all 19 official region totals
 * exactly (bar Ahvenanmaa, which differs only by its suppressed municipal cells), and the
 * summed land areas match the published maakunta figures.
 */

import type { KuntaCollection, KuntaFeature } from './finland';

type Point = [number, number];

/** Twice the signed area of a ring — sign carries the winding, which `centroidOf` needs. */
function ringArea(ring: number[][]): number {
	let sum = 0;

	for (let i = 0; i < ring.length - 1; i++) {
		const [x1, y1] = ring[i];
		const [x2, y2] = ring[i + 1];

		sum += x1 * y2 - x2 * y1;
	}

	return sum / 2;
}

/**
 * Area-weighted centroid of the feature's largest ring. Deliberately not the centroid of
 * the whole MultiPolygon: for a municipality with a big archipelago that point can fall in
 * open water, and open water belongs to no maakunta polygon.
 */
function centroidOf(feature: KuntaFeature): Point {
	const rings = feature.geometry.coordinates.flat();
	const mainland = rings.reduce((a, b) => (Math.abs(ringArea(b)) > Math.abs(ringArea(a)) ? b : a));
	const area = ringArea(mainland);

	let x = 0;
	let y = 0;

	for (let i = 0; i < mainland.length - 1; i++) {
		const [x1, y1] = mainland[i];
		const [x2, y2] = mainland[i + 1];
		const cross = x1 * y2 - x2 * y1;

		x += (x1 + x2) * cross;
		y += (y1 + y2) * cross;
	}

	return [x / (6 * area), y / (6 * area)];
}

/** Ray casting against a single ring. */
function ringContains(ring: number[][], [x, y]: Point): boolean {
	let inside = false;

	for (let i = 0; i < ring.length - 1; i++) {
		const [x1, y1] = ring[i];
		const [x2, y2] = ring[i + 1];

		if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) inside = !inside;
	}

	return inside;
}

/**
 * Whether the point falls inside the feature. Only outer rings are tested: these files use
 * one ring per polygon, and treating a stray inner ring as an exclusion would risk dropping
 * a municipality out of every maakunta — which `assertCompleteAssignment` would then reject
 * outright rather than silently mis-assign.
 */
function featureContains(feature: KuntaFeature, point: Point): boolean {
	return feature.geometry.coordinates.some((polygon) => ringContains(polygon[0], point));
}

export type Membership = {
	/** municipality natcode -> maakunta natcode. */
	regionOf: Map<string, string>;
	/** maakunta natcode -> its municipalities' natcodes. */
	membersOf: Map<string, string[]>;
};

export function assignToRegions(
	kunnat: KuntaCollection,
	maakunnat: KuntaCollection
): Membership & { unassigned: string[]; ambiguous: string[] } {
	const regionOf = new Map<string, string>();
	const membersOf = new Map<string, string[]>();
	const unassigned: string[] = [];
	const ambiguous: string[] = [];

	for (const feature of kunnat.features) {
		const point = centroidOf(feature);
		const hits = maakunnat.features.filter((m) => featureContains(m, point));
		const code = feature.properties.natcode;

		if (hits.length === 0) {
			unassigned.push(feature.properties.namefin);
			continue;
		}

		if (hits.length > 1) {
			ambiguous.push(feature.properties.namefin);
			continue;
		}

		const region = hits[0].properties.natcode;

		regionOf.set(code, region);
		membersOf.set(region, [...(membersOf.get(region) ?? []), code]);
	}

	return { regionOf, membersOf, unassigned, ambiguous };
}

/**
 * Fails the build rather than shipping a map whose regions quietly omit municipalities.
 * Runs at build time (the page prerenders), so a geometry file that no longer lines up
 * surfaces as a broken build, never as a wrong number on the page.
 */
export function assertCompleteAssignment(
	result: ReturnType<typeof assignToRegions>,
	expected: { kuntas: number; regions: number }
): Membership {
	const { regionOf, membersOf, unassigned, ambiguous } = result;

	if (unassigned.length || ambiguous.length) {
		throw new Error(
			`Could not place every municipality in exactly one region.\n` +
				`  in no region: ${unassigned.join(', ') || 'none'}\n` +
				`  in several:   ${ambiguous.join(', ') || 'none'}`
		);
	}

	if (regionOf.size !== expected.kuntas || membersOf.size !== expected.regions) {
		throw new Error(
			`Region membership doesn't cover the expected areas: ` +
				`${regionOf.size}/${expected.kuntas} municipalities in ` +
				`${membersOf.size}/${expected.regions} regions.`
		);
	}

	return { regionOf, membersOf };
}
