import type { PageServerLoad } from './$types';
import finlandGeojson from '$lib/interactive/finland_kunnat_2km.geojson?raw';
import maakuntaGeojson from '$lib/interactive/finland_maakunnat_500m.geojson?raw';
import tampereGeojson from '$lib/interactive/tampere_kunnat_20m.geojson?raw';
import { loadGeometry } from '$lib/interactive/loadGeometry';
import { EMPTY_POPULATION_STATS } from '$lib/interactive/population';
import { assertCompleteAssignment, assignToRegions } from '$lib/interactive/membership';
import { TAMPERE_REGION } from '$lib/interactive/regions';
import type { KuntaCollection } from '$lib/interactive/finland';

// Geometry only, at build time — the figures arrive from `/data/` when the page opens (see
// `liveData.ts`). The one thing that has to be *derived* here rather than in the browser is
// the kunta -> maakunta grouping: the population export has no region rows and the maakunta
// geometry has no land area, so the Region tab is rolled up from municipalities, and working
// out which municipality falls in which region is a point-in-polygon job over the GeoJSON.
// Deriving it geometrically beats hand-maintaining 308 assignments and stays correct if a
// geometry file is replaced; `assertCompleteAssignment` fails the build if any municipality
// lands in zero or several regions.
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
