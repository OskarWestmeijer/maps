/**
 * Turns the EPSG:3067 (TM35FIN) municipality GeoJSON into ready-to-render SVG paths.
 * EPSG:3067 is already a planar projection in metres, so no reprojection is needed —
 * flipping the Y axis and letting the SVG viewBox do the scaling is enough.
 */

import type { KuntaStats } from './unemployment';

/** The export also carries `id`, `gml_id`, the Swedish name and area figures; none are used. */
export type KuntaProperties = {
	natcode: string;
	namefin: string;
};

export type KuntaFeature = {
	type: 'Feature';
	properties: KuntaProperties;
	geometry: {
		type: 'MultiPolygon';
		coordinates: number[][][][];
	};
};

export type KuntaCollection = {
	type: 'FeatureCollection';
	features: KuntaFeature[];
};

export type Kunta = KuntaStats & {
	name: string;
	code: string;
	/** SVG path data, one path per municipality (all its islands included). */
	d: string;
};

const NO_STATS: KuntaStats = {
	rate: null,
	labourForce: null,
	jobseekers: null,
	unemployed: null
};

export type FinlandMap = {
	kuntas: Kunta[];
	viewBox: string;
};

/**
 * Builds the `d` attribute for one MultiPolygon. Every ring becomes its own subpath, so a
 * municipality with islands still renders — and hovers — as a single element.
 */
function toPathData(coordinates: number[][][][]): string {
	const subpaths: string[] = [];

	for (const polygon of coordinates) {
		for (const ring of polygon) {
			const points = ring.map(([x, y]) => `${Math.round(x)},${Math.round(-y)}`);
			subpaths.push(`M${points.join('L')}Z`);
		}
	}

	return subpaths.join('');
}

/**
 * @param paddingRatio Fraction of the bbox's width/height to pad on every side, default 0
 *   (today's exact behaviour). Whole-country calls don't need this — the coastline's own
 *   irregularity gives visual breathing room — but a bbox tightly fitted to a handful of
 *   contiguous municipalities (e.g. a regional view) would otherwise touch the SVG edge.
 */
export function toFinlandMap(
	geojson: KuntaCollection,
	stats: Map<string, KuntaStats> = new Map(),
	paddingRatio = 0
): FinlandMap {
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;

	for (const feature of geojson.features) {
		for (const polygon of feature.geometry.coordinates) {
			for (const ring of polygon) {
				for (const [x, y] of ring) {
					if (x < minX) minX = x;
					if (x > maxX) maxX = x;
					if (y < minY) minY = y;
					if (y > maxY) maxY = y;
				}
			}
		}
	}

	const kuntas = geojson.features
		.map((feature) => {
			const p = feature.properties;
			return {
				name: p.namefin,
				code: p.natcode,
				...(stats.get(p.natcode) ?? NO_STATS),
				d: toPathData(feature.geometry.coordinates)
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name, 'fi'));

	const padX = (maxX - minX) * paddingRatio;
	const padY = (maxY - minY) * paddingRatio;

	// Y is negated above, so the top edge of the viewBox is -maxY.
	const viewBox = [
		Math.round(minX - padX),
		Math.round(-maxY - padY),
		Math.round(maxX - minX + 2 * padX),
		Math.round(maxY - minY + 2 * padY)
	].join(' ');

	return { kuntas, viewBox };
}
