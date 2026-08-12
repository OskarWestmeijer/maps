<script lang="ts">
	import { onMount } from 'svelte';
	import MapShell from '$lib/interactive/MapShell.svelte';
	import StatRow from '$lib/interactive/StatRow.svelte';
	import { incomeColorFor, incomeDeviation, inkOnIncome } from '$lib/interactive/income';
	import {
		emptyIncomeViews,
		loadIncomeViews,
		type IncomeArea,
		type IncomeViews
	} from '$lib/interactive/liveData';
	import { count, decimal, formatDate, formatPeriod, sourceLine } from '$lib/interactive/format';
	import type { RegionId } from '$lib/interactive/views';

	let { data } = $props();

	// `data` is geometry only (built once, see +page.server.ts); the figures are fetched from
	// /data/ on mount, so the refresh cron can update them without a rebuild. Until they land,
	// every figure is null — which the map already renders as its no-data hatch.
	let loaded = $state<IncomeViews | null>(null);
	const views = $derived(loaded ?? emptyIncomeViews(data));
	let failed = $state(false);

	onMount(async () => {
		loaded = await loadIncomeViews(data);
		// A period only ever comes from the export, so an empty one means it didn't load.
		failed = loaded.finland.period === '';
	});

	// All three tabs are in `views` at once; switching picks which one to render. `region`
	// lives here rather than only in the shell so the panel can read the matching totals.
	let region = $state<RegionId>('finland');
	const view = $derived(
		region === 'finland' ? views.finland : region === 'maakunta' ? views.maakunta : views.tampere
	);
	const shellViews = $derived({
		finland: {
			areas: views.finland.areas,
			viewBox: views.finland.viewBox,
			period: views.finland.period,
			polled: views.finland.polled
		},
		maakunta: {
			areas: views.maakunta.areas,
			viewBox: views.maakunta.viewBox,
			period: views.maakunta.period,
			polled: views.maakunta.polled
		},
		tampere: {
			areas: views.tampere.areas,
			viewBox: views.tampere.viewBox,
			period: views.tampere.period,
			polled: views.tampere.polled
		}
	});

	function fillFor(area: IncomeArea): string {
		return area.medianIncome === null
			? 'url(#no-data)'
			: incomeColorFor(area.medianIncome, view.countryMedian);
	}

	/** "30 523 €" — grouped, no decimals. Cents on a median annual income are noise. */
	function euros(value: number | null): string {
		return value === null ? 'no data' : `${count(Math.round(value))} €`;
	}

	/** "+4,5 %" — always signed, so the two directions read as one scale. */
	function signedPercent(value: number): string {
		return `${value > 0 ? '+' : value < 0 ? '−' : ''}${decimal(Math.abs(value))} %`;
	}
</script>

<svelte:head>
	<title>Maps | Median income</title>
</svelte:head>

<MapShell
	bind:region
	views={shellViews}
	metric="Median disposable income"
	{fillFor}
	valueLabel={(area) => euros(area.medianIncome)}
>
	{#snippet panel({ displayed, regionLabel })}
		<!--
			Without a hovered or selected area the panel falls back to the view's own published
			figures — except on Tampere Metro, which has none and cannot have any. See `total`
			in `liveData.ts`: a median isn't additive, and Statistics Finland publishes no row
			for this particular set of eight municipalities.
		-->
		{@const area = displayed ?? view.total}
		<!--
			The chip is suppressed when the panel *is* the national figure, which would trivially
			read "0,0 %". True for both Finland and Region — a coarser view of the same country.
		-->
		{@const isCountryTotal = !displayed && region !== 'tampere'}
		{@const deviation = isCountryTotal
			? null
			: incomeDeviation(area?.medianIncome ?? null, view.countryMedian)}

		<h2 class="display-wide text-xl font-bold">{area?.name ?? regionLabel}</h2>

		{#if area?.regionName}
			<!-- Which maakunta it's in. 308 municipality names are not something anyone holds in
			     their head, and the region is what locates an unfamiliar one. -->
			<p class="stat-label mt-0.5" style:color="var(--ink-faint)">{area.regionName}</p>
		{/if}

		{#if failed}
			<!-- The figures live in /data/, so they can be missing while the page itself is fine.
			     Say so, rather than leaving a map of em dashes to be read as real data. -->
			<p class="mt-2 text-xs" style:color="var(--ink-faint)">
				Live figures unavailable — the statistics couldn't be loaded.
			</p>
		{/if}

		{#if area === null}
			<!--
				The one tab with no headline. Every other map rolls a hand-picked region up from its
				municipalities because their measures are ratios of counts — sum both parts, divide,
				and the answer is exact. A median has no such property: it is the middle of a
				line-up, and eight separate middles don't locate the middle of the merged one
				without the household-level data, which this export doesn't ship. Rather than
				average the eight into a number that looks published and isn't, the panel says so
				and points at the eight figures that are real.
			-->
			<p class="mt-4 text-sm leading-relaxed" style:color="var(--ink-muted)">
				No combined figure for {regionLabel}.
			</p>
			<p class="mt-2 text-xs leading-relaxed" style:color="var(--ink-faint)">
				A median can't be summed the way a headcount can — combining these eight municipalities
				would need the household-level incomes behind them, and Statistics Finland publishes no row
				for this particular grouping. Pick a municipality on the map for its own published figures.
			</p>
		{:else}
			<p class="stat-label mt-4">Median income</p>
			<p class="display-wide mt-0.5 text-5xl leading-none font-bold">
				{euros(area.medianIncome)}
			</p>
			<p class="stat-label mt-1" style:color="var(--ink-faint)">
				per consumption unit, {view.period || '—'}
			</p>

			{#if deviation !== null}
				<!--
					The device that lets the map go legend-free: the exact colour the map filled this
					area with, carrying the number that explains it. A percentage rather than a euro
					gap — "+1 365 €" is arithmetic the reader still has to scale, "+4,5 % vs Finland"
					already is the comparison.

					Nothing takes its place on the national panel: the chip would read "0,0 % vs
					Finland" there, and a line saying so is a caption for an absence. The whole-country
					figure being the baseline is evident from the fact that every other panel compares
					to it.
				-->
				<p
					class="mt-2.5 inline-flex items-baseline gap-1.5 rounded-full py-1 pr-3 pl-2.5 text-xs font-semibold"
					style:background={incomeColorFor(area.medianIncome, view.countryMedian)}
					style:color={inkOnIncome(area.medianIncome, view.countryMedian)}
				>
					<span class="display-wide text-sm">{signedPercent(deviation)}</span>
					<span class="font-medium opacity-90">vs Finland</span>
				</p>
			{/if}

			<div class="mt-4 border-t border-base-300 pt-2">
				<StatRow label="Per adult" value={euros(area.personalMedian)} />
			</div>

			<!--
				The two figures the median can't show on its own: how far apart the ends are, and how
				much of the area sits under the national low-income line. Both are published per area
				— neither is derived here, for the same reason the headline isn't.

				Gini carries its scale in the label. Bare, "46,4" is unreadable to anyone who doesn't
				already know the measure runs 0 (everyone identical) to 100 (one person has it all),
				and the whole range across Finland's municipalities is 20,6 to 46,4 — narrow enough
				that without the endpoints there is nothing to judge a number against.
			-->
			<div class="mt-4 border-t border-base-300 pt-2">
				<p class="stat-label mb-1">How far apart the ends are</p>
				<StatRow
					label="Low income"
					value={area.lowIncomeRate === null ? '—' : `${decimal(area.lowIncomeRate)} %`}
				/>
				<StatRow
					label="Gini (0–100)"
					value={area.gini === null ? '—' : decimal(area.gini)}
					hint="0 = everyone earns the same, 100 = one person has it all. Finland is 28,4."
				/>
			</div>

			<!--
				Asuntoväestö, not väkiluku — the denominator every other figure on this panel is a
				share of. The gap is people who don't live in a household-dwelling (care homes,
				institutions, no permanent address): 147 435 of them nationally, so it is visibly
				*not* the population figure the population map shows, and the note says why.
			-->
			<div class="mt-4 border-t border-base-300 pt-2">
				<StatRow
					label="People counted"
					value={count(area.householdPopulation)}
					hint="People living in households — excludes care homes, institutions and those with no permanent address."
				/>
			</div>
		{/if}
	{/snippet}

	{#snippet sources({ region: activeRegion, areaNoun })}
		<section>
			<div class="mb-1 flex flex-wrap items-center gap-2">
				<h3 class="text-sm font-semibold">Income</h3>
				<span class="badge badge-sm badge-neutral">Register</span>
				<span class="badge badge-outline badge-sm">On this map</span>
			</div>
			<p>
				Median disposable income per consumption unit: what's left after taxes and transfers,
				divided by a household-size factor so a couple's income isn't compared to a single person's
				as if they were the same. The map colours each {areaNoun} by how far it sits from the national
				median, in percent.
			</p>
			<p class="mt-1">
				These figures come from the <em>register-based total data</em> behind tulonjakotilasto, not from
				the sample survey its national headline figures use — which is what makes a breakdown of all 308
				municipalities possible at all.
			</p>
			<p class="mt-1 text-base-content/60">
				{sourceLine(
					view.source && `${view.source} (PxWeb 14ww)`,
					view.period && formatPeriod(view.period),
					view.polled && `polled ${formatDate(view.polled)}`
				)}
			</p>
		</section>

		<section class="mt-3 border-t border-base-300 pt-3">
			<div class="mb-1 flex flex-wrap items-center gap-2">
				<h3 class="text-sm font-semibold">Low income &amp; Gini</h3>
				<span class="badge badge-outline badge-sm">Side panel only</span>
			</div>
			<p>
				Low income is the share of the household population below 60 % of the <em>national</em>
				median, so it compares a {areaNoun} to the country rather than to itself.
			</p>
			<p class="mt-1">
				Gini answers what a median can't: not where the middle sits, but how far apart the ends are.
				It runs 0 (everyone earns exactly the same) to 100 (one person has all of it), and across
				Finland's municipalities it spans 20,6 to 46,4 against a national 28,4. Kauniainen is why
				the two figures are separate questions — it has both the highest median in the country and
				the widest spread, because a handful of very large incomes stretch it.
			</p>
			<p class="mt-1">Neither colours the map.</p>
		</section>

		<section class="mt-3 border-t border-base-300 pt-3">
			<div class="mb-1 flex flex-wrap items-center gap-2">
				<h3 class="text-sm font-semibold">People counted</h3>
				<span class="badge badge-outline badge-sm">Side panel only</span>
			</div>
			<p>
				Asuntoväestö — the people these figures describe, which is not the same as a {areaNoun}'s
				population. It excludes anyone not living in a household-dwelling: care homes, institutions,
				long-term hospital stays and people with no permanent address. Nationally that's 147 435
				people, so this figure sits a little below the väkiluku the population map shows. It is the
				denominator the low-income share is measured against.
			</p>
		</section>

		{#if activeRegion === 'tampere'}
			<section class="mt-3 border-t border-base-300 pt-3">
				<div class="mb-1 flex flex-wrap items-center gap-2">
					<h3 class="text-sm font-semibold">Why there's no metro total</h3>
				</div>
				<p>
					The other maps roll this region up from its municipalities, because their measures are
					ratios of counts — sum the parts, divide, and the answer is exact. A median isn't
					additive: recovering it needs the household-level incomes, which this export doesn't ship.
					Statistics Finland's own Tampere sub-region row covers eleven municipalities rather than
					these eight, so it isn't a stand-in either. Each municipality's own figure is published
					and shown.
				</p>
			</section>
		{/if}

		{#if activeRegion === 'maakunta'}
			<section class="mt-3 border-t border-base-300 pt-3">
				<div class="mb-1 flex flex-wrap items-center gap-2">
					<h3 class="text-sm font-semibold">Regional figures</h3>
					<span class="badge badge-sm badge-neutral">Published</span>
				</div>
				<p>
					Each region's median is Statistics Finland's own, computed from the underlying household
					data — not an average of the municipalities inside it, which would not be a median.
				</p>
			</section>
		{/if}

		<section class="mt-3 border-t border-base-300 pt-3 text-base-content/60">
			<dl class="grid grid-cols-[auto_1fr] gap-x-3">
				<dt class="font-semibold">Boundaries</dt>
				<dd>Maanmittauslaitos</dd>

				<dt class="font-semibold">Scale</dt>
				<dd>Diverging, 7 classes around the national median</dd>
			</dl>
		</section>
	{/snippet}
</MapShell>
