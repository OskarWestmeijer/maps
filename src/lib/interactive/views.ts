/**
 * The vocabulary both interactive maps share: which area level is on screen, and the slice
 * of a view `MapShell` itself renders. They live here rather than in the component because
 * a Svelte component can't export types from its instance script.
 */

/** Which of the three area tabs is active. */
export type RegionId = 'finland' | 'maakunta' | 'tampere';

/** What the shell needs of a view; each map's payload carries more alongside it. */
export type ShellView<A> = {
	areas: A[];
	viewBox: string;
	/** Statistics period, e.g. "2026M06" — rendered as "Data from June 2026". */
	period: string;
};
