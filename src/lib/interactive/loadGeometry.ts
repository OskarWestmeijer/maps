/**
 * The build-time half of an interactive map: geometry, and nothing else.
 *
 * Statistics used to be imported here too and baked into the prerendered page. They aren't
 * any more — they're fetched from `/data/` when the page opens (see `liveData.ts`), so a cron
 * on the server can refresh the figures without rebuilding the image. Geometry stays here
 * because it's the expensive part (a 475 kB GeoJSON becomes a few hundred SVG paths) and
 * because it never changes on a cron.
 *
 * So: this runs once at build time from `+page.server.ts` and ships shapes with every stat
 * field present and null. The map renders immediately as an outline, and fills in a moment
 * later.
 */

import { toFinlandMap, type FinlandMap, type KuntaCollection } from './finland';

/** Only a subset's bbox needs breathing room — see `toFinlandMap`. */
const SUBSET_PADDING_RATIO = 0.05;

export type GeometryOptions<S> = {
	/** Merged into every area, so each one carries the full shape of its metric's stats
	 *  (all null) before the live data lands. */
	emptyStats: S;
	/** True for a hand-picked subset (e.g. Tampere metro): pads the bbox, which a tightly
	 *  cropped handful of contiguous areas needs and the whole country doesn't. */
	isSubset?: boolean;
	/** When set, throws at build time unless `collection`'s natcodes exactly match — catches
	 *  a hand-maintained geometry file drifting from the municipality list it's meant to be. */
	integrityCheck?: { natcodes: string[] };
};

export function loadGeometry<S>(
	collection: KuntaCollection,
	{ emptyStats, isSubset = false, integrityCheck }: GeometryOptions<S>
): FinlandMap<S> {
	if (integrityCheck) {
		const found = collection.features.map((f) => f.properties.natcode).sort();
		const expected = [...integrityCheck.natcodes].sort();

		if (found.join(',') !== expected.join(',')) {
			throw new Error(
				`Region geometry doesn't match its expected natcodes.\n` +
					`  file: ${found.join(', ')}\n  expected: ${expected.join(', ')}`
			);
		}
	}

	// An empty stats map: every area falls through to `emptyStats`.
	return toFinlandMap(
		collection,
		new Map<string, S>(),
		emptyStats,
		isSubset ? SUBSET_PADDING_RATIO : 0
	);
}
