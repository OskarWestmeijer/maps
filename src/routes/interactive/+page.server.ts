import type { PageServerLoad } from './$types';
import finlandGeojson from '$lib/interactive/finland_kunnat_2km.geojson?raw';
import tampereGeojson from '$lib/interactive/tampere_kunnat_20m.geojson?raw';
import { loadInteractiveData } from '$lib/interactive/loadInteractiveData';
import { TAMPERE_REGION } from '$lib/interactive/regions';
import type { KuntaCollection } from '$lib/interactive/finland';

// A *server* load on purpose: it runs once at build time (the layout prerenders
// everything) and only its compact result is serialized into the page. Doing this in a
// universal `+page.ts` would make SvelteKit inline the whole source GeoJSON into the HTML
// so the client could replay the load.
//
// Both regions are computed here and shipped in one payload; the page toggles between them
// client-side (see `region` state in +page.svelte) rather than navigating to a second route.
export const load: PageServerLoad = () => ({
	finland: loadInteractiveData(JSON.parse(finlandGeojson) as KuntaCollection),
	tampere: loadInteractiveData(JSON.parse(tampereGeojson) as KuntaCollection, TAMPERE_REGION)
});
