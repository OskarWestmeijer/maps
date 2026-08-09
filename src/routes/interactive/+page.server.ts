import type { PageServerLoad } from './$types';
import geojson from '$lib/interactive/finland_kunnat_2km.geojson?raw';
// Data files are named `<measure>_<source type>_<scope>_<period>[_<pxweb-table-id>]`. The
// period is part of the filename so the vintage is obvious at a glance, and the PxWeb table
// id (e.g. `12r5`) is appended so the source table is searchable later — which means
// replacing an export with a newer month is a rename plus an edit to these two import paths.
import unemployment from '$lib/interactive/unemployment_register_kunnat_2026-06_12r5.json';
import labourSurvey from '$lib/interactive/unemployment_survey_national_2026-06.csv?raw';
import softwareJobs from '$lib/interactive/software_occupations_register_kunnat_2026-06_12ti.json';
import { toFinlandMap, type KuntaCollection } from '$lib/interactive/finland';
import { toUnemploymentData, type PxWebExport } from '$lib/interactive/unemployment';
import { toLabourSurvey } from '$lib/interactive/survey';
import { toSoftwareJobsData } from '$lib/interactive/softwareJobs';

// A *server* load on purpose: it runs once at build time (the layout prerenders
// everything) and only its compact result is serialized into the page. Doing this in a
// universal `+page.ts` would make SvelteKit inline the whole 475 kB source GeoJSON into
// the HTML so the client could replay the load.
export const load: PageServerLoad = () => {
	const { stats, national, period, source } = toUnemploymentData(unemployment as PxWebExport);
	const { kuntas, viewBox } = toFinlandMap(JSON.parse(geojson) as KuntaCollection, stats);

	return {
		kuntas,
		viewBox,
		national,
		period,
		source,
		survey: toLabourSurvey(labourSurvey),
		softwareJobs: toSoftwareJobsData(softwareJobs as PxWebExport)
	};
};
