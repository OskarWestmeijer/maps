import type { PageServerLoad } from './$types';
import geojson from '$lib/interactive/finland_kunnat_2km.geojson?raw';
// Data files are named `<measure>_<source type>_<scope>_<period>`. The period is part of
// the filename so the vintage is obvious at a glance — which means replacing an export
// with a newer month is a rename plus an edit to these two import paths.
import unemployment from '$lib/interactive/unemployment_register_kunnat_2026-06.json';
import labourSurvey from '$lib/interactive/unemployment_survey_national_2026-06.csv?raw';
import { toFinlandMap, type KuntaCollection } from '$lib/interactive/finland';
import { toUnemploymentData, type PxWebExport } from '$lib/interactive/unemployment';
import { toLabourSurvey } from '$lib/interactive/survey';

// A *server* load on purpose: it runs once at build time (the layout prerenders
// everything) and only its compact result is serialized into the page. Doing this in a
// universal `+page.ts` would make SvelteKit inline the whole 475 kB source GeoJSON into
// the HTML so the client could replay the load.
export const load: PageServerLoad = () => {
	const { stats, national, period, source } = toUnemploymentData(unemployment as PxWebExport);
	const { kuntas, viewBox } = toFinlandMap(JSON.parse(geojson) as KuntaCollection, stats);

	return { kuntas, viewBox, national, period, source, survey: toLabourSurvey(labourSurvey) };
};
