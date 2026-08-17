<script lang="ts">
	import { onMount } from 'svelte';
	import MapShell from '$lib/interactive/MapShell.svelte';
	import StatRow from '$lib/interactive/StatRow.svelte';
	import {
		educationColorFor,
		educationDeviation,
		inkOnEducation
	} from '$lib/interactive/education';
	import {
		emptyEducationViews,
		loadEducationViews,
		type EducationArea,
		type EducationViews
	} from '$lib/interactive/liveData';
	import { count, decimal, formatDate, formatPeriod, sourceLine } from '$lib/interactive/format';
	import type { RegionId } from '$lib/interactive/views';

	let { data } = $props();

	// `data` is geometry only (built once, see +page.server.ts); the figures are fetched from
	// /data/ on mount, so the refresh cron can update them without a rebuild. Until they land,
	// every figure is null — which the map already renders as its no-data hatch.
	let loaded = $state<EducationViews | null>(null);
	const views = $derived(loaded ?? emptyEducationViews(data));
	let failed = $state(false);

	onMount(async () => {
		loaded = await loadEducationViews(data);
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

	// Diverging around the *median municipality*, not the national share — only 42 of the 308
	// reach 34,5 %, so pivoting on Finland would paint 86 % of the map red. The reference is the
	// same on every tab, so an area never changes colour when the tab flips.
	function fillFor(area: EducationArea): string {
		return area.tertiaryShare === null
			? 'url(#no-data)'
			: educationColorFor(area.tertiaryShare, view.medianShare);
	}

	/** "34,5 %" — one decimal, the precision the source publishes. */
	function share(value: number | null): string {
		return value === null ? 'no data' : `${decimal(value)} %`;
	}

	/** "+6,2 pts" — always signed, so the two directions read as one scale. */
	function signedPoints(value: number): string {
		return `${value > 0 ? '+' : value < 0 ? '−' : ''}${decimal(Math.abs(value))} pts`;
	}
</script>

<svelte:head>
	<title>Maps | Higher education</title>
</svelte:head>

<MapShell
	bind:region
	views={shellViews}
	metric="Share with a higher education degree"
	{fillFor}
	valueLabel={(area) => share(area.tertiaryShare)}
>
	{#snippet panel({ displayed, regionLabel })}
		<!--
			Without a hovered or selected area the panel falls back to the view's own figures: the
			published whole-country row on Finland and Region, and an exact roll-up of the eight
			municipalities on Tampere Metro. Unlike the income map there is no tab without one — a
			share of a headcount can be combined, a median can't.
		-->
		{@const area = displayed ?? view.total}
		<!--
			The chip is suppressed when the panel is the whole country, which is not an area on this
			map and is the very figure the midpoint deliberately isn't. A line naming the midpoint
			takes its place below.
		-->
		{@const isCountryTotal = !displayed && region !== 'tampere'}
		{@const deviation = isCountryTotal
			? null
			: educationDeviation(area.tertiaryShare, view.medianShare)}

		<h2 class="display-wide text-xl font-bold">{area.name || regionLabel}</h2>

		{#if area.regionName}
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

		<p class="stat-label mt-4">Higher education</p>
		<p class="display-wide mt-0.5 text-5xl leading-none font-bold">
			{share(area.tertiaryShare)}
		</p>
		<p class="stat-label mt-1" style:color="var(--ink-faint)">
			of 15+, {view.period || '—'}
		</p>

		{#if deviation !== null}
			<!--
				The device that lets the map go legend-free: the exact colour the map filled this
				area with, carrying the number that explains it. Percentage *points*, not percent —
				the measure is itself a percentage, and a percentage of a percentage is a decode
				rather than a comparison.

				It compares to the median municipality rather than to Finland because that is what
				the colour does, and a chip whose number and whose tint answered different questions
				would be worse than no chip.
			-->
			<p
				class="mt-2.5 inline-flex items-baseline gap-1.5 rounded-full py-1 pr-3 pl-2.5 text-xs font-semibold"
				style:background={educationColorFor(area.tertiaryShare, view.medianShare)}
				style:color={inkOnEducation(area.tertiaryShare, view.medianShare)}
			>
				<span class="display-wide text-sm">{signedPoints(deviation)}</span>
				<span class="font-medium opacity-90">vs median municipality</span>
			</p>
		{:else if view.medianShare !== null && view.countryShare !== null}
			<!--
				What replaces the chip on the national panel. It is not a caption for an absence:
				the country's own share sitting ten points above the median municipality is exactly
				why the map's midpoint is the municipality and not the country, and this is the one
				place to say it.
			-->
			<p class="mt-2.5 text-xs leading-relaxed" style:color="var(--ink-faint)">
				Grey is the median municipality, {share(view.medianShare)} — half are above, half below. Finland's
				own {share(view.countryShare)} is higher because graduates cluster in cities.
			</p>
		{/if}

		<!--
			The rest of the distribution the headline is one slice of. The three shares stop about 1 %
			short of 100: the remainder is erikoisammattikoulutusaste, a specialist vocational level
			between the second and tertiary ones. A hint saying so was cut by request — if the gap
			ever needs explaining, the Sources popover is the place, not a third line here.
		-->
		<div class="mt-4 border-t border-base-300 pt-2">
			<p class="stat-label mb-1">Highest qualification</p>
			<StatRow label="Second level" value={share(area.secondLevelShare)} />
			<StatRow label="No post-basic" value={share(area.noPostBasicShare)} />
		</div>

		<div class="mt-4 border-t border-base-300 pt-2">
			<!--
				Koulutustasomittain, roughly the mean years of schooling past comprehensive x 100. It
				answers what three shares can't: a municipality with many second-level degrees and one
				with a few doctorates can land on the same tertiary share. Bare, the number means
				nothing — so the hint carries the national figure and the range, as the income map's
				Gini row does.
			-->
			<StatRow
				label="Education level"
				value={area.levelIndex === null ? '—' : decimal(area.levelIndex)}
				hint="Mean level of the 20+ population, indexed. Finland 403,2; municipalities 250–611."
			/>
		</div>

		<div class="mt-4 border-t border-base-300 pt-2">
			<StatRow label="People counted" value={count(area.population15)} />
		</div>
	{/snippet}

	{#snippet sources({ region: activeRegion, areaNoun })}
		<section>
			<div class="mb-1 flex flex-wrap items-center gap-2">
				<h3 class="text-sm font-semibold">Education</h3>
				<span class="badge badge-sm badge-neutral">Register</span>
				<span class="badge badge-outline badge-sm">On this map</span>
			</div>
			<p>
				Share of each {areaNoun}'s 15+ population with a tertiary degree — university,
				ammattikorkeakoulu, or the older lowest-tertiary qualifications.
			</p>
			<p class="mt-1">
				From the qualification register, not a survey. A degree earned abroad and never registered
				here doesn't count.
			</p>
			<p class="mt-1 text-base-content/60">
				{sourceLine(
					view.source && `${view.source} (PxWeb 12bs)`,
					view.period && formatPeriod(view.period),
					view.polled && `polled ${formatDate(view.polled)}`
				)}
			</p>
		</section>

		<section class="mt-3 border-t border-base-300 pt-3">
			<div class="mb-1 flex flex-wrap items-center gap-2">
				<h3 class="text-sm font-semibold">What the colours pivot on</h3>
			</div>
			<p>Green above the median municipality (24,5 %), red below.</p>
			<p class="mt-1">
				Not Finland's own 34,5 %: only 42 of the 308 municipalities reach that, so pivoting there
				would leave the map almost entirely red.
			</p>
		</section>

		{#if activeRegion === 'tampere'}
			<section class="mt-3 border-t border-base-300 pt-3">
				<div class="mb-1 flex flex-wrap items-center gap-2">
					<h3 class="text-sm font-semibold">The metro total</h3>
					<span class="badge badge-outline badge-sm">Summed</span>
				</div>
				<p>
					No published row for these eight, so the headline is summed from them: their
					degree-holders over their 15+ residents. Exact, unlike a median.
				</p>
				<p class="mt-1">The education level index can't be summed that way, so it's blank.</p>
			</section>
		{/if}

		{#if activeRegion === 'maakunta'}
			<section class="mt-3 border-t border-base-300 pt-3">
				<div class="mb-1 flex flex-wrap items-center gap-2">
					<h3 class="text-sm font-semibold">Regional figures</h3>
					<span class="badge badge-sm badge-neutral">Published</span>
				</div>
				<p>
					Statistics Finland's own regional shares, not averages of the municipalities inside them.
				</p>
			</section>
		{/if}

		<section class="mt-3 border-t border-base-300 pt-3 text-base-content/60">
			<dl class="grid grid-cols-[auto_1fr] gap-x-3">
				<dt class="font-semibold">Boundaries</dt>
				<dd>Maanmittauslaitos</dd>

				<dt class="font-semibold">Scale</dt>
				<dd>Diverging, 7 classes around the median municipality (24,5 %)</dd>
			</dl>
		</section>
	{/snippet}
</MapShell>
