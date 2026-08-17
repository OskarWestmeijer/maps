<script lang="ts">
	import { onMount } from 'svelte';
	import MapShell from '$lib/interactive/MapShell.svelte';
	import StatRow from '$lib/interactive/StatRow.svelte';
	import { ageColorFor, ageDeviation, inkOnAge } from '$lib/interactive/age';
	import {
		emptyAgeViews,
		loadAgeViews,
		type AgeArea,
		type AgeViews
	} from '$lib/interactive/liveData';
	import { decimal, formatDate, formatPeriod, sourceLine } from '$lib/interactive/format';
	import type { RegionId } from '$lib/interactive/views';

	let { data } = $props();

	// `data` is geometry only (built once, see +page.server.ts); the figures are fetched from
	// /data/ on mount, so the refresh cron can update them without a rebuild.
	let loaded = $state<AgeViews | null>(null);
	const views = $derived(loaded ?? emptyAgeViews(data));
	let failed = $state(false);

	onMount(async () => {
		loaded = await loadAgeViews(data);
		failed = loaded.finland.period === '';
	});

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

	// Green is young, red is old, pivoting on the median municipality rather than the national
	// mean — only 58 of the 308 are below 44,1 years. Same reference on every tab.
	function fillFor(area: AgeArea): string {
		return area.averageAge === null
			? 'url(#no-data)'
			: ageColorFor(area.averageAge, view.medianAge);
	}

	/** "44,1" — one decimal, the precision the source publishes. */
	function years(value: number | null): string {
		return value === null ? 'no data' : decimal(value);
	}

	/** "−7,4 yrs" — always signed, so the two directions read as one scale. */
	function signedYears(value: number): string {
		return `${value > 0 ? '+' : value < 0 ? '−' : ''}${decimal(Math.abs(value))} yrs`;
	}

	/** "14,3 %" */
	function share(value: number | null): string {
		return value === null ? '—' : `${decimal(value)} %`;
	}
</script>

<svelte:head>
	<title>Maps | Average age</title>
</svelte:head>

<MapShell
	bind:region
	views={shellViews}
	metric="Average age"
	{fillFor}
	valueLabel={(area) => `${years(area.averageAge)} years`}
>
	{#snippet panel({ displayed, regionLabel })}
		<!--
			With nothing hovered the panel falls back to the view's own figures: the published
			whole-country row on Finland and Region, and a population-weighted roll-up of the eight
			municipalities on Tampere Metro. A mean combines exactly when it's weighted, so unlike
			the income map every tab has a headline.
		-->
		{@const area = displayed ?? view.total}
		{@const isCountryTotal = !displayed && region !== 'tampere'}
		{@const deviation = isCountryTotal ? null : ageDeviation(area.averageAge, view.medianAge)}

		<h2 class="display-wide text-xl font-bold">{area.name || regionLabel}</h2>

		{#if area.regionName}
			<!-- Which maakunta it's in — the region is what locates an unfamiliar municipality. -->
			<p class="stat-label mt-0.5" style:color="var(--ink-faint)">{area.regionName}</p>
		{/if}

		{#if failed}
			<p class="mt-2 text-xs" style:color="var(--ink-faint)">
				Live figures unavailable — the statistics couldn't be loaded.
			</p>
		{/if}

		<p class="stat-label mt-4">Average age</p>
		<p class="display-wide mt-0.5 text-5xl leading-none font-bold">
			{years(area.averageAge)}
		</p>
		<p class="stat-label mt-1" style:color="var(--ink-faint)">
			years, {view.period || '—'}
		</p>

		{#if deviation !== null}
			<!-- The exact colour the map filled this area with, carrying the number that explains
			     it. Against the median municipality, because that is what the colour does. -->
			<p
				class="mt-2.5 inline-flex items-baseline gap-1.5 rounded-full py-1 pr-3 pl-2.5 text-xs font-semibold"
				style:background={ageColorFor(area.averageAge, view.medianAge)}
				style:color={inkOnAge(area.averageAge, view.medianAge)}
			>
				<span class="display-wide text-sm">{signedYears(deviation)}</span>
				<span class="font-medium opacity-90">vs median municipality</span>
			</p>
		{:else if view.medianAge !== null && view.countryAge !== null}
			<!-- Same job as the education map's: explain the grey band, and why it isn't Finland. -->
			<p class="mt-2.5 text-xs leading-relaxed" style:color="var(--ink-faint)">
				Grey is the median municipality, {years(view.medianAge)} years — half are above, half below. Finland's
				own {years(view.countryAge)} is lower because young people live in cities.
			</p>
		{/if}

		<div class="mt-4 border-t border-base-300 pt-2">
			<StatRow label="Under 15" value={share(area.underFifteen)} />
			<StatRow label="65 and over" value={share(area.overSixtyFour)} />
		</div>
	{/snippet}

	{#snippet sources({ region: activeRegion, areaNoun })}
		<section>
			<div class="mb-1 flex flex-wrap items-center gap-2">
				<h3 class="text-sm font-semibold">Average age</h3>
				<span class="badge badge-sm badge-neutral">Register</span>
				<span class="badge badge-outline badge-sm">On this map</span>
			</div>
			<p>Mean age of everyone living in the {areaNoun} on 31 December.</p>
			<p class="mt-1">
				From the population register, counted rather than surveyed. Finland runs 34,1 years in Luoto
				to 59,5 in Rääkkylä.
			</p>
			<p class="mt-1 text-base-content/60">
				{sourceLine(
					view.source && `${view.source} (PxWeb 11ra)`,
					view.period && formatPeriod(view.period),
					view.polled && `polled ${formatDate(view.polled)}`
				)}
			</p>
		</section>

		<section class="mt-3 border-t border-base-300 pt-3">
			<div class="mb-1 flex flex-wrap items-center gap-2">
				<h3 class="text-sm font-semibold">What the colours pivot on</h3>
			</div>
			<p>Green below the median municipality (48,6 years), red above.</p>
			<p class="mt-1">
				Not Finland's own 44,1: only 58 of the 308 municipalities are below that, so pivoting there
				would leave the map almost entirely red.
			</p>
			<p class="mt-1">
				Green for younger is a choice, not a finding — the compare map scores a lower average age as
				the better direction, and this map matches it.
			</p>
		</section>

		{#if activeRegion === 'tampere'}
			<section class="mt-3 border-t border-base-300 pt-3">
				<div class="mb-1 flex flex-wrap items-center gap-2">
					<h3 class="text-sm font-semibold">The metro total</h3>
					<span class="badge badge-outline badge-sm">Weighted</span>
				</div>
				<p>
					No published row for these eight, so the headline is their mean age weighted by
					population. Exact, unlike a median — but it has to be weighted, or Vesilahti would count
					as much as Tampere.
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
					Statistics Finland's own regional figures, not averages of the municipalities inside them.
				</p>
			</section>
		{/if}

		<section class="mt-3 border-t border-base-300 pt-3 text-base-content/60">
			<dl class="grid grid-cols-[auto_1fr] gap-x-3">
				<dt class="font-semibold">Boundaries</dt>
				<dd>Maanmittauslaitos</dd>

				<dt class="font-semibold">Scale</dt>
				<dd>Diverging, 7 classes around the median municipality (48,6 yrs)</dd>
			</dl>
		</section>
	{/snippet}
</MapShell>
