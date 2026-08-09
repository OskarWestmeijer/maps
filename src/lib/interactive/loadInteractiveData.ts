/**
 * Builds the page data for the interactive map, either for the whole country or scoped down
 * to a hand-picked set of municipalities (`natcodes`) — used for the Tampere metro toggle.
 * Runs at build time from `+page.server.ts`, once per region, so both views ship in one
 * page's compact prerendered payload with no client-side geometry processing.
 *
 * Data files are named `<measure>_<source type>_<scope>_<period>[_<pxweb-table-id>]`. The
 * period is part of the filename so the vintage is obvious at a glance, and the PxWeb table
 * id (e.g. `12r5`) is appended so the source table is searchable later — which means
 * replacing an export with a newer month is a rename plus an edit to these import paths.
 */

import geojson from './finland_kunnat_2km.geojson?raw';
import unemployment from './unemployment_register_kunnat_2026-06_12r5.json';
import labourSurvey from './unemployment_survey_national_2026-06.csv?raw';
import softwareJobsExport from './software_occupations_register_kunnat_2026-06_12ti.json';
import { toFinlandMap, type KuntaCollection } from './finland';
import { toUnemploymentData, aggregateKuntaStats, type PxWebExport } from './unemployment';
import { toLabourSurvey } from './survey';
import { toSoftwareJobsData, aggregateSoftwareJobStats } from './softwareJobs';

// Only a filtered/regional call needs breathing room around its bbox — see `toFinlandMap`.
const REGION_PADDING_RATIO = 0.05;

export function loadInteractiveData(natcodes?: string[]) {
	const {
		stats,
		national: countryNational,
		period,
		source
	} = toUnemploymentData(unemployment as PxWebExport);
	const softwareJobsData = toSoftwareJobsData(softwareJobsExport as PxWebExport);

	const collection = JSON.parse(geojson) as KuntaCollection;
	const features = natcodes
		? collection.features.filter((f) => natcodes.includes(f.properties.natcode))
		: collection.features;

	const { kuntas, viewBox } = toFinlandMap(
		{ ...collection, features },
		stats,
		natcodes ? REGION_PADDING_RATIO : 0
	);

	// The register export's `SSS` row is a whole-country total only — there's no equivalent
	// pre-aggregated row for an arbitrary hand-picked region, so a region's totals are rolled
	// up from the same per-kunta figures the map itself renders (via the already-filtered
	// `kuntas`, so the aggregate and the map always cover exactly the same set).
	const national = natcodes ? aggregateKuntaStats(kuntas) : countryNational;
	const softwareNational = natcodes
		? aggregateSoftwareJobStats(
				kuntas.map(
					(k) =>
						softwareJobsData.stats.get(k.code) ?? {
							unemployed: null,
							unemployedIsMinimum: false,
							vacancies: null,
							vacanciesIsMinimum: false
						}
				)
			)
		: softwareJobsData.national;

	return {
		kuntas,
		viewBox,
		national,
		// The whole-country rate, carried on *both* views: it's what the diverging colour
		// scale pivots around, and the panel's "vs Finland" delta compares against. Keeping
		// it national even on a region keeps colours stable across the toggle — a
		// municipality that's red on the Finland map stays red on the Tampere Metro map.
		countryRate: countryNational.rate,
		period,
		source,
		survey: toLabourSurvey(labourSurvey),
		softwareJobs: { ...softwareJobsData, national: softwareNational }
	};
}
