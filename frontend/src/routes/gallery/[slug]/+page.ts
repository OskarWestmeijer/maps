import type { PageLoad } from './$types';
import { maps } from '$lib/maps';

export const load: PageLoad = ({ params }) => {
	const map = maps.find((m) => m.slug === params.slug);

	if (!map) throw new Error('Map not found');

	return { map };
};
