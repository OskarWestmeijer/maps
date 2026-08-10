/**
 * Turns the EPSG:3067 (TM35FIN) municipality GeoJSON into ready-to-render SVG paths.
 * EPSG:3067 is already a planar projection in metres, so no reprojection is needed —
 * flipping the Y axis and letting the SVG viewBox do the scaling is enough.
 */

import type { KuntaStats } from './unemployment';

/**
 * The export also carries `id`, `gml_id`, the Swedish name and the water/total area figures;
 * none of those are used. `landarea` (km², the official maa-pinta-ala) is — it's the
 * denominator behind the population map's density, and it lives in the geometry rather than
 * in any of the PxWeb exports. The maakunta file doesn't carry it, hence optional.
 */
export type KuntaProperties = {
	natcode: string;
	namefin: string;
	landarea?: number;
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

/**
 * What every area carries regardless of which metric is being mapped. The per-metric
 * figures are merged in on top of this (see `toFinlandMap`'s `S` parameter) — the
 * unemployment map's `KuntaStats`, the population map's `PopulationStats`.
 */
export type KuntaBase = {
	name: string;
	code: string;
	/** Land area in km², straight from the geometry. Null for maakunnat, whose file omits
	 *  it — the population loader sums its municipalities' figures instead. */
	landArea: number | null;
	/** SVG path data, one path per municipality (all its islands included). */
	d: string;
};

export type Kunta<S = KuntaStats> = KuntaBase & S;

export type FinlandMap<S> = {
	kuntas: Kunta<S>[];
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
export function toFinlandMap<S>(
	geojson: KuntaCollection,
	stats: Map<string, S>,
	/** Merged into any area the `stats` map has no row for, so every field stays present
	 *  (and null) rather than missing. */
	emptyStats: S,
	paddingRatio = 0
): FinlandMap<S> {
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
				landArea: p.landarea ?? null,
				...(stats.get(p.natcode) ?? emptyStats),
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
