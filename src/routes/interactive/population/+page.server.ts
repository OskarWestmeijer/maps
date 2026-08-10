import type { PageServerLoad } from './$types';
import { loadPopulationViews } from '$lib/interactive/loadPopulationViews';

// A *server* load, like the unemployment map's: it runs once at build time (the layout
// prerenders everything) and only its compact result is serialized into the page. A
// universal `+page.ts` would make SvelteKit inline the whole source GeoJSON into the HTML
// so the client could replay the load.
//
// All three tabs are computed together — the Region one is derived from the municipal one
// (see `membership.ts`), so they can't be built independently the way the unemployment
// map's are.
export const load: PageServerLoad = () => loadPopulationViews();
