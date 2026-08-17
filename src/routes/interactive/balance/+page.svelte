<script lang="ts">
	import { onMount } from 'svelte';
	import MapShell from '$lib/interactive/MapShell.svelte';
	import StatRow from '$lib/interactive/StatRow.svelte';
	import { balanceColorFor, imbalance, inkOnBalance } from '$lib/interactive/balance';
	import {
		emptyBalanceViews,
		loadBalanceViews,
		type BalanceArea,
		type BalanceViews
	} from '$lib/interactive/liveData';
	import { count, decimal, formatDate, formatPeriod, sourceLine } from '$lib/interactive/format';
	import type { RegionId } from '$lib/interactive/views';

	let { data } = $props();

	let loaded = $state<BalanceViews | null>(null);
	const views = $derived(loaded ?? emptyBalanceViews(data));
	let failed = $state(false);

	onMount(async () => {
		loaded = await loadBalanceViews(data);
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

	// Green where the split is even, red where it isn't — anchored on 50 %, a constant, so unlike
	// every other map there's no reference to pass in and nothing that could shift between tabs.
	function fillFor(area: BalanceArea): string {
		return area.womenShare === null ? 'url(#no-data)' : balanceColorFor(area.womenShare);
	}

	/** "50,5 %" */
	function share(value: number | null): string {
		return value === null ? 'no data' : `${decimal(value)} %`;
	}

	/** "2,2 pts from even" — the mapped measure, which is what the chip's colour encodes. */
	function fromEven(gap: number): string {
		return gap === 0 ? 'an even split' : `${decimal(gap)} pts from even`;
	}
</script>

<svelte:head>
	<title>Maps | Gender balance</title>
</svelte:head>

<MapShell
	bind:region
	views={shellViews}
	metric="Gender balance"
	{fillFor}
	valueLabel={(area) => `${share(area.womenShare)} women`}
>
	{#snippet panel({ displayed, regionLabel })}
		{@const area = displayed ?? view.total}
		{@const gap = imbalance(area.womenShare)}

		<h2 class="display-wide text-xl font-bold">{area.name || regionLabel}</h2>

		{#if area.regionName}
			<p class="stat-label mt-0.5" style:color="var(--ink-faint)">{area.regionName}</p>
		{/if}

		{#if failed}
			<p class="mt-2 text-xs" style:color="var(--ink-faint)">
				Live figures unavailable — the statistics couldn't be loaded.
			</p>
		{/if}

		<p class="stat-label mt-4">Share of women</p>
		<p class="display-wide mt-0.5 text-5xl leading-none font-bold">
			{share(area.womenShare)}
		</p>
		<p class="stat-label mt-1" style:color="var(--ink-faint)">
			of the population, {view.period || '—'}
		</p>

		{#if gap !== null}
			<!--
				The chip carries the mapped measure itself — the distance from an even split, which is
				exactly what the colour encodes. Direction is deliberately not in here: the headline
				share above it and the two counts below already say which way, and a chip whose
				number and whose tint answered different questions would be worse than no chip.

				Shown on the national panel too, unlike the other maps': the country is not at parity
				either, so there is nothing trivial about its 0,5.
			-->
			<p
				class="mt-2.5 inline-flex items-baseline gap-1.5 rounded-full py-1 pr-3 pl-2.5 text-xs font-semibold"
				style:background={balanceColorFor(area.womenShare)}
				style:color={inkOnBalance(area.womenShare)}
			>
				<span class="display-wide text-sm">{fromEven(gap)}</span>
			</p>
		{/if}

		<div class="mt-4 border-t border-base-300 pt-2">
			<StatRow label="Women" value={count(area.women)} />
			<StatRow label="Men" value={count(area.men)} />
		</div>
	{/snippet}

	{#snippet sources({ region: activeRegion, areaNoun })}
		<section>
			<div class="mb-1 flex flex-wrap items-center gap-2">
				<h3 class="text-sm font-semibold">Gender balance</h3>
				<span class="badge badge-sm badge-neutral">Register</span>
				<span class="badge badge-outline badge-sm">On this map</span>
			</div>
			<p>
				How far the {areaNoun} is from an even split of women and men, in percentage points. The panel
				leads with the share of women it's measured from.
			</p>
			<p class="mt-1">
				Finland is 0,5 points off even (50,5 % women). Municipalities run from exactly even in
				Pihtipudas and Mäntsälä to 7,4 points in Sottunga, which has 58 men to 43 women.
			</p>
			<p class="mt-1 text-base-content/60">
				{sourceLine(
					view.source && `${view.source} (PxWeb 11re)`,
					view.period && formatPeriod(view.period),
					view.polled && `polled ${formatDate(view.polled)}`
				)}
			</p>
		</section>

		<section class="mt-3 border-t border-base-300 pt-3">
			<div class="mb-1 flex flex-wrap items-center gap-2">
				<h3 class="text-sm font-semibold">What the colours pivot on</h3>
			</div>
			<p>Green where the split is even, red where it's lopsided.</p>
			<p class="mt-1">
				One axis, not two: the map answers how far from even, not which sex outnumbers the other.
				The share above and the counts below say which way.
			</p>
			<p class="mt-1">
				The bands tighten towards the green end because that's where the country sits — the median
				municipality is 0,9 points off even, and only 27 of the 308 are past 2,8.
			</p>
		</section>

		{#if activeRegion !== 'finland'}
			<section class="mt-3 border-t border-base-300 pt-3">
				<div class="mb-1 flex flex-wrap items-center gap-2">
					<h3 class="text-sm font-semibold">
						{activeRegion === 'maakunta' ? 'Regional figures' : 'The metro total'}
					</h3>
					<span class="badge badge-outline badge-sm">Summed</span>
				</div>
				<p>
					This export publishes no regional rows — only the whole country and the 308 municipalities
					— so both are summed from the municipalities inside them, and the share is recomputed from
					the sums.
				</p>
			</section>
		{/if}

		<section class="mt-3 border-t border-base-300 pt-3 text-base-content/60">
			<dl class="grid grid-cols-[auto_1fr] gap-x-3">
				<dt class="font-semibold">Boundaries</dt>
				<dd>Maanmittauslaitos</dd>

				<dt class="font-semibold">Scale</dt>
				<dd>7 classes, green at an even split to red at 4+ points off</dd>
			</dl>
		</section>
	{/snippet}
</MapShell>
