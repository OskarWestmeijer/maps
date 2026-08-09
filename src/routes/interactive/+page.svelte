<script lang="ts">
	import type { Kunta } from '$lib/interactive/finland';
	import { colorFor, MAP_SURFACE, NO_DATA_COLOR } from '$lib/interactive/unemployment';
	import { TAMPERE_REGION } from '$lib/interactive/regions';

	let { data } = $props();

	// Both regions are in `data` already (computed at build time, see +page.server.ts) — the
	// toggle just picks which one to render, no navigation or client fetch involved.
	let region: 'finland' | 'tampere' = $state('finland');
	const view = $derived(region === 'finland' ? data.finland : data.tampere);
	const regionLabel = $derived(region === 'finland' ? 'Finland' : TAMPERE_REGION.label);

	let hovered: Kunta | null = $state(null);

	// A selected municipality, set either by picking a search result or by clicking it on the
	// map. Distinct from `hovered`: it stays blue on the map and keeps backing the panel even
	// while hovering elsewhere, whereas hover only previews.
	let selectedCode: string | null = $state(null);
	let search = $state('');
	let searchOpen = $state(false);

	const selected = $derived(view.kuntas.find((k) => k.code === selectedCode) ?? null);
	const displayed = $derived(hovered ?? selected);
	const sortedKuntas = $derived([...view.kuntas].sort((a, b) => a.name.localeCompare(b.name)));

	// Switching region doesn't remount the page (it's a `$state` toggle, not navigation), so
	// a selection/search from one region has to be cleared by hand — otherwise it'd persist
	// pointing at a municipality that doesn't exist in the other view.
	function switchRegion(next: 'finland' | 'tampere') {
		region = next;
		hovered = null;
		selectedCode = null;
		search = '';
		searchOpen = false;
	}

	// Personal-interest slice (unemployed jobseekers + open vacancies for software/app
	// development occupations), kept separate from the choropleth's register figures — it
	// only ever backs the panel, the same as `displayed` falls back to the whole country.
	const softwareStats = $derived(
		displayed ? (view.softwareJobs.stats.get(displayed.code) ?? null) : view.softwareJobs.national
	);

	// The panel shows the same shape of data whether a municipality is hovered/selected or
	// not — only the name, and where the numbers come from, differ.
	const panelName = $derived(displayed?.name ?? regionLabel);
	const panelRate = $derived(displayed?.rate ?? view.national.rate);
	const panelUnemployed = $derived(displayed?.unemployed ?? view.national.unemployed);

	// The panel's headline device: how far this rate sits from the national one, in
	// percentage points, tinted with the very colour the map used to fill it. It's what makes
	// the diverging scale readable without a legend — the number explains the colour.
	// Suppressed when the panel *is* the national figure, which would trivially read "0,0".
	const isCountryTotal = $derived(!displayed && region === 'finland');
	const deviation = $derived(
		panelRate !== null && view.countryRate !== null && !isCountryTotal
			? panelRate - view.countryRate
			: null
	);

	// The viewBox is in metres (EPSG:3067), not pixels, so the no-data hatch has to be sized
	// off it — a fixed 6-unit pattern would be sub-millimetre on a 671 km-wide map. Deriving
	// it from the current viewBox keeps the hatch visually identical across both regions.
	const hatch = $derived(Number(view.viewBox.split(' ')[2]) / 160);

	/** "+1,4" / "−0,8" — a real minus sign, and always signed so the two read as a pair. */
	function signedPoints(value: number): string {
		return `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(1).replace('.', ',')}`;
	}

	// Plain native <input list> renders Chrome's calendar-picker-style dropdown arrow, which
	// reads as a combo/multi-select and doesn't match the rest of the UI — so matches are
	// filtered and rendered by hand instead of via <datalist>.
	//
	// Prefix matches are ranked before other substring matches: with a query like "Ra", names
	// that merely contain it ("Aura", "Lappeenranta", ...) would otherwise crowd "Rauma" out
	// of the top slice.
	const searchMatches = $derived.by(() => {
		const q = search.trim().toLowerCase();

		if (!q) return [];

		const starts = sortedKuntas.filter((k) => k.name.toLowerCase().startsWith(q));
		const contains = sortedKuntas.filter(
			(k) => !k.name.toLowerCase().startsWith(q) && k.name.toLowerCase().includes(q)
		);

		return [...starts, ...contains].slice(0, 8);
	});

	const SELECTED_FILL = '#2563eb';

	function selectKunta(kunta: Kunta) {
		selectedCode = kunta.code;
		search = kunta.name;
		searchOpen = false;
	}

	function clearSearch() {
		search = '';
		selectedCode = null;
	}

	// Formatted by hand rather than via toLocaleString: these strings are prerendered and
	// then hydrated, and ICU group separators differ between Node and browser builds,
	// which would trip a hydration mismatch.
	function count(value: number | null): string {
		return value === null ? '—' : String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
	}

	function percent(value: number | null): string {
		return value === null ? 'no data' : `${value.toFixed(1).replace('.', ',')} %`;
	}

	/** "2026M06" -> "June 2026" */
	function formatPeriod(period: string): string {
		const match = /^(\d{4})M(\d{2})$/.exec(period);

		if (!match) return period;

		const month = new Date(Number(match[1]), Number(match[2]) - 1).toLocaleString('en', {
			month: 'long'
		});

		return `${month} ${match[1]}`;
	}
</script>

<svelte:head>
	<title>Maps | Interactive</title>
</svelte:head>

<!--
	On large screens the page is pinned to one viewport: `main` takes the height left over
	by the navbar and footer, the SVG box flexes into whatever the period/sources row does
	not use, and the map letterboxes inside it. Below `lg` it stacks and scrolls, as it
	should on a phone.
-->
<main
	class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-4 lg:h-[calc(100dvh-9.5rem)] lg:flex-row"
>
	<div class="flex min-h-0 flex-1 flex-col gap-3">
		<!--
			Underline tabs rather than a filled pill group: the map below is already a big
			field of colour, and a solid control fighting it for attention was most of what
			made the old header feel busy.
		-->
		<div class="flex items-center gap-6 border-b border-base-300" role="tablist">
			{#each [{ id: 'finland', label: 'Finland' }, { id: 'tampere', label: TAMPERE_REGION.label }] as const as tab (tab.id)}
				<button
					type="button"
					role="tab"
					aria-selected={region === tab.id}
					class="region-tab"
					class:is-active={region === tab.id}
					onclick={() => switchRegion(tab.id)}
				>
					{tab.label}
				</button>
			{/each}
		</div>

		<!--
			The sheet fills the whole map column and stays the same size in both regions; the
			SVG letterboxes inside it. Sizing it to each region's own aspect ratio instead would
			make the frame jump width when the tab changes.
		-->
		<div
			class="max-h-[70vh] min-h-0 flex-1 rounded-lg lg:max-h-none"
			style:background={MAP_SURFACE}
		>
			<svg
				viewBox={view.viewBox}
				class="h-full w-full"
				role="img"
				aria-label={`Unemployment by municipality in ${regionLabel}`}
			>
				<defs>
					<!--
						Municipalities with no published rate are hatched, not given a fourth grey:
						next to the scale's neutral midpoint another flat grey would read as a data
						class rather than an absence. Hatching for "no data" is the cartographic
						convention.
					-->
					<pattern id="no-data" width={hatch} height={hatch} patternUnits="userSpaceOnUse">
						<rect width={hatch} height={hatch} fill={NO_DATA_COLOR} />
						<path d={`M0,${hatch} l${hatch},-${hatch}`} stroke="#c9ced6" stroke-width={hatch / 4} />
					</pattern>
				</defs>

				{#each view.kuntas as kunta (kunta.code)}
					<path
						d={kunta.d}
						class="kunta"
						class:hovered={hovered?.code === kunta.code}
						class:selected={selected?.code === kunta.code}
						fill={selected?.code === kunta.code
							? SELECTED_FILL
							: kunta.rate === null
								? 'url(#no-data)'
								: colorFor(kunta.rate, view.countryRate)}
						vector-effect="non-scaling-stroke"
						role="button"
						tabindex="0"
						aria-label={`${kunta.name}, ${percent(kunta.rate)}`}
						onmouseenter={() => (hovered = kunta)}
						onmouseleave={() => (hovered = null)}
						onfocus={() => (hovered = kunta)}
						onblur={() => (hovered = null)}
						onclick={() => selectKunta(kunta)}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								selectKunta(kunta);
							}
						}}
					/>
				{/each}
			</svg>
		</div>

		<div class="flex items-center justify-end gap-3 text-xs" style:color="var(--ink-muted)">
			<!-- Kept out of the panel so the period stays visible while hovering a municipality. -->
			<span class="stat-label">
				Data from {formatPeriod(view.period)}
			</span>

			<!-- `details` carries the open/close state and keyboard support without any JS. -->
			<details class="dropdown dropdown-end dropdown-top">
				<summary class="btn gap-1 btn-ghost font-normal btn-xs">
					<svg class="size-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
						<path
							fill-rule="evenodd"
							d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 012 0v4a1 1 0 11-2 0V9zm1-4a1 1 0 100 2 1 1 0 000-2z"
							clip-rule="evenodd"
						/>
					</svg>
					Sources
				</summary>

				<div
					class="dropdown-content z-10 max-h-[70vh] w-96 overflow-y-auto rounded-box bg-base-100 p-4 text-xs leading-relaxed shadow-lg"
				>
					<section>
						<div class="mb-1 flex flex-wrap items-center gap-2">
							<h3 class="text-sm font-semibold">Registered jobseekers</h3>
							<span class="badge badge-sm badge-neutral">Register</span>
							<span class="badge badge-outline badge-sm">On this map</span>
						</div>
						<p>
							Everyone signed on with the employment service as unemployed, as a share of the labour
							force. Published per municipality.
						</p>
						<p class="mt-1 text-gray-500">{view.source} · {formatPeriod(view.period)}</p>
					</section>

					<section class="mt-3 border-t border-gray-200 pt-3">
						<div class="mb-1 flex flex-wrap items-center gap-2">
							<h3 class="text-sm font-semibold">Työttömyysaste</h3>
							<span class="badge badge-sm badge-neutral">Survey</span>
							<span class="badge badge-outline badge-sm">Headline rate</span>
						</div>
						<p>
							Tilastokeskus's headline rate, from a monthly sample survey on the ILO definition.
							National only — no regional breakdown, so it's hidden on the {TAMPERE_REGION.label} view.
						</p>
						<p class="mt-1 text-gray-500">
							Tilastokeskus, työvoimatutkimus · {formatPeriod(view.survey.period)}
						</p>
					</section>

					<section class="mt-3 border-t border-gray-200 pt-3">
						<div class="mb-1 flex flex-wrap items-center gap-2">
							<h3 class="text-sm font-semibold">Software &amp; app development jobs</h3>
							<span class="badge badge-sm badge-neutral">Register</span>
							<span class="badge badge-outline badge-sm">Side panel only</span>
						</div>
						<p>
							Unemployed jobseekers and open vacancies for web/multimedia developers, applications
							programmers, and other software &amp; app developers and analysts (occupation codes
							2513, 2514, 2519), summed. Not used to colour the map.
						</p>
						<p class="mt-1 text-gray-500">
							KEHA-keskus, Työnvälitystilasto (PxWeb 12ti) · {formatPeriod(
								view.softwareJobs.period
							)}
						</p>
					</section>

					<section class="mt-3 border-t border-gray-200 pt-3 text-gray-500">
						<dl class="grid grid-cols-[auto_1fr] gap-x-3">
							<dt class="font-semibold">Boundaries</dt>
							<dd>Maanmittauslaitos</dd>

							<dt class="font-semibold">Labour force</dt>
							<dd>Tilastokeskus, työssäkäyntitilasto</dd>
						</dl>
					</section>
				</div>
			</details>
		</div>
	</div>

	<aside class="flex flex-col gap-3 lg:w-72 lg:shrink-0">
		<div class="relative">
			<div class="join w-full">
				<input
					type="text"
					placeholder="Search municipality…"
					class="input join-item w-full border-base-300 bg-base-100 input-sm focus:outline-accent"
					bind:value={search}
					oninput={() => (selectedCode = null)}
					onfocus={() => (searchOpen = true)}
					onblur={() => (searchOpen = false)}
					onkeydown={(e) => {
						if (e.key === 'Enter' && searchMatches.length) selectKunta(searchMatches[0]);
						if (e.key === 'Escape') searchOpen = false;
					}}
				/>
				{#if selected}
					<button
						type="button"
						class="btn join-item border-base-300 btn-ghost btn-sm"
						aria-label="Clear selection"
						onclick={clearSearch}
					>
						✕
					</button>
				{/if}
			</div>

			{#if searchOpen && searchMatches.length}
				<ul
					class="menu absolute z-10 mt-1 w-full flex-nowrap rounded-box bg-base-100 p-1 shadow-lg"
				>
					{#each searchMatches as kunta (kunta.code)}
						<li>
							<button
								type="button"
								onmousedown={(e) => e.preventDefault()}
								onclick={() => selectKunta(kunta)}
							>
								{kunta.name}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<!-- One row of the panel's stat table: a narrow uppercase label, a wide-set figure. -->
		{#snippet statRow(label: string, value: string)}
			<div class="flex items-baseline justify-between gap-3 py-1.5">
				<span class="stat-label">{label}</span>
				<span class="display-wide text-base font-semibold">{value}</span>
			</div>
		{/snippet}

		<!--
			Personal-interest slice, not part of the register/survey pair above: unemployed
			jobseekers and open vacancies for the three software/app development occupation
			groups (12ti). Shared between the hovered/selected and national branches below via
			`softwareStats`, which already picks the right source for either case.
		-->
		{#snippet softwareJobsBlock()}
			<div class="mt-4 border-t border-base-300 pt-3">
				<p class="stat-label mb-1 flex items-center gap-1.5">
					<span aria-hidden="true">💻</span>
					<span>Software &amp; app development</span>
				</p>
				{@render statRow('Unemployed', count(softwareStats?.unemployed ?? null))}
				{@render statRow('Vacancies', count(softwareStats?.vacancies ?? null))}
			</div>
		{/snippet}

		<div class="rounded-lg border border-base-300 bg-base-100 shadow-sm">
			<div class="min-h-60 p-5">
				<h2 class="display-wide text-xl font-bold">{panelName}</h2>

				<p class="stat-label mt-4">Unemployment rate</p>
				<p class="display-wide mt-0.5 text-5xl leading-none font-bold">{percent(panelRate)}</p>

				{#if deviation !== null}
					<!--
						The device that lets the map go legend-free: the same colour the map filled
						this area with, carrying the number that explains it. Reads as
						"+1,4 pts vs Finland", so the hue never has to be decoded on its own.
					-->
					<p
						class="mt-2.5 inline-flex items-baseline gap-1.5 rounded-full py-1 pr-3 pl-2.5 text-xs font-semibold"
						style:background={colorFor(panelRate, view.countryRate)}
						style:color={deviation >= 0.75 || deviation < -0.75 ? '#ffffff' : 'var(--ink)'}
					>
						<span class="display-wide text-sm">{signedPoints(deviation)}</span>
						<span class="font-medium opacity-90">pts vs Finland</span>
					</p>
				{/if}

				<div class="mt-4 border-t border-base-300 pt-2">
					{@render statRow('Unemployed', count(panelUnemployed))}
				</div>

				{@render softwareJobsBlock()}

				{#if isCountryTotal && view.survey.rate !== null}
					<!--
						The headline figure most people know, national-only — hidden on the
						regional view, since it has no municipal/regional breakdown to pair with a
						regional rate. Shown next to the register rate on purpose: seeing 10,5 %
						and 12,8 % labelled side by side is what stops the map's higher numbers
						reading as an error.
					-->
					<div class="mt-4 border-t border-base-300 pt-3">
						{@render statRow('Työttömyysaste', percent(view.survey.rate))}
						<p class="mt-0.5 text-xs" style:color="var(--ink-faint)">
							Tilastokeskus's headline rate. Survey-based.
						</p>
					</div>
				{/if}
			</div>
		</div>
	</aside>
</main>

<style>
	/*
		A light hairline, not the old navy one: at 308 municipalities a dark stroke built a
		visible mesh over the whole country and dulled every fill under it. Matching the sheet
		colour instead makes the municipalities read as tiles laid on it, and lets the
		diverging scale carry the image.
	*/
	.kunta {
		stroke: #f5f7f9;
		stroke-width: 0.75;
		cursor: pointer;
		transition: opacity 120ms ease;
	}

	.kunta.hovered {
		stroke: var(--ink);
		stroke-width: 1.75;
	}

	.kunta.selected {
		stroke: var(--ink);
		stroke-width: 2;
	}

	.kunta:focus {
		outline: none;
	}

	.kunta:focus-visible {
		stroke: var(--ink);
		stroke-width: 2;
	}

	/*
		Underline tabs. The active one is marked by weight and an ink rule rather than a filled
		background, so switching regions doesn't flash a block of colour next to the map.
	*/
	.region-tab {
		position: relative;
		padding: 0.4rem 0;
		font-stretch: 96%;
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--ink-faint);
		background: none;
		border: none;
		cursor: pointer;
		transition:
			color 120ms ease,
			box-shadow 120ms ease;
	}

	.region-tab:hover {
		color: var(--ink-muted);
	}

	.region-tab.is-active {
		color: var(--ink);
		font-weight: 700;
		box-shadow: inset 0 -2px 0 0 var(--ink);
	}

	.region-tab:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
		border-radius: 2px;
	}

	@media (prefers-reduced-motion: reduce) {
		.kunta,
		.region-tab {
			transition: none;
		}
	}
</style>
