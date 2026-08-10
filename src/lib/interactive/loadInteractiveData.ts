/**
 * Builds the page data for the interactive map, once per tab (Finland, Region, Tampere
 * Metro) — each backed by its own GeoJSON file rather than one filtered/derived from
 * another, since every tab has its own dedicated, appropriately-simplified geometry (see
 * `regions.ts`). Runs at build time from `+page.server.ts`, so all three views ship in one
 * page's compact prerendered payload with no client-side geometry processing.
 *
 * Data files are named `<measure>_<source type>_<scope>_<period>[_<pxweb-table-id>]`. The
 * period is part of the filename so the vintage is obvious at a glance, and the PxWeb table
 * id (e.g. `12r5`) is appended so the source table is searchable later — which means
 * replacing an export with a newer month is a rename plus an edit to these import paths.
 */

import unemployment from './unemployment_register_kunnat_2026-06_12r5.json';
import labourSurvey from './unemployment_survey_national_2026-06.csv?raw';
import softwareJobsExport from './software_occupations_register_kunnat_2026-06_12ti.json';
import { toFinlandMap, type KuntaCollection } from './finland';
import {
	toUnemploymentData,
	aggregateKuntaStats,
	EMPTY_KUNTA_STATS,
	type PxWebExport
} from './unemployment';
import { toLabourSurvey } from './survey';
import { toSoftwareJobsData, aggregateSoftwareJobStats } from './softwareJobs';

// Only a subset's bbox needs breathing room — see `toFinlandMap`.
const SUBSET_PADDING_RATIO = 0.05;

export type LoadOptions = {
	/** Which rows in the PxWeb exports back this view: `'KU'` (default) for municipalities,
	 *  `'MK'` for the 19 maakunta/region rows — the Region tab, same country, coarser areas. */
	areaPrefix?: 'KU' | 'MK';
	/** True for a hand-picked subset with no equivalent pre-aggregated row in the source
	 *  (e.g. Tampere metro) — rolls up national/software-national from the per-area figures
	 *  instead of reading the whole-country `SSS` row directly, and pads the bbox, which a
	 *  tightly-cropped handful of contiguous areas needs and the whole country doesn't. */
	isSubset?: boolean;
	/** When set, throws at build time unless `collection`'s natcodes exactly match — catches
	 *  a hand-maintained geometry file drifting from the municipality list it's meant to be. */
	integrityCheck?: { natcodes: string[] };
};

export function loadInteractiveData(collection: KuntaCollection, options: LoadOptions = {}) {
	const { areaPrefix = 'KU', isSubset = false, integrityCheck } = options;

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

	const {
		stats,
		national: countryNational,
		period,
		source
	} = toUnemploymentData(unemployment as PxWebExport, areaPrefix);
	const softwareJobsData = toSoftwareJobsData(softwareJobsExport as PxWebExport, areaPrefix);

	const { kuntas, viewBox } = toFinlandMap(
		collection,
		stats,
		EMPTY_KUNTA_STATS,
		isSubset ? SUBSET_PADDING_RATIO : 0
	);

	// The register export's `SSS` row is a whole-country total only — there's no equivalent
	// pre-aggregated row for an arbitrary hand-picked subset, so a subset's totals are rolled
	// up from the same per-area figures the map itself renders (via the already-scoped
	// `kuntas`, so the aggregate and the map always cover exactly the same set). The Region
	// tab isn't a subset — its 19 areas cover the whole country too — so it reads `SSS`
	// directly, same as the Finland tab.
	const national = isSubset ? aggregateKuntaStats(kuntas) : countryNational;
	const softwareNational = isSubset
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
		// The whole-country rate, carried on *every* view: it's what the diverging colour
		// scale pivots around, and the panel's "vs Finland" delta compares against. Keeping
		// it national even on a subset or a coarser area level keeps colours stable across
		// tabs — a municipality that's red on the Finland map stays red on the Tampere Metro
		// map, and a region's colour means the same thing as a municipality's.
		countryRate: countryNational.rate,
		period,
		source,
		survey: toLabourSurvey(labourSurvey),
		softwareJobs: { ...softwareJobsData, national: softwareNational }
	};
}
