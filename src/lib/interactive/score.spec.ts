import { describe, it, expect } from 'vitest';
import {
	inkOnScore,
	MIN_COVERAGE,
	percentileRanks,
	SCORE_CLASSES,
	scoreAreas,
	scoreColorFor,
	scoreLabelFor,
	type Indicator
} from './score';
import { DIVERGING_SCALE, NO_DATA_COLOR } from './unemployment';

describe('percentileRanks', () => {
	it('puts the best value at 100 and the worst at 0', () => {
		expect(percentileRanks([10, 20, 30], true)).toEqual([0, 50, 100]);
	});

	it('flips the scale when less is better, as for an unemployment rate', () => {
		// 2,5 % is the *best* rate here, so it must score 100 despite being the smallest number.
		expect(percentileRanks([2.5, 12.8, 20], false)).toEqual([100, 50, 0]);
	});

	it('gives tied values the average of the ranks they span', () => {
		// Without this, whichever of the two 20s came first in the array would outrank the other.
		expect(percentileRanks([10, 20, 20, 30], true)).toEqual([0, 50, 50, 100]);
	});

	it('keeps nulls null and leaves them out of the denominator', () => {
		// Four values, one suppressed: the remaining three are ranked as if the null weren't there.
		expect(percentileRanks([10, null, 20, 30], true)).toEqual([0, null, 50, 100]);
	});

	it('preserves input order, since callers zip the result back onto their areas', () => {
		expect(percentileRanks([30, 10, 20], true)).toEqual([100, 0, 50]);
	});

	it('scores a lone value at the midpoint rather than dividing by zero', () => {
		expect(percentileRanks([42, null], true)).toEqual([50, null]);
		expect(percentileRanks([null, null], true)).toEqual([null, null]);
	});
});

type Area = { code: string; name: string; rate: number | null; change: number | null };

const INDICATORS: Indicator<Area>[] = [
	{
		key: 'jobs',
		label: 'Jobs',
		valueOf: (a) => a.rate,
		format: (v) => (v === null ? 'no data' : `${v} %`),
		higherIsBetter: false,
		weight: 1
	},
	{
		key: 'people',
		label: 'People',
		valueOf: (a) => a.change,
		format: (v) => (v === null ? 'no data' : `${v}`),
		higherIsBetter: true,
		weight: 1
	}
];

const areas: Area[] = [
	{ code: '001', name: 'Best', rate: 5, change: 20 },
	{ code: '002', name: 'Middle', rate: 10, change: 10 },
	{ code: '003', name: 'Worst', rate: 15, change: 0 }
];

describe('scoreAreas', () => {
	const result = scoreAreas(areas, INDICATORS);

	it('averages the indicators, each weighted, onto one 0-100 figure', () => {
		expect(result.get('001')?.score).toBe(100);
		expect(result.get('002')?.score).toBe(50);
		expect(result.get('003')?.score).toBe(0);
	});

	it('ranks best first and says what the rank is out of', () => {
		expect(result.get('001')?.rank).toBe(1);
		expect(result.get('003')?.rank).toBe(3);
		expect(result.get('002')?.ranked).toBe(3);
	});

	it('carries each indicator through to the panel with its raw figure', () => {
		// The panel shows the number behind the percentile, which is what stops a rank-based
		// score being unaccountable.
		expect(result.get('002')?.parts).toEqual([
			{
				key: 'jobs',
				label: 'Jobs',
				percentile: 50,
				rank: 2,
				ranked: 3,
				value: 10,
				formatted: '10 %'
			},
			{
				key: 'people',
				label: 'People',
				percentile: 50,
				rank: 2,
				ranked: 3,
				value: 10,
				formatted: '10'
			}
		]);
	});

	it('honours weights rather than treating every indicator alike', () => {
		const weighted = scoreAreas(areas, [INDICATORS[0], { ...INDICATORS[1], weight: 3 }]);

		// Middle is 50/50 either way; a lopsided area is what shows the weight biting. Give one
		// area the best jobs figure and the worst population one: 100 and 0, weighted 1:3 => 25.
		const lopsided = scoreAreas(
			[
				{ code: 'a', name: 'A', rate: 5, change: 0 },
				{ code: 'b', name: 'B', rate: 10, change: 10 },
				{ code: 'c', name: 'C', rate: 15, change: 20 }
			],
			[INDICATORS[0], { ...INDICATORS[1], weight: 3 }]
		);

		expect(weighted.get('002')?.score).toBe(50);
		expect(lopsided.get('a')?.score).toBe(25);
	});

	it('gives tied scores the same rank, and skips the rank they share', () => {
		const tied = scoreAreas(
			[
				{ code: 'a', name: 'A', rate: 5, change: 20 },
				{ code: 'b', name: 'B', rate: 10, change: 10 },
				{ code: 'c', name: 'C', rate: 10, change: 10 }
			],
			INDICATORS
		);

		expect(tied.get('b')?.rank).toBe(2);
		expect(tied.get('c')?.rank).toBe(2);
		expect(tied.get('a')?.rank).toBe(1);
	});
});

describe('coverage floor', () => {
	// The regression this whole design exists to prevent: with a "rescale over what's present"
	// rule, an area whose only published indicator happens to be strong wins the country. Run
	// over the real exports, that was Föglö — no unemployment rate, top-quartile population
	// change, first of 308.
	const withSuppressed: Area[] = [...areas, { code: '062', name: 'Föglö', rate: null, change: 25 }];

	const result = scoreAreas(withSuppressed, INDICATORS);

	it('refuses to score an area that is missing an indicator', () => {
		expect(MIN_COVERAGE).toBe(1);
		expect(result.get('062')?.score).toBeNull();
		expect(result.get('062')?.rank).toBeNull();
	});

	it('flags the area as partial, and still shows the figures it does have', () => {
		const foglo = result.get('062');

		expect(foglo?.isPartial).toBe(true);
		expect(foglo?.parts[0]).toMatchObject({ key: 'jobs', percentile: null, formatted: 'no data' });
		// Its population figure is the best of the four, and is shown as such — it just doesn't
		// become a score on its own.
		expect(foglo?.parts[1].percentile).toBe(100);
	});

	it('still ranks the fully covered areas against each other, and says so', () => {
		expect(result.get('001')?.rank).toBe(1);
		expect(result.get('001')?.ranked).toBe(3);
		// An unscored area is measured against the same set, so its panel can say "of 3".
		expect(result.get('062')?.ranked).toBe(3);
	});

	it('still counts a partial area in the rankings for the indicators it does have', () => {
		// It is excluded only from the *jobs* ranking, where it has no figure — not from the
		// population one, where its +25 is a real published number and the best of the four. So
		// Best drops from 100 to 1st-of-2-below-it on population (66,7) while keeping 100 on
		// jobs. Dropping a partial area out of every distribution would be the wrong fix: it
		// would quietly overstate everyone ranked below it.
		expect(result.get('001')?.parts[1].percentile).toBeCloseTo(66.7, 1);
		expect(result.get('001')?.score).toBeCloseTo(83.3, 1);
		expect(result.get('002')?.score).toBeCloseTo(41.7, 1);
		expect(result.get('003')?.score).toBe(0);
	});

	it('scores nothing at all when every indicator is missing', () => {
		const blank = scoreAreas([{ code: 'x', name: 'X', rate: null, change: null }], INDICATORS);

		expect(blank.get('x')?.score).toBeNull();
		expect(blank.get('x')?.ranked).toBe(0);
	});
});

describe('scoreColorFor', () => {
	it('diverges around 50, which percentile ranking makes a true midpoint', () => {
		expect(SCORE_CLASSES.map((c) => c.min)).toEqual([-Infinity, 10, 25, 45, 55, 75, 90]);
	});

	it('is a traffic light, not the site-wide grey-midpoint scale', () => {
		// The only map carrying a composite verdict, so the only one where the middle is
		// "middling" rather than "at the reference figure" — grey says nothing, yellow does.
		expect(scoreColorFor(50)).not.toBe(DIVERGING_SCALE.neutral.color);
		expect(scoreColorFor(50)).toBe('#ecd15f');
		// Both ends stay the shared green and red, so better and worse read the same site-wide.
		expect(scoreColorFor(95)).toBe(DIVERGING_SCALE.green[2].color);
		expect(scoreColorFor(5)).toBe(DIVERGING_SCALE.red[2].color);
	});

	it('runs light at the middle to dark at both ends, so magnitude survives CVD', () => {
		// Each arm is monotone in lightness outwards from the yellow — the property that keeps a
		// red-green-blind reader able to rank two areas by depth alone.
		const luminance = (hex: string) => {
			const channel = (i: number) => {
				const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;

				return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
			};

			return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
		};
		const light = SCORE_CLASSES.map((c) => luminance(c.color));

		// Index 3 is the yellow midpoint; both directions get darker away from it.
		expect(light[3]).toBeGreaterThan(Math.max(light[2], light[4]));
		expect(light[2]).toBeGreaterThan(light[1]);
		expect(light[1]).toBeGreaterThan(light[0]);
		expect(light[4]).toBeGreaterThan(light[5]);
		expect(light[5]).toBeGreaterThan(light[6]);
	});

	it('picks the class the score falls in, edges included', () => {
		expect(scoreColorFor(45)).toBe(SCORE_CLASSES[3].color);
		expect(scoreColorFor(44.9)).toBe(SCORE_CLASSES[2].color);
		expect(scoreColorFor(90)).toBe(SCORE_CLASSES[6].color);
	});

	it('hatches an unscored area rather than giving it a flat grey of its own', () => {
		expect(scoreColorFor(null)).toBe(NO_DATA_COLOR);
		expect(scoreLabelFor(null)).toBe('no score');
	});

	it('names the class in words for the chip, and carries measured ink for it', () => {
		expect(scoreLabelFor(95)).toBe('top 10 %');
		expect(scoreLabelFor(50)).toBe('about average');
		expect(inkOnScore(95)).toBe('#ffffff');
		expect(inkOnScore(50)).toBe('var(--map-ink)');
	});
});

describe('scorePercentile', () => {
	/** n areas whose indicator values are all distinct, so every score is distinct too. */
	const spread = (n: number) =>
		Array.from({ length: n }, (_, i) => ({ code: String(i), a: i, b: i * 2 }));
	const two: Indicator<{ code: string; a: number; b: number }>[] = [
		{ key: 'a', label: 'A', valueOf: (x) => x.a, format: String, higherIsBetter: true, weight: 1 },
		{ key: 'b', label: 'B', valueOf: (x) => x.b, format: String, higherIsBetter: true, weight: 1 }
	];

	it('ranks the score itself, so the best is 100 and the worst 0', () => {
		const scored = scoreAreas(spread(11), two);

		expect(scored.get('10')?.scorePercentile).toBe(100);
		expect(scored.get('0')?.scorePercentile).toBe(0);
		expect(scored.get('5')?.scorePercentile).toBe(50);
	});

	it('is null wherever the score is', () => {
		const scored = scoreAreas(
			[{ code: 'x', a: 1, b: null as unknown as number }, ...spread(3)],
			two
		);

		expect(scored.get('x')?.score).toBeNull();
		expect(scored.get('x')?.scorePercentile).toBeNull();
	});

	it('is what the colour bands are meant to be read against, not the raw score', () => {
		// The regression this exists for. A score is a *mean* of percentile ranks, and a mean of
		// ranks clusters towards the middle — harder with every indicator added. Colouring by the
		// raw score put exactly one municipality of 304 in the class labelled "top 10 %"; ranking
		// the score first restores a tenth of the areas to each tail, whatever gets added next.
		const areas = spread(101);
		const scored = scoreAreas(areas, two);
		const percentiles = areas.map((a) => scored.get(a.code)?.scorePercentile ?? 0);

		const inTopBand = percentiles.filter((p) => p >= 90).length;
		const inBottomBand = percentiles.filter((p) => p < 10).length;

		expect(inTopBand).toBeGreaterThanOrEqual(10);
		expect(inBottomBand).toBeGreaterThanOrEqual(10);
	});

	it('gives every class its intended share of a uniform ranking', () => {
		const areas = spread(200);
		const scored = scoreAreas(areas, two);
		const labels = areas.map((a) => scoreLabelFor(scored.get(a.code)?.scorePercentile ?? null));
		const count = (label: string) => labels.filter((l) => l === label).length;

		// 10 / 15 / 20 / 10 / 20 / 15 / 10 per cent, from the 10/25/45/55/75/90 band edges.
		expect(count('top 10 %')).toBeCloseTo(20, -1);
		expect(count('about average')).toBeCloseTo(20, -1);
		expect(count('bottom 10 %')).toBeCloseTo(20, -1);
	});
});
