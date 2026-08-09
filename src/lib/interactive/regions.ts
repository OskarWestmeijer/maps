/**
 * Hand-maintained municipality list for the Tampere metro toggle on the interactive map.
 * There's no seutukunta -> kunta membership table anywhere in this repo's data — the PxWeb
 * exports only carry pre-aggregated SK/MK/ELY region rows, not membership lists — so this is
 * copied by hand from Tampereen kaupunkiseutu's official member municipalities and checked
 * against `finland_kunnat_2km.geojson`'s natcodes.
 */

export type Region = {
	id: 'tampere';
	label: string;
	natcodes: string[];
};

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
