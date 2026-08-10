/**
 * Builds all three views of the population-density map (Finland, Region, Tampere Metro) at
 * build time, from the same geometry files the unemployment map uses.
 *
 * It's one function rather than the unemployment map's per-view `loadInteractiveData` calls
 * because the views aren't independent here: the population export has no maakunta rows and
 * the maakunta geometry has no land area, so the Region view is *derived* from the
 * municipal one (see `membership.ts`) and has to be built alongside it.
 *
 * Data files are named `<measure>_<source type>_<scope>_<period>[_<pxweb-table-id>]`, so
 * moving to a newer month is a rename plus an edit to the import path below.
 */

import populationExport from './population_register_kunnat_2025_121w.json';
import finlandGeojson from './finland_kunnat_2km.geojson?raw';
import maakuntaGeojson from './finland_maakunnat_500m.geojson?raw';
import tampereGeojson from './tampere_kunnat_20m.geojson?raw';
import { toFinlandMap, type Kunta, type KuntaCollection } from './finland';
import type { PxWebExport } from './unemployment';
import { assertCompleteAssignment, assignToRegions } from './membership';
import { TAMPERE_REGION } from './regions';
import {
	aggregatePopulationStats,
	densityOf,
	EMPTY_POPULATION_STATS,
	toPopulationData,
	type PopulationStats
} from './population';

/** A subset's bbox needs padding the whole country's ragged coastline provides for free. */
const SUBSET_PADDING_RATIO = 0.05;

/** The area level whose density is being shown, plus everything the page renders from it. */
export type PopulationView = {
	areas: PopulationArea[];
	viewBox: string;
	/** The area's own totals: the `SSS` row for Finland, a roll-up for anything smaller. */
	total: PopulationArea;
	/** Finland's own density, carried on *every* view: it's what the panel's "vs Finland"
	 *  ratio compares against, so the comparison means the same thing on every tab. */
	countryDensity: number | null;
	period: string;
	source: string;
};

export type PopulationArea = Kunta<PopulationStats> & {
	/** Inhabitants per km² of land — the mapped figure. */
	density: number | null;
};

function withDensity(kunta: Kunta<PopulationStats>): PopulationArea {
	return { ...kunta, density: densityOf(kunta.population, kunta.landArea) };
}

/**
 * The panel's fallback figures for a whole view. Shaped like an area so the page can read
 * one type whether or not something is selected — `d` is empty because nothing draws it.
 */
function rollUp(name: string, areas: PopulationArea[]): PopulationArea {
	const stats = aggregatePopulationStats(areas);
	const landArea = areas.reduce((sum, a) => sum + (a.landArea ?? 0), 0) || null;

	return {
		...stats,
		name,
		code: '',
		landArea,
		d: '',
		density: densityOf(stats.population, landArea)
	};
}

export function loadPopulationViews(): {
	finland: PopulationView;
	maakunta: PopulationView;
	tampere: PopulationView;
} {
	const { stats, national, period, source } = toPopulationData(populationExport as PxWebExport);

	const kunnatCollection = JSON.parse(finlandGeojson) as KuntaCollection;
	const maakunnatCollection = JSON.parse(maakuntaGeojson) as KuntaCollection;
	const tampereCollection = JSON.parse(tampereGeojson) as KuntaCollection;

	const municipal = toFinlandMap(kunnatCollection, stats, EMPTY_POPULATION_STATS);
	const areas = municipal.kuntas.map(withDensity);
	const byCode = new Map(areas.map((a) => [a.code, a]));

	// The Region view: municipal figures grouped by the maakunta each municipality's
	// geometry falls in, since neither the export nor the maakunta file supplies them. The
	// assertion is what keeps a silently-incomplete grouping from reaching the page.
	const { membersOf } = assertCompleteAssignment(
		assignToRegions(kunnatCollection, maakunnatCollection),
		{ kuntas: kunnatCollection.features.length, regions: maakunnatCollection.features.length }
	);

	const regionStats = new Map<string, PopulationStats & { landArea: number }>();

	for (const [region, members] of membersOf) {
		const parts = members.map((code) => byCode.get(code)).filter((a) => a !== undefined);

		regionStats.set(region, {
			...aggregatePopulationStats(parts),
			landArea: parts.reduce((sum, a) => sum + (a.landArea ?? 0), 0)
		});
	}

	// The maakunta geometry has no `landarea` of its own, so the summed one is passed in as
	// part of the stats and overwrites the null `toFinlandMap` would otherwise leave.
	const regional = toFinlandMap(maakunnatCollection, regionStats, {
		...EMPTY_POPULATION_STATS,
		landArea: 0
	});
	const regionAreas = regional.kuntas.map(withDensity);

	const tampere = toFinlandMap(
		tampereCollection,
		stats,
		EMPTY_POPULATION_STATS,
		SUBSET_PADDING_RATIO
	);
	const tampereAreas = tampere.kuntas.map(withDensity);

	// Finland's own total comes from the export's whole-country row; the land area behind it
	// is the sum of the municipalities', the same figure the map is drawn from.
	const countryLandArea = areas.reduce((sum, a) => sum + (a.landArea ?? 0), 0);
	const countryTotal: PopulationArea = {
		...national,
		name: 'Finland',
		code: '',
		landArea: countryLandArea,
		d: '',
		density: densityOf(national.population, countryLandArea)
	};

	const countryDensity = countryTotal.density;

	return {
		finland: {
			areas,
			viewBox: municipal.viewBox,
			total: countryTotal,
			countryDensity,
			period,
			source
		},
		// Same country, coarser areas — so the Region tab's headline stays the national total.
		maakunta: {
			areas: regionAreas,
			viewBox: regional.viewBox,
			total: countryTotal,
			countryDensity,
			period,
			source
		},
		tampere: {
			areas: tampereAreas,
			viewBox: tampere.viewBox,
			total: rollUp(TAMPERE_REGION.label, tampereAreas),
			countryDensity,
			period,
			source
		}
	};
}
