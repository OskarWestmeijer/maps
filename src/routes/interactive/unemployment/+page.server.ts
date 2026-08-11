import type { PageServerLoad } from './$types';
import finlandGeojson from '$lib/interactive/finland_kunnat_2km.geojson?raw';
import maakuntaGeojson from '$lib/interactive/finland_maakunnat_500m.geojson?raw';
import tampereGeojson from '$lib/interactive/tampere_kunnat_20m.geojson?raw';
import { loadGeometry } from '$lib/interactive/loadGeometry';
import { EMPTY_KUNTA_STATS } from '$lib/interactive/unemployment';
import { TAMPERE_REGION } from '$lib/interactive/regions';
import type { KuntaCollection } from '$lib/interactive/finland';

// A *server* load on purpose: it runs once at build time (the layout prerenders everything)
// and only its compact result is serialized into the page. Doing this in a universal
// `+page.ts` would make SvelteKit inline the whole source GeoJSON into the HTML so the client
// could replay the load.
//
// Geometry only — the figures are fetched from `/data/` when the page opens (see
// `liveData.ts`), so the cron that refreshes them needs no rebuild. All three tabs are
// computed here and shipped in one payload; the page switches between them client-side (see
// `region` state in +page.svelte) rather than navigating to a second route.
export const load: PageServerLoad = () => ({
	finland: loadGeometry(JSON.parse(finlandGeojson) as KuntaCollection, {
		emptyStats: EMPTY_KUNTA_STATS
	}),
	maakunta: loadGeometry(JSON.parse(maakuntaGeojson) as KuntaCollection, {
		emptyStats: EMPTY_KUNTA_STATS
	}),
	tampere: loadGeometry(JSON.parse(tampereGeojson) as KuntaCollection, {
		emptyStats: EMPTY_KUNTA_STATS,
		isSubset: true,
		integrityCheck: TAMPERE_REGION
	})
});
