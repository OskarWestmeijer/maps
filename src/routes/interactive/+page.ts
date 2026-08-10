import { redirect } from '@sveltejs/kit';

/**
 * `/interactive` is the navbar entry, but it isn't a page of its own — it hosts the two
 * maps, and the unemployment one is the default. Prerendering turns this into a redirect
 * the static host follows, so the URL keeps working without a server runtime.
 */
export const load = () => {
	redirect(307, '/interactive/unemployment');
};
