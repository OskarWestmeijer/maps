import type { PageServerLoad } from './$types';
import finlandGeojson from '$lib/interactive/finland_kunnat_2km.geojson?raw';
import maakuntaGeojson from '$lib/interactive/finland_maakunnat_500m.geojson?raw';
import tampereGeojson from '$lib/interactive/tampere_kunnat_20m.geojson?raw';
import { loadGeometry } from '$lib/interactive/loadGeometry';
import { EMPTY_POPULATION_STATS } from '$lib/interactive/population';
import { assertCompleteAssignment, assignToRegions } from '$lib/interactive/membership';
import { TAMPERE_REGION } from '$lib/interactive/regions';
import type { KuntaCollection } from '$lib/interactive/finland';

// Geometry only, at build time — every figure arrives from `/data/` when the page opens (see
// `loadCompareViews` in `liveData.ts`), so the refresh cron moves this map too.
//
// Identical to the population page's load, and for the same reason: one of the two tables
// behind the score (121w) has no region rows, so the Region tab's population figure has to be
// rolled up from municipalities, and working out which municipality falls in which region is a
// point-in-polygon job over the GeoJSON that can't run in the browser — the whole point of
// keeping the geometry out of the shipped bundle. `assertCompleteAssignment` fails the build if
// any municipality lands in zero or several regions.
export const load: PageServerLoad = () => {
	const kunnatCollection = JSON.parse(finlandGeojson) as KuntaCollection;
	const maakunnatCollection = JSON.parse(maakuntaGeojson) as KuntaCollection;

	const { membersOf } = assertCompleteAssignment(
		assignToRegions(kunnatCollection, maakunnatCollection),
		{ kuntas: kunnatCollection.features.length, regions: maakunnatCollection.features.length }
	);

	return {
		finland: loadGeometry(kunnatCollection, { emptyStats: EMPTY_POPULATION_STATS }),
		maakunta: loadGeometry(maakunnatCollection, { emptyStats: EMPTY_POPULATION_STATS }),
		tampere: loadGeometry(JSON.parse(tampereGeojson) as KuntaCollection, {
			emptyStats: EMPTY_POPULATION_STATS,
			isSubset: true,
			integrityCheck: TAMPERE_REGION
		}),
		membersOf: Object.fromEntries(membersOf)
	};
};
