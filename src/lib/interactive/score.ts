/**
 * The composite score behind `/interactive/compare`: several indicators, each from a different
 * statistics table, folded into one 0–100 figure per area.
 *
 * Kept pure — no Svelte, no geometry, no fetching — so the formula is unit-testable on its own
 * and so adding a domain (education, economy, housing) is an edit to one array rather than to a
 * component. `liveData.ts` joins the figures; this module only ranks and weights them.
 *
 * **Percentile rank, not z-score or min–max.** Each indicator becomes "better than X % of the
 * areas ranked". The measures being combined are on wildly different units (a percentage, a
 * per-mille change) and at least one has a long tail — Kökar's −75,8 per 1 000 is four times the
 * next value down — so min–max would let a single municipality compress everything else into a
 * narrow band, and a z-score would pin the tail at whatever clamp it was given. Ranking throws
 * away magnitude, which is the accepted cost: the panel shows every raw figure beside its
 * percentile so the number behind the rank is always in view.
 *
 * Ranks are computed over whatever set of areas is passed in, so a caller decides what "of 308"
 * means. The compare page ranks municipalities against all 308 and regions against the 19, and
 * never against a tab's subset — a kunta's score must not move when the Tampere tab is opened.
 */

import { DIVERGING_SCALE, NO_DATA_COLOR } from './unemployment';

export type Indicator<A> = {
	/** Stable key, used for `{#each}` and in tests. */
	key: string;
	/** What the panel calls this domain — "Jobs", "People". */
	label: string;
	/** The raw figure for an area, or null where the source suppresses/omits it. */
	valueOf: (area: A) => number | null;
	/** Renders that raw figure for the panel, e.g. `percent` or `signed` from `format.ts`. */
	format: (value: number | null) => string;
	/** False for measures where less is better, like an unemployment rate. */
	higherIsBetter: boolean;
	/**
	 * Relative importance. Equal across domains for now — the site has no basis for saying that
	 * one matters more, and an arbitrary weighting dressed up as a finding would be worse than
	 * an obviously neutral one. It's a field rather than a constant so a future UI can vary it
	 * without the formula changing shape.
	 */
	weight: number;
};

/** One indicator's contribution to an area's score, as the panel renders it. */
export type ScorePart = {
	key: string;
	label: string;
	/** 0–100, or null where this area has no figure for this indicator. */
	percentile: number | null;
	/** 1 = best on this indicator alone. Null where the figure is. Competition ranking, so ties
	 *  share a rank and the next one skips — the same rule the overall `rank` uses. */
	rank: number | null;
	/** How many areas have a figure for this indicator — the "of 304" beside `rank`. */
	ranked: number;
	value: number | null;
	/** `value` through the indicator's own formatter. */
	formatted: string;
};

export type ScoreBreakdown = {
	/** 0–100, or null when the area is below `MIN_COVERAGE`. */
	score: number | null;
	/**
	 * Where that score sits among the other scored areas, 0–100 — **what the map colours by**.
	 *
	 * Not the same thing as `score`, and the difference is why this field exists. A score is the
	 * mean of several percentile ranks, and a mean of ranks is not itself rank-distributed: it
	 * clusters towards the middle, harder with every indicator added. Over the real exports the
	 * top-10 % band held 9 municipalities with two indicators and **1** with six, so a class
	 * labelled "top 10 %" was describing 0,3 % of the country. Ranking the score itself makes the
	 * bands mean what they say by construction, whatever gets added next.
	 */
	scorePercentile: number | null;
	/** 1 = best. Null whenever `score` is. */
	rank: number | null;
	/** How many areas got a score — the "of 308" the panel prints beside the rank. */
	ranked: number;
	parts: ScorePart[];
	/** True when the area was scored on less than the full set of indicators. */
	isPartial: boolean;
};

/**
 * The share of total weight an area must have figures for before it gets a score at all.
 *
 * **1 — every indicator, no exceptions — and that is a deliberate choice, not a stub.** Scoring
 * an area on the subset it happens to have is not conservative: it silently re-weights that
 * area's remaining indicators up to 100 %. Run over the real exports with two indicators and a
 * "rescale over what's present" rule, Föglö came out **first of 308** — it has no published
 * unemployment rate (four Åland municipalities don't), so its score was its population change
 * alone, which is near the top of the country. A ranking whose winner is an artefact of a
 * suppressed cell discredits the whole page.
 *
 * With five domains a partial score becomes defensible and this can drop to ~0.6; the code path
 * for it (`isPartial`, and the panel's note) is built and tested, it just can't trigger at 1.
 */
export const MIN_COVERAGE = 1;

/**
 * Percentile rank of each value within the array, 0–100, preserving input order.
 *
 * - Nulls stay null and are excluded from the denominator, so suppressed areas don't drag the
 *   scale or occupy ranks.
 * - Ties share the average of the ranks they span — otherwise the order the areas happened to
 *   arrive in would decide which of two identical figures scored higher.
 * - The denominator is `n - 1`, so the best value is exactly 100 and the worst exactly 0.
 * - A single ranked value has no spread to sit in and scores 50 (the neutral midpoint) rather
 *   than dividing by zero.
 */
export function percentileRanks(
	values: (number | null)[],
	higherIsBetter: boolean
): (number | null)[] {
	const known = values
		.map((value, index) => ({ value, index }))
		.filter((entry): entry is { value: number; index: number } => entry.value !== null);

	const result: (number | null)[] = values.map(() => null);

	if (known.length === 0) return result;
	if (known.length === 1) {
		result[known[0].index] = 50;

		return result;
	}

	// Ascending, so position 0 is the lowest value: that's the best end when less is better.
	known.sort((a, b) => a.value - b.value);

	let start = 0;

	while (start < known.length) {
		let end = start;

		while (end + 1 < known.length && known[end + 1].value === known[start].value) end += 1;

		// Average position across the tie, mapped onto 0–100 and flipped for "lower is better".
		const position = (start + end) / 2 / (known.length - 1);
		const percentile = (higherIsBetter ? position : 1 - position) * 100;

		for (let i = start; i <= end; i += 1) result[known[i].index] = percentile;

		start = end + 1;
	}

	return result;
}

/**
 * Position of each value within the array, 1 = best, preserving input order.
 *
 * Competition ranking: equal values share a rank and the next one skips, so a rank always answers
 * "how many areas are ahead of me". Nulls stay null and don't occupy a position.
 */
export function competitionRanks(
	values: (number | null)[],
	higherIsBetter: boolean
): { rank: (number | null)[]; ranked: number } {
	const known = values
		.map((value, index) => ({ value, index }))
		.filter((entry): entry is { value: number; index: number } => entry.value !== null);

	// Best first: highest value when more is better, lowest when less is.
	known.sort((a, b) => (higherIsBetter ? b.value - a.value : a.value - b.value));

	const rank: (number | null)[] = values.map(() => null);
	let start = 0;

	while (start < known.length) {
		let end = start;

		while (end + 1 < known.length && known[end + 1].value === known[start].value) end += 1;

		for (let i = start; i <= end; i += 1) rank[known[i].index] = start + 1;

		start = end + 1;
	}

	return { rank, ranked: known.length };
}

/**
 * Scores every area against the others in the same list.
 *
 * Returned keyed by area code because callers join it back onto their own area objects, and
 * because the compare page's Tampere tab looks up municipal scores that were computed over the
 * full national list rather than over its own eight.
 */
export function scoreAreas<A extends { code: string }>(
	areas: A[],
	indicators: Indicator<A>[]
): Map<string, ScoreBreakdown> {
	const totalWeight = indicators.reduce((sum, indicator) => sum + indicator.weight, 0);

	// One pass per indicator, ranking the whole column at once — percentile is a property of the
	// distribution, so it can't be computed area by area.
	const percentiles = indicators.map((indicator) =>
		percentileRanks(
			areas.map((area) => indicator.valueOf(area)),
			indicator.higherIsBetter
		)
	);

	// The same columns as positions rather than shares: "116th of 304 on jobs" is the thing a
	// reader can act on, where a percentile is the thing the score is actually built from. The
	// panel shows both.
	const ranks = indicators.map((indicator) =>
		competitionRanks(
			areas.map((area) => indicator.valueOf(area)),
			indicator.higherIsBetter
		)
	);

	const scored = areas.map((area, areaIndex) => {
		const parts: ScorePart[] = indicators.map((indicator, i) => {
			const value = indicator.valueOf(area);

			return {
				key: indicator.key,
				label: indicator.label,
				percentile: percentiles[i][areaIndex],
				rank: ranks[i].rank[areaIndex],
				ranked: ranks[i].ranked,
				value,
				formatted: indicator.format(value)
			};
		});

		const present = indicators.filter((_, i) => parts[i].percentile !== null);
		const coverage = totalWeight
			? present.reduce((sum, indicator) => sum + indicator.weight, 0) / totalWeight
			: 0;

		// Weighted mean over the indicators that *are* present. Below the coverage floor this
		// never reaches the reader — but the arithmetic is the same either way, so the panel's
		// partial branch renders a real number rather than a special case.
		const weighted = parts.reduce(
			(sum, part, i) =>
				part.percentile === null ? sum : sum + part.percentile * indicators[i].weight,
			0
		);
		const presentWeight = present.reduce((sum, indicator) => sum + indicator.weight, 0);

		return {
			code: area.code,
			breakdown: {
				score: coverage >= MIN_COVERAGE && presentWeight ? weighted / presentWeight : null,
				scorePercentile: null as number | null,
				rank: null as number | null,
				ranked: 0,
				parts,
				isPartial: coverage < 1
			} satisfies ScoreBreakdown
		};
	});

	// Rank descending: 1 is the best score. Ties take the same rank, and the next rank skips
	// accordingly ("competition ranking"), so a rank always answers "how many are ahead of me".
	const ordered = scored
		.filter((entry) => entry.breakdown.score !== null)
		.sort((a, b) => (b.breakdown.score as number) - (a.breakdown.score as number));

	ordered.forEach((entry, index) => {
		const previous = ordered[index - 1];

		entry.breakdown.rank =
			previous && previous.breakdown.score === entry.breakdown.score
				? (previous.breakdown.rank as number)
				: index + 1;
		entry.breakdown.ranked = ordered.length;
	});

	// `ranked` is a property of the whole set, so unscored areas carry it too — their panel still
	// says what they were measured against.
	for (const entry of scored) entry.breakdown.ranked = ordered.length;

	// One more ranking pass, over the scores themselves — see `scorePercentile`. Reuses the same
	// tie and null handling as the per-indicator ranks, so 1st of 304 is exactly 100.
	const spread = percentileRanks(
		scored.map((entry) => entry.breakdown.score),
		true
	);

	scored.forEach((entry, index) => {
		entry.breakdown.scorePercentile = spread[index];
	});

	return new Map(scored.map((entry) => [entry.code, entry.breakdown]));
}

/**
 * A diverging scale around 50: green is the better direction, as everywhere else on the site.
 *
 * **These bands are applied to `scorePercentile`, not to `score`** — pass the wrong one and the
 * labels start lying. The edges (10 / 25 / 45 / 55 / 75 / 90) are percentile bands, so against a
 * percentile input each class holds a known share of the areas by construction: a tenth in each
 * tail, a fifth either side of the middle. Against a raw score they do not, because a mean of
 * ranks clusters towards the centre — that read 4/33/89/55/87/35/1 over the real six-indicator
 * exports, with one municipality in a class named "top 10 %".
 *
 * 50 is a true midpoint either way: with percentile inputs it is the middle by construction.
 */
/**
 * **A traffic light, not the site's shared `DIVERGING_SCALE`** — green through yellow to red,
 * where the other maps run green through neutral grey to red.
 *
 * The grey midpoint is right on those maps: it marks "at the reference figure", a place where the
 * measure has nothing to say. Here the midpoint is "middling", which is a verdict rather than an
 * absence, and yellow is the idiom every reader already knows for it. This is the only map with a
 * composite verdict on it, so it's the only one that gets the traffic light.
 *
 * Magnitude still survives red-green colour blindness, because each arm is monotone in lightness
 * from the yellow outwards — the property the grey-midpoint scales have too. Both arms pass all
 * four checks of the `dataviz` skill's `validate_palette.js --ordinal` against `MAP_SURFACE`
 * (light ends 2,07:1 green and 2,34:1 warm). Re-run per arm if they're re-picked; the yellow is
 * exempt from the light-end floor for the same reason the shared neutral grey is — a midpoint is
 * meant to recede.
 */
export const SCORE_CLASSES = [
	{ min: -Infinity, label: 'bottom 10 %', color: '#9a2929', ink: '#ffffff' },
	{ min: 10, label: 'well below average', color: '#c25e28', ink: '#ffffff' },
	{ min: 25, label: 'below average', color: '#e2913f', ink: 'var(--map-ink)' },
	{ min: 45, label: 'about average', color: '#ecd15f', ink: 'var(--map-ink)' },
	{ min: 55, label: 'above average', color: '#87bd5c', ink: 'var(--map-ink)' },
	{ min: 75, label: 'well above average', color: '#4f9445', ink: 'var(--map-ink)' },
	{ min: 90, label: 'top 10 %', color: '#1d6835', ink: '#ffffff' }
] as const;

/** Index of the neutral, "about average" class. */
const AVERAGE_CLASS = 3;

function scoreClassIndex(percentile: number | null): number {
	return percentile === null
		? AVERAGE_CLASS
		: SCORE_CLASSES.findLastIndex((c) => percentile >= c.min);
}

/**
 * Areas with no score are hatched, same as on every other map — never given a flat grey.
 *
 * @param percentile `ScoreBreakdown.scorePercentile`, not `score`.
 */
export function scoreColorFor(percentile: number | null): string {
	return percentile === null ? NO_DATA_COLOR : SCORE_CLASSES[scoreClassIndex(percentile)].color;
}

/** "above average", "top 10 %" — the words the panel's chip puts on the colour. */
export function scoreLabelFor(percentile: number | null): string {
	return percentile === null ? 'no score' : SCORE_CLASSES[scoreClassIndex(percentile)].label;
}

/** Text colour for a chip filled with that class's colour, measured per colour in the palette. */
export function inkOnScore(percentile: number | null): string {
	return SCORE_CLASSES[scoreClassIndex(percentile)].ink;
}
