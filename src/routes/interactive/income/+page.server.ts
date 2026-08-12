import type { PageServerLoad } from './$types';
import finlandGeojson from '$lib/interactive/finland_kunnat_2km.geojson?raw';
import maakuntaGeojson from '$lib/interactive/finland_maakunnat_500m.geojson?raw';
import tampereGeojson from '$lib/interactive/tampere_kunnat_20m.geojson?raw';
import { loadGeometry } from '$lib/interactive/loadGeometry';
import { EMPTY_INCOME_STATS } from '$lib/interactive/income';
import { assertCompleteAssignment, assignToRegions } from '$lib/interactive/membership';
import { TAMPERE_REGION } from '$lib/interactive/regions';
import type { KuntaCollection } from '$lib/interactive/finland';

// Geometry only, at build time — the figures arrive from `/data/` when the page opens (see
// `liveData.ts`).
//
// The kunta -> maakunta grouping is derived here purely to *name* each municipality's region
// under the panel heading, the way all three other loaders do it: no PxWeb export carries a
// membership list, and working it out is a point-in-polygon job over the GeoJSON, which cannot
// move to the browser without shipping the geometry. Nothing on this map is rolled up from it —
// 14ww publishes its own region rows, and a median could not be aggregated even if it didn't.
export const load: PageServerLoad = () => {
	const kunnatCollection = JSON.parse(finlandGeojson) as KuntaCollection;
	const maakunnatCollection = JSON.parse(maakuntaGeojson) as KuntaCollection;

	const { membersOf } = assertCompleteAssignment(
		assignToRegions(kunnatCollection, maakunnatCollection),
		{ kuntas: kunnatCollection.features.length, regions: maakunnatCollection.features.length }
	);

	return {
		finland: loadGeometry(kunnatCollection, { emptyStats: EMPTY_INCOME_STATS }),
		maakunta: loadGeometry(maakunnatCollection, { emptyStats: EMPTY_INCOME_STATS }),
		tampere: loadGeometry(JSON.parse(tampereGeojson) as KuntaCollection, {
			emptyStats: EMPTY_INCOME_STATS,
			isSubset: true,
			integrityCheck: TAMPERE_REGION
		}),
		membersOf: Object.fromEntries(membersOf)
	};
};
