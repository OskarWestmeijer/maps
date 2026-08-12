<script lang="ts">
	import { onMount } from 'svelte';
	import MapShell from '$lib/interactive/MapShell.svelte';
	import StatRow from '$lib/interactive/StatRow.svelte';
	import { changeColorFor, changeLabelFor, inkOnChange } from '$lib/interactive/population';
	import {
		emptyPopulationViews,
		loadPopulationViews,
		type PopulationArea,
		type PopulationViews
	} from '$lib/interactive/liveData';
	import {
		count,
		decimal,
		formatDate,
		formatPeriod,
		signed,
		sourceLine
	} from '$lib/interactive/format';
	import type { RegionId } from '$lib/interactive/views';

	let { data } = $props();

	// `data` is geometry only (built once, see +page.server.ts); the figures are fetched from
	// /data/ on mount, so the refresh cron can update them without a rebuild. Until they land,
	// every figure is null — which the map already renders as its no-data hatch.
	let loaded = $state<PopulationViews | null>(null);
	const views = $derived(loaded ?? emptyPopulationViews(data));
	let failed = $state(false);

	onMount(async () => {
		loaded = await loadPopulationViews(data);
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

	function fillFor(area: PopulationArea): string {
		return area.change === null ? 'url(#no-data)' : changeColorFor(area.change);
	}

	/** "+14,9 per 1 000" — always signed, so growth and decline read as one scale. */
	function perMille(change: number | null): string {
		if (change === null) return 'no data';

		const sign = change > 0 ? '+' : change < 0 ? '−' : '';

		return `${sign}${decimal(Math.abs(change))} per 1 000`;
	}

	/** Signed, one decimal — for the "vs Finland" gap, which is in the same per-mille units. */
	function signedDecimal(value: number): string {
		return `${value > 0 ? '+' : value < 0 ? '−' : ''}${decimal(Math.abs(value))}`;
	}
</script>

<svelte:head>
	<title>Maps | Population change</title>
</svelte:head>

<MapShell
	bind:region
	views={shellViews}
	metric="Population change"
	{fillFor}
	valueLabel={(area) => perMille(area.change)}
>
	{#snippet panel({ displayed })}
		<!--
			Same shape whether or not an area is hovered/selected: without one, the panel shows
			the whole view's totals (the country, or the metro region's roll-up).
		-->
		{@const area = displayed ?? view.total}
		<!--
			The gap to the national trend, in the same per-mille units the map is drawn in. The row
			stays put on the national panel rather than disappearing — a vanishing row shifts
			everything under it — but reads "baseline" there instead of a trivially true 0,0.
		-->
		{@const isCountryTotal = !displayed && region !== 'tampere'}
		{@const vsFinland =
			area.change !== null && view.countryChange !== null ? area.change - view.countryChange : null}

		<h2 class="display-wide text-xl font-bold">{area.name}</h2>

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

		<p class="stat-label mt-3">Population change</p>
		<p class="display-wide mt-0.5 text-5xl leading-none font-bold">
			{area.change === null ? 'no data' : signedDecimal(area.change)}
		</p>
		<p class="stat-label mt-1" style:color="var(--ink-faint)">
			per 1 000 inhabitants, {formatPeriod(view.period)}
		</p>

		{#if area.change !== null}
			<!--
				The device that lets the map go legend-free, same as the unemployment map's chip: the
				exact colour the map filled this area with, carrying what that colour means in words.
				The scale is anchored at zero rather than at the national figure, so the chip names
				the direction — which is what the hue encodes — and the "vs Finland" row below
				carries the comparison.
			-->
			<p
				class="mt-2.5 inline-flex items-baseline gap-1.5 rounded-full py-1 pr-3 pl-2.5 text-xs font-semibold"
				style:background={changeColorFor(area.change)}
				style:color={inkOnChange(area.change)}
			>
				<span class="display-wide text-sm">{changeLabelFor(area.change)}</span>
			</p>
		{/if}

		<div class="mt-3 border-t border-base-300 pt-2">
			<StatRow label="Net change" value={`${signed(area.totalChange)} people`} />
			<StatRow
				label="vs Finland"
				value={isCountryTotal
					? 'baseline'
					: vsFinland === null
						? '—'
						: `${signedDecimal(vsFinland)} pts`}
			/>
		</div>

		<!--
			The parts the headline is the sum of: whether an area's change came from births and
			deaths or from people moving. Nationally the two flows point opposite ways — natural
			change −13 377 against net migration +31 233 — which is the whole story of the map.

			The third part is not a flow: Väkiluvun korjaus, people added to or removed from the
			register without a birth, death or move behind it. Without it these rows visibly fail
			to add up to Net change (Föglö: −5 and +11 against a headline +10), so it's shown —
			but only where it's nonzero, which spares the 88 municipalities that have none a row
			of "±0".
		-->
		<div class="mt-3 border-t border-base-300 pt-2">
			<p class="stat-label mb-1">What moved it</p>
			<StatRow label="Natural change" value={signed(area.naturalChange)} />
			<StatRow label="Net migration" value={signed(area.netMigration)} />
			{#if area.correction}
				<StatRow label="Register correction" value={signed(area.correction)} />
			{/if}
		</div>

		<div class="mt-3 border-t border-base-300 pt-2">
			<StatRow label="Population" value={count(area.population)} />
			<StatRow
				label="Density"
				value={area.density === null ? '—' : `${decimal(area.density)} / km²`}
			/>
		</div>
	{/snippet}

	{#snippet sources({ region: activeRegion, areaNoun })}
		<section>
			<div class="mb-1 flex flex-wrap items-center gap-2">
				<h3 class="text-sm font-semibold">Population</h3>
				<span class="badge badge-sm badge-neutral">Register</span>
				<span class="badge badge-outline badge-sm">On this map</span>
			</div>
			<p>
				Population at the end of the year, from the population information system, plus that year's
				births, deaths and moves. The map shows it as density — inhabitants per km² of
				<em>land</em>, so a {areaNoun} isn't diluted by the lakes and sea inside its boundary.
			</p>
			<p class="mt-1">
				Net change is Tilastokeskus's Kokonaismuutos, which is the two flows plus Väkiluvun korjaus
				— register corrections with no birth, death or move behind them. That row appears in the
				panel whenever it isn't zero, so the parts always add up to the total.
			</p>
			<p class="mt-1 text-base-content/60">
				{sourceLine(
					view.source && `${view.source} (PxWeb 121w)`,
					view.period && formatPeriod(view.period),
					view.polled && `polled ${formatDate(view.polled)}`
				)}
			</p>
		</section>

		<section class="mt-3 border-t border-base-300 pt-3">
			<div class="mb-1 flex flex-wrap items-center gap-2">
				<h3 class="text-sm font-semibold">Density</h3>
				<span class="badge badge-outline badge-sm">Side panel only</span>
			</div>
			<p>
				The panel's density is that population over the official land area (maa-pinta-ala) the
				boundary data carries — water excluded, so a {areaNoun} isn't diluted by the lakes and sea inside
				its boundary. It doesn't colour the map.
			</p>
			<p class="mt-1 text-base-content/60">Maanmittauslaitos</p>
		</section>

		{#if activeRegion === 'maakunta'}
			<section class="mt-3 border-t border-base-300 pt-3">
				<div class="mb-1 flex flex-wrap items-center gap-2">
					<h3 class="text-sm font-semibold">Regional figures</h3>
					<span class="badge badge-outline badge-sm">Derived</span>
				</div>
				<p>
					This export has no region rows, so each region's population and land area are summed from
					the municipalities whose geometry falls inside it. Checked against the employment
					service's own published region totals, which the same grouping reproduces exactly.
				</p>
			</section>
		{/if}

		<section class="mt-3 border-t border-base-300 pt-3 text-base-content/60">
			<dl class="grid grid-cols-[auto_1fr] gap-x-3">
				<dt class="font-semibold">Boundaries</dt>
				<dd>Maanmittauslaitos</dd>

				<dt class="font-semibold">Scale</dt>
				<dd>Diverging, 7 classes around zero</dd>
			</dl>
		</section>
	{/snippet}
</MapShell>
