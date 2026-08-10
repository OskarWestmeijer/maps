/**
 * Number formatting for the interactive maps' panels.
 *
 * Done by hand rather than with `toLocaleString` on purpose: these strings are prerendered
 * in Node and then hydrated in the browser, and ICU group separators differ between the two
 * builds — a locale-formatted figure risks a hydration mismatch.
 */

/** Thin-space grouped integer, or an em dash when the figure isn't published. */
export function count(value: number | null): string {
	return value === null ? '—' : String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function percent(value: number | null): string {
	return value === null ? 'no data' : `${value.toFixed(1).replace('.', ',')} %`;
}

/**
 * One decimal, Finnish comma, grouped integer part. Used for densities, which run from 0,2
 * to 3 236,1 per km² — four orders of magnitude, so the grouping earns its keep.
 */
export function decimal(value: number | null, digits = 1): string {
	if (value === null) return '—';

	const [whole, fraction] = value.toFixed(digits).split('.');

	return `${count(Number(whole))},${fraction}`;
}

/** Always signed, with a real minus sign — so a pair of them reads as one scale. */
export function signed(value: number | null): string {
	if (value === null) return '—';

	return `${value > 0 ? '+' : value < 0 ? '−' : ''}${count(Math.abs(value))}`;
}

/** "2026M06" -> "June 2026" */
export function formatPeriod(period: string): string {
	const match = /^(\d{4})M(\d{2})$/.exec(period);

	if (!match) return period;

	const month = new Date(Number(match[1]), Number(match[2]) - 1).toLocaleString('en', {
		month: 'long'
	});

	return `${month} ${match[1]}`;
}
