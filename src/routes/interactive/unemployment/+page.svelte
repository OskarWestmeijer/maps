<script lang="ts">
	import { onMount } from 'svelte';
	import MapShell from '$lib/interactive/MapShell.svelte';
	import StatRow from '$lib/interactive/StatRow.svelte';
	import type { Kunta } from '$lib/interactive/finland';
	import { colorFor } from '$lib/interactive/unemployment';
	import { TAMPERE_REGION } from '$lib/interactive/regions';
	import { count, formatDate, formatPeriod, percent, sourceLine } from '$lib/interactive/format';
	import {
		emptyUnemploymentViews,
		loadUnemploymentViews,
		type UnemploymentViews
	} from '$lib/interactive/liveData';
	import type { RegionId } from '$lib/interactive/views';

	let { data } = $props();

	// `data` is geometry only (built once, see +page.server.ts); the figures are fetched from
	// /data/ on mount, so the refresh cron can update them without a rebuild. Until they land,
	// `views` holds the same shapes with every figure null — which the map already renders as
	// its no-data hatch and the panel as em dashes, so no separate loading state is needed.
	let loaded = $state<UnemploymentViews | null>(null);
	const views = $derived(loaded ?? emptyUnemploymentViews(data));
	let failed = $state(false);

	onMount(async () => {
		loaded = await loadUnemploymentViews(data);
		// A period only ever comes from the register file, so an empty one means it didn't load.
		failed = loaded.finland.period === '';
	});

	// All three tabs are in `views` at once — switching just picks which one to render, no
	// navigation and no second fetch. The shell drives the tabs; this page keeps `region` so
	// its panel can read the matching payload (survey row, software-jobs figures).
	let region = $state<RegionId>('finland');
	const view = $derived(
		region === 'finland' ? views.finland : region === 'maakunta' ? views.maakunta : views.tampere
	);
	const shellViews = $derived({
		finland: {
			areas: views.finland.kuntas,
			viewBox: views.finland.viewBox,
			period: views.finland.period,
			polled: views.finland.polled
		},
		maakunta: {
			areas: views.maakunta.kuntas,
			viewBox: views.maakunta.viewBox,
			period: views.maakunta.period,
			polled: views.maakunta.polled
		},
		tampere: {
			areas: views.tampere.kuntas,
			viewBox: views.tampere.viewBox,
			period: views.tampere.period,
			polled: views.tampere.polled
		}
	});

	/** "+1,4" / "−0,8" — a real minus sign, and always signed so the two read as a pair. */
	function signedPoints(value: number): string {
		return `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(1).replace('.', ',')}`;
	}

	function fillFor(kunta: Kunta): string {
		return kunta.rate === null ? 'url(#no-data)' : colorFor(kunta.rate, view.countryRate);
	}
</script>

<svelte:head>
	<title>Maps | Unemployment</title>
</svelte:head>

<MapShell
	bind:region
	views={shellViews}
	metric="Unemployment"
	{fillFor}
	valueLabel={(kunta) => percent(kunta.rate)}
>
	{#snippet panel({ displayed, region: activeRegion, regionLabel })}
		<!--
			The panel shows the same shape of data whether an area is hovered/selected or not —
			only the name, and where the numbers come from, differ.
		-->
		{@const panelName = displayed?.name ?? regionLabel}
		{@const panelRate = displayed?.rate ?? view.national.rate}
		{@const softwareStats = displayed
			? (view.softwareJobs.stats.get(displayed.code) ?? null)
			: view.softwareJobs.national}
		<!--
			The deviation chip is suppressed when the panel *is* the national figure, which would
			trivially read "0,0". True for both Finland and Region (a coarser view of the same
			whole country) — only Tampere Metro's blank state is a genuinely different, smaller area.
		-->
		{@const isCountryTotal = !displayed && activeRegion !== 'tampere'}
		{@const deviation =
			panelRate !== null && view.countryRate !== null && !isCountryTotal
				? panelRate - view.countryRate
				: null}

		<h2 class="display-wide text-xl font-bold">{panelName}</h2>

		{#if failed}
			<!-- The figures live in /data/, so they can be missing while the page itself is fine.
			     Say so, rather than leaving a map of em dashes to be read as real data. -->
			<p class="mt-2 text-xs" style:color="var(--ink-faint)">
				Live figures unavailable — the statistics couldn't be loaded.
			</p>
		{/if}

		<p class="stat-label mt-4">Unemployment rate</p>
		<p class="display-wide mt-0.5 text-5xl leading-none font-bold">{percent(panelRate)}</p>

		{#if deviation !== null}
			<!--
				The device that lets the map go legend-free: the same colour the map filled this
				area with, carrying the number that explains it. Reads as "+1,4 pts vs Finland", so
				the hue never has to be decoded on its own.
			-->
			<p
				class="mt-2.5 inline-flex items-baseline gap-1.5 rounded-full py-1 pr-3 pl-2.5 text-xs font-semibold"
				style:background={colorFor(panelRate, view.countryRate)}
				style:color={deviation >= 0.75 || deviation < -0.75 ? '#ffffff' : 'var(--map-ink)'}
			>
				<span class="display-wide text-sm">{signedPoints(deviation)}</span>
				<span class="font-medium opacity-90">pts vs Finland</span>
			</p>
		{/if}

		<div class="mt-4 border-t border-base-300 pt-2">
			<StatRow
				label="Unemployed"
				value={count(displayed?.unemployed ?? view.national.unemployed)}
			/>
			<StatRow label="Vacancies" value={count(displayed?.vacancies ?? view.national.vacancies)} />
		</div>

		<!--
			Personal-interest slice, not part of the register/survey pair above: unemployed
			jobseekers and open vacancies for the three software/app development occupation
			groups (12ti). `softwareStats` already picks the right source whether or not
			something is hovered.
		-->
		<div class="mt-4 border-t border-base-300 pt-3">
			<p class="stat-label mb-1 flex items-center gap-1.5">
				<span aria-hidden="true">💻</span>
				<span>Software &amp; app development</span>
			</p>
			<StatRow label="Unemployed" value={count(softwareStats?.unemployed ?? null)} />
			<StatRow label="Vacancies" value={count(softwareStats?.vacancies ?? null)} />
		</div>

		{#if isCountryTotal && view.survey.rate !== null}
			<!--
				The headline figure most people know, national-only — hidden on the regional view,
				since it has no municipal/regional breakdown to pair with a regional rate. Shown
				next to the register rate on purpose: seeing 10,5 % and 12,8 % labelled side by
				side is what stops the map's higher numbers reading as an error.
			-->
			<div class="mt-4 border-t border-base-300 pt-3">
				<StatRow label="Työttömyysaste" value={percent(view.survey.rate)} />
				<p class="mt-0.5 text-xs" style:color="var(--ink-faint)">
					Tilastokeskus's headline rate. Survey-based.
				</p>
			</div>
		{/if}
	{/snippet}

	{#snippet sources({ areaNoun })}
		<section>
			<div class="mb-1 flex flex-wrap items-center gap-2">
				<h3 class="text-sm font-semibold">Registered jobseekers</h3>
				<span class="badge badge-sm badge-neutral">Register</span>
				<span class="badge badge-outline badge-sm">On this map</span>
			</div>
			<p>
				Everyone signed on with the employment service as unemployed, as a share of the labour
				force. Published per municipality and region, alongside the open vacancies registered with
				the service on the same reference day (all occupations).
			</p>
			<p class="mt-1 text-base-content/60">
				{sourceLine(
					view.source,
					view.period && formatPeriod(view.period),
					view.polled && `polled ${formatDate(view.polled)}`
				)}
			</p>
		</section>

		<section class="mt-3 border-t border-base-300 pt-3">
			<div class="mb-1 flex flex-wrap items-center gap-2">
				<h3 class="text-sm font-semibold">Työttömyysaste</h3>
				<span class="badge badge-sm badge-neutral">Survey</span>
				<span class="badge badge-outline badge-sm">Headline rate</span>
			</div>
			<p>
				Tilastokeskus's headline rate, from a monthly sample survey on the ILO definition. National
				only — no per-area breakdown, so it's hidden on the {TAMPERE_REGION.label} view and whenever a
				{areaNoun} is hovered or selected.
			</p>
			<p class="mt-1 text-base-content/60">
				{sourceLine(
					'Tilastokeskus, työvoimatutkimus',
					view.survey.period && formatPeriod(view.survey.period)
				)}
			</p>
		</section>

		<section class="mt-3 border-t border-base-300 pt-3">
			<div class="mb-1 flex flex-wrap items-center gap-2">
				<h3 class="text-sm font-semibold">Software &amp; app development jobs</h3>
				<span class="badge badge-sm badge-neutral">Register</span>
				<span class="badge badge-outline badge-sm">Side panel only</span>
			</div>
			<p>
				Unemployed jobseekers and open vacancies for web/multimedia developers, applications
				programmers, and other software &amp; app developers and analysts (occupation codes 2513,
				2514, 2519), summed. Not used to colour the map.
			</p>
			<!-- Its own period and poll date: 12ti is a separate file on a separate cycle. -->
			<p class="mt-1 text-base-content/60">
				{sourceLine(
					'KEHA-keskus, Työnvälitystilasto (PxWeb 12ti)',
					view.softwareJobs.period && formatPeriod(view.softwareJobs.period),
					view.softwareJobs.polled && `polled ${formatDate(view.softwareJobs.polled)}`
				)}
			</p>
		</section>

		<section class="mt-3 border-t border-base-300 pt-3 text-base-content/60">
			<dl class="grid grid-cols-[auto_1fr] gap-x-3">
				<dt class="font-semibold">Boundaries</dt>
				<dd>Maanmittauslaitos</dd>

				<dt class="font-semibold">Labour force</dt>
				<dd>Tilastokeskus, työssäkäyntitilasto</dd>
			</dl>
		</section>
	{/snippet}
</MapShell>
