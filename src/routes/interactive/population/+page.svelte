<script lang="ts">
	import MapShell from '$lib/interactive/MapShell.svelte';
	import StatRow from '$lib/interactive/StatRow.svelte';
	import { densityColorFor, inkOnDensity } from '$lib/interactive/population';
	import type { PopulationArea } from '$lib/interactive/loadPopulationViews';
	import { count, decimal, formatPeriod, signed } from '$lib/interactive/format';
	import type { RegionId } from '$lib/interactive/views';

	let { data } = $props();

	// All three tabs ship in one payload (built at build time, see +page.server.ts); the tabs
	// switch client-side. `region` lives here rather than only in the shell so the panel can
	// read the matching view's totals.
	let region = $state<RegionId>('finland');
	const view = $derived(
		region === 'finland' ? data.finland : region === 'maakunta' ? data.maakunta : data.tampere
	);
	const shellViews = $derived({
		finland: {
			areas: data.finland.areas,
			viewBox: data.finland.viewBox,
			period: data.finland.period
		},
		maakunta: {
			areas: data.maakunta.areas,
			viewBox: data.maakunta.viewBox,
			period: data.maakunta.period
		},
		tampere: {
			areas: data.tampere.areas,
			viewBox: data.tampere.viewBox,
			period: data.tampere.period
		}
	});

	function fillFor(area: PopulationArea): string {
		return area.density === null ? 'url(#no-data)' : densityColorFor(area.density);
	}

	/** "12,4 / km²" — the mapped figure, in the panel and in every area's accessible label. */
	function perKm2(density: number | null): string {
		return density === null ? 'no data' : `${decimal(density)} / km²`;
	}

	/**
	 * How many times the national density an area sits at. A *ratio*, not the unemployment
	 * map's difference in points: density spans four orders of magnitude, so "+3 217,5 per km²
	 * vs Finland" for Helsinki would be arithmetic rather than a comparison, while "×174" is
	 * the fact. Precision shrinks as the number grows, since ×174,3 claims more than it means.
	 */
	function ratioLabel(ratio: number): string {
		const digits = ratio >= 10 ? 0 : ratio >= 1 ? 1 : 2;

		return `×${ratio.toFixed(digits).replace('.', ',')}`;
	}
</script>

<svelte:head>
	<title>Maps | Population</title>
</svelte:head>

<MapShell
	bind:region
	views={shellViews}
	metric="Population density"
	{fillFor}
	valueLabel={(area) => perKm2(area.density)}
>
	{#snippet panel({ displayed, areaNoun })}
		<!--
			Same shape whether or not an area is hovered/selected: without one, the panel shows
			the whole view's totals (the country, or the metro region's roll-up).
		-->
		{@const area = displayed ?? view.total}
		<!--
			The comparison is suppressed when the panel *is* the national figure, which would
			trivially read "×1,0" — same rule as the unemployment map's deviation chip. Region is
			the whole country at coarser granularity, so its blank state is national too; only
			Tampere Metro's is a genuinely different, smaller area.
		-->
		{@const isCountryTotal = !displayed && region !== 'tampere'}
		{@const ratio =
			area.density !== null && view.countryDensity && !isCountryTotal
				? area.density / view.countryDensity
				: null}

		<h2 class="display-wide text-xl font-bold">{area.name}</h2>

		<p class="stat-label mt-4">Population density</p>
		<p class="display-wide mt-0.5 text-5xl leading-none font-bold">{decimal(area.density)}</p>
		<p class="stat-label mt-1" style:color="var(--ink-faint)">inhabitants per km² of land</p>

		{#if ratio !== null}
			<!--
				The same device as the unemployment map's deviation chip, and what lets both maps
				go legend-free: the exact colour the map filled this area with, carrying the number
				that explains it — so the hue never has to be decoded on its own, and every area
				answers the question the panel is really asked, "compared with Finland?".
			-->
			<p
				class="mt-2.5 inline-flex items-baseline gap-1.5 rounded-full py-1 pr-3 pl-2.5 text-xs font-semibold"
				style:background={densityColorFor(area.density)}
				style:color={inkOnDensity(area.density)}
			>
				<span class="display-wide text-sm">{ratioLabel(ratio)}</span>
				<span class="font-medium opacity-90">vs Finland</span>
			</p>
		{:else if area.density !== null}
			<!--
				The national figure itself: no ratio to show, but the density's own place on the
				scale is still worth stating, and it keeps the block from collapsing when nothing
				is hovered.
			-->
			<p class="mt-2.5 text-xs" style:color="var(--ink-faint)">
				The whole-country average — every {areaNoun} is compared against this.
			</p>
		{/if}

		<div class="mt-4 border-t border-base-300 pt-2">
			<StatRow label="Population" value={count(area.population)} />
			<StatRow label="Land area" value={`${count(Math.round(area.landArea ?? 0))} km²`} />
		</div>

		<!--
			The flows behind the headcount, for the whole year the export covers — labelled,
			because a change figure is meaningless without the span it happened over. Annual
			rather than monthly on purpose; see the note at the top of `population.ts`.
		-->
		<div class="mt-4 border-t border-base-300 pt-3">
			<p class="stat-label mb-1">Change during {formatPeriod(view.period)}</p>
			<StatRow label="Natural change" value={signed(area.naturalChange)} />
			<StatRow label="Net migration" value={signed(area.netMigration)} />
			<StatRow label="Total" value={signed(area.totalChange)} />
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
			<p class="mt-1 text-base-content/60">
				{view.source} (PxWeb 121w) · {formatPeriod(view.period)}
			</p>
		</section>

		<section class="mt-3 border-t border-base-300 pt-3">
			<div class="mb-1 flex flex-wrap items-center gap-2">
				<h3 class="text-sm font-semibold">Land area</h3>
				<span class="badge badge-outline badge-sm">The denominator</span>
			</div>
			<p>
				Official land area (maa-pinta-ala) per municipality, carried by the boundary data rather
				than by any statistics table — water is excluded, which is why sparsely-settled lake
				districts don't come out lighter than they are.
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
				<dd>7 classes, roughly logarithmic</dd>
			</dl>
		</section>
	{/snippet}
</MapShell>
