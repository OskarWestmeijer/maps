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
	/** Statistics period, e.g. "2026M06" — rendered as "Data from June 2026". Empty until the
	 *  live figures land, which is what blanks the whole line. */
	period: string;
	/** Replaces the formatted `period` in that line. For a view built from several tables on
	 *  different release cycles — the compare map — where quoting one table's period would
	 *  silently misdate the others. `period` still governs whether the line renders at all. */
	periodLabel?: string;
	/** When the refresh cron last asked Statistics Finland for this file (ISO, UTC) — a
	 *  different thing from the period, and the only signal that the pipeline is still
	 *  running. Null when there's no manifest to read it from. */
	polled?: string | null;
};
