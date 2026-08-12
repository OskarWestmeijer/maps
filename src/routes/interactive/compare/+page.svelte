<script lang="ts">
	import { onMount } from 'svelte';
	import MapShell from '$lib/interactive/MapShell.svelte';
	import { inkOnScore, scoreColorFor, scoreLabelFor } from '$lib/interactive/score';
	import { shortRegionName } from '$lib/interactive/regions';
	import {
		emptyCompareViews,
		loadCompareViews,
		type CompareArea,
		type CompareViews
	} from '$lib/interactive/liveData';
	import { decimal, formatDate, formatPeriod, sourceLine } from '$lib/interactive/format';
	import type { RegionId } from '$lib/interactive/views';

	let { data } = $props();

	// Geometry from `+page.server.ts`, figures from `/data/` on mount — same split as the other
	// two maps, so the refresh cron moves this one too. Until they land every area is unscored,
	// which the map already draws as its no-data hatch.
	let loaded = $state<CompareViews | null>(null);
	const views = $derived(loaded ?? emptyCompareViews(data));
	let failed = $state(false);

	onMount(async () => {
		loaded = await loadCompareViews(data);
		// Both tables feed the score, so either one missing leaves the map blank — the period
		// is the signal that the register file at least arrived.
		failed = loaded.finland.period === '' || loaded.finland.populationPeriod === '';
	});

	let region = $state<RegionId>('finland');
	const view = $derived(
		region === 'finland' ? views.finland : region === 'maakunta' ? views.maakunta : views.tampere
	);

	// The two tables are released on different cycles, so the shell's one-period line is given
	// both rather than quoting whichever happens to come first.
	const periodLabel = $derived(
		view.period && view.populationPeriod
			? `${formatPeriod(view.period)} & ${formatPeriod(view.populationPeriod)}`
			: undefined
	);

	const shellViews = $derived({
		finland: { ...views.finland, periodLabel },
		maakunta: { ...views.maakunta, periodLabel },
		tampere: { ...views.tampere, periodLabel }
	});

	/**
	 * The two ends of the current tab's ranking, for the panel's no-selection state. Unscored
	 * areas are left out — they have no rank to sit at either end of.
	 */
	const ends = $derived.by(() => {
		const ranked = view.areas
			.filter((area) => area.score.rank !== null)
			.sort((a, b) => (a.score.rank as number) - (b.score.rank as number));

		return {
			highest: ranked.slice(0, 5),
			// Whatever is left after the top five, capped at five. On Finland's 304 that's the
			// bottom five; on Tampere Metro's eight it's the remaining three, so no municipality
			// can appear in both lists — a plain `slice(-5)` put Ylöjärvi and Kangasala in each.
			lowest: ranked.slice(Math.max(5, ranked.length - 5)).reverse()
		};
	});

	/**
	 * Whether the ranking earns its region column: on Tampere Metro every row is Pirkanmaa, and
	 * a column repeating one word eight times is noise that costs the names their space.
	 */
	const showRegion = $derived(
		new Set([...ends.highest, ...ends.lowest].map((area) => area.regionName)).size > 1
	);

	/** "68,4" — the score itself, or a word where there isn't one. */
	function scoreValue(score: number | null): string {
		return score === null ? 'no score' : decimal(score);
	}

	function fillFor(area: CompareArea): string {
		// Hatched, not the flat backing grey `scoreColorFor` returns — a fourth grey sitting
		// beside the neutral middle class would read as "average" rather than "no score". Same
		// treatment as the other two maps.
		return area.score.score === null ? 'url(#no-data)' : scoreColorFor(area.score.score);
	}
</script>

<svelte:head>
	<title>Maps | Compare</title>
</svelte:head>

<MapShell
	bind:region
	views={shellViews}
	metric="Score"
	{fillFor}
	valueLabel={(area) => scoreValue(area.score.score)}
>
	{#snippet panel({ displayed, areaNoun, select })}
		<!--
			Unlike the other two maps there is no whole-country fallback here: a composite score
			for "Finland" would have to be Finland's percentile among itself, which is meaningless.
			With nothing selected the panel explains the measure instead.
		-->
		<h2 class="display-wide text-xl font-bold">{displayed?.name ?? 'Score'}</h2>

		{#if displayed?.regionName}
			<!-- Which maakunta it's in, on every hover: 308 municipality names are not something
			     anyone holds in their head, and the region is what locates an unfamiliar one. -->
			<p class="stat-label mt-0.5" style:color="var(--ink-faint)">{displayed.regionName}</p>
		{/if}

		{#if failed}
			<!-- Both tables feed the score, so this is the one map where a single missing file
			     empties everything — say so rather than showing a hatched country. -->
			<p class="mt-2 text-xs" style:color="var(--ink-faint)">
				Live figures unavailable — the statistics couldn't be loaded.
			</p>
		{:else if !displayed}
			<p class="mt-2 text-sm" style:color="var(--ink-muted)">
				Unemployment rate and population change, combined into one score per {areaNoun}.
			</p>

			<!--
				The other two maps fill this state with the whole-country figures. A national
				composite would be Finland's percentile among itself, so the ends of the ranking go
				here instead — which is what a reader opening a comparison page came for, and it
				doubles as the way into the map: each row selects its area.
			-->
			{#each [{ title: 'Highest', areas: ends.highest }, { title: 'Lowest', areas: ends.lowest }] as group (group.title)}
				{#if group.areas.length}
					<div class="mt-3 border-t border-base-300 pt-2">
						<p class="stat-label mb-1">{group.title}</p>
						<!--
						A grid rather than a flex row per line, so rank, name, region and score line up
						down both blocks as a table would. `minmax(0,1fr)` on the name is what lets a
						long one truncate instead of pushing the score off the edge.
					-->
						<div
							class="grid items-baseline gap-x-2"
							style:grid-template-columns={showRegion
								? '1.75rem minmax(0, 1fr) auto auto'
								: '1.75rem minmax(0, 1fr) auto'}
						>
							{#each group.areas as area (area.code)}
								<!--
								`grid-cols-subgrid` on the row so its cells are laid out by the grid above
								while the button stays one control — a wrapper element per row would break
								the column alignment.
							-->
								<button
									type="button"
									class="ranking-row col-span-full grid grid-cols-subgrid rounded text-left hover:bg-base-200"
									onclick={() => select(area)}
								>
									<span class="stat-label" style:color="var(--ink-faint)">{area.score.rank}</span>
									<span class="truncate text-sm">{area.name}</span>
									{#if showRegion}
										<!-- Which maakunta it's in: at the two ends of the national ranking the
									     same few regions recur, which is most of what the list has to say.
									     Shortened here and only here — the panel shows the full name. -->
										<span class="stat-label text-right" style:color="var(--ink-faint)">
											{shortRegionName(area.regionName)}
										</span>
									{/if}
									<span class="display-wide w-10 text-right text-sm font-bold">
										{scoreValue(area.score.score)}
									</span>
								</button>
							{/each}
						</div>
					</div>
				{/if}
			{/each}
		{/if}

		{#if displayed}
			{@const breakdown = displayed.score}

			<p class="stat-label mt-3">Score</p>
			<p class="display-wide mt-0.5 text-5xl leading-none font-bold">
				{scoreValue(breakdown.score)}
			</p>
			<p class="stat-label mt-1" style:color="var(--ink-faint)">
				{breakdown.rank === null
					? `unranked of ${breakdown.ranked}`
					: `rank ${breakdown.rank} of ${breakdown.ranked}`}
			</p>

			{#if breakdown.score !== null}
				<!--
					The device that lets the map go legend-free, same as on the other two: the exact
					colour the map filled this area with, carrying what it means in words.
				-->
				<p
					class="mt-2.5 inline-flex items-baseline gap-1.5 rounded-full py-1 pr-3 pl-2.5 text-xs font-semibold"
					style:background={scoreColorFor(breakdown.score)}
					style:color={inkOnScore(breakdown.score)}
				>
					<span class="display-wide text-sm">{scoreLabelFor(breakdown.score)}</span>
				</p>
			{/if}

			<!--
				What the score is made of, as an actual table: one row per domain, the published
				figure in one column and where it puts this area in the distribution in the next —
				the number the score is a mean of. It was one string ("9,5 % · 62") under a
				"figure · percentile" caption, which made the reader decode two different kinds of
				number out of one cell every time.
			-->
			<div class="mt-3 border-t border-base-300 pt-2">
				<!-- No caption above it: the column headers already say what the table is. -->
				<table class="score-table w-full">
					<thead>
						<tr>
							<th scope="col" class="stat-label text-left">Indicator</th>
							<th scope="col" class="stat-label text-right">Figure</th>
							<th scope="col" class="stat-label text-right">Percentile</th>
						</tr>
					</thead>
					<tbody>
						{#each breakdown.parts as part (part.key)}
							<tr>
								<th scope="row" class="text-left text-sm font-normal">{part.label}</th>
								<td class="text-right text-sm">{part.formatted}</td>
								<!-- The percentile carries the display face, because it's the column the
								     score is actually computed from. -->
								<td class="display-wide text-right text-sm font-bold">
									{part.percentile === null ? '—' : decimal(part.percentile, 0)}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			{#if breakdown.score === null}
				<!--
					The coverage floor, explained where it bites. Without this the reader sees a
					published figure sitting next to "no score" and reads it as a bug.
				-->
				<p class="mt-3 text-xs" style:color="var(--ink-faint)">
					Not scored: {breakdown.parts
						.filter((part) => part.percentile === null)
						.map((part) => part.label)
						.join(' and ')} isn't published for this {areaNoun}, and a score built on the rest would
					rank it on its remaining strengths alone.
				</p>
			{/if}
		{/if}
	{/snippet}

	{#snippet sources({ region: activeRegion, areaNoun })}
		<section>
			<div class="mb-1 flex flex-wrap items-center gap-2">
				<h3 class="text-sm font-semibold">How the score works</h3>
				<span class="badge badge-sm badge-neutral">Derived</span>
			</div>
			<p>
				Not an official statistic — a composite built here from the figures the other maps show.
				Each indicator is turned into a <em>percentile rank</em> (how many {areaNoun}s it beats),
				and the score is the mean of those ranks. Ranking rather than scaling keeps one extreme
				value from squashing everything else, at the cost of magnitude: the raw figure behind every
				rank is shown beside it in the panel.
			</p>
			<p class="mt-1">
				An area is scored only when <em>every</em> indicator is published for it. Scoring on whichever
				ones happen to exist would quietly re-weight them to 100 % — done that way, the four Åland municipalities
				with no published unemployment rate top the country on their population figure alone. Those areas
				are hatched instead.
			</p>
		</section>

		<section class="mt-3 border-t border-base-300 pt-3">
			<h3 class="mb-1 text-sm font-semibold">What goes into it</h3>
			<dl class="grid grid-cols-[auto_1fr] gap-x-3">
				<dt class="font-semibold">Jobs</dt>
				<dd>Registered unemployment rate — lower is better</dd>

				<dt class="font-semibold">People</dt>
				<dd>Population change per 1 000 — higher is better</dd>
			</dl>
			<p class="mt-1 text-base-content/60">
				Equal weights. Education, economy and housing are intended to join them; each is one more
				indicator in the same mean.
			</p>
		</section>

		{#if activeRegion === 'maakunta'}
			<section class="mt-3 border-t border-base-300 pt-3">
				<div class="mb-1 flex flex-wrap items-center gap-2">
					<h3 class="text-sm font-semibold">Regional scores</h3>
					<span class="badge badge-outline badge-sm">Not comparable</span>
				</div>
				<p>
					Regions are ranked against the other 18, not against the 308 municipalities — a percentile
					only means something within one set of areas. A region's score and a municipality's are
					not on the same scale. The regional unemployment rate is the employment service's own
					published figure; the population change is summed from the region's municipalities, which
					the export doesn't publish.
				</p>
			</section>
		{/if}

		<section class="mt-3 border-t border-base-300 pt-3 text-base-content/60">
			<p>
				{sourceLine(
					view.source && `${view.source} (PxWeb 12r5)`,
					view.period && formatPeriod(view.period),
					view.polled && `polled ${formatDate(view.polled)}`
				)}
			</p>
			<p class="mt-1">
				{sourceLine(
					view.populationSource && `${view.populationSource} (PxWeb 121w)`,
					view.populationPeriod && formatPeriod(view.populationPeriod),
					view.populationPolled && `polled ${formatDate(view.populationPolled)}`
				)}
			</p>
			<p class="mt-1">Boundaries · Maanmittauslaitos</p>
		</section>
	{/snippet}
</MapShell>

<style>
	/* Padding on the row rather than each cell, so the hover highlight covers the whole line
	   while the subgrid keeps the four columns aligned across both blocks. */
	.ranking-row {
		padding: 0.125rem 0.25rem;
	}

	.ranking-row:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: -2px;
	}

	/* Column rules rather than row rules: the figures are what have to be scanned down, and a
	   hairline under the header is enough to separate it from the body. */
	.score-table th,
	.score-table td {
		padding: 0.2rem 0;
	}

	.score-table thead th {
		border-bottom: 1px solid var(--color-base-300);
		padding-bottom: 0.25rem;
	}

	.score-table tbody tr:first-child th,
	.score-table tbody tr:first-child td {
		padding-top: 0.35rem;
	}
</style>
