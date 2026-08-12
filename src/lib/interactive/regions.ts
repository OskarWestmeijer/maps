/**
 * Hand-maintained municipality list for the Tampere metro toggle on the interactive map.
 * There's no seutukunta -> kunta membership table anywhere in this repo's data — the PxWeb
 * exports only carry pre-aggregated SK/MK/ELY region rows, not membership lists — so this is
 * copied by hand from Tampereen kaupunkiseutu's official member municipalities.
 *
 * The region no longer needs this list to *select* its municipalities — it has its own
 * dedicated geometry file (`tampere_kunnat_20m.geojson`, simplified to a finer 20 m
 * tolerance than the whole-country file, affordable at 8 municipalities) rather than being
 * filtered out of the whole-country one. `natcodes` is kept anyway as a build-time integrity
 * check (see `loadInteractiveData.ts`) — if that file is ever regenerated with a different
 * municipality set, the build fails loudly instead of quietly shipping the wrong region.
 */

export type Region = {
	id: 'tampere';
	label: string;
	natcodes: string[];
};

/**
 * Shortens a maakunta name for a table column: "Pohjois-Pohjanmaa" -> "P-Pohjanmaa".
 *
 * Only the four compass/qualifier prefixes are touched, which is how these are abbreviated in
 * Finnish anyway ("P-Savo", "K-Suomi") — the rest are already short enough. Longest output is
 * 11 characters, against 17 for the longest full name, which is what lets the compare map's
 * ranking fit a region column beside the name and the score.
 */
export function shortRegionName(name: string): string {
	return name.replace(/^(Pohjois|Etelä|Keski|Varsinais)-/, (_, prefix: string) => `${prefix[0]}-`);
}

export const TAMPERE_REGION: Region = {
	id: 'tampere',
	label: 'Tampere Metro',
	natcodes: [
		'837', // Tampere
		'211', // Kangasala
		'418', // Lempäälä
		'536', // Nokia
		'562', // Orivesi
		'604', // Pirkkala
		'922', // Vesilahti
		'980' // Ylöjärvi
	]
};
