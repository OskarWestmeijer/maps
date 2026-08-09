<script lang="ts">
	import type { Kunta } from '$lib/interactive/finland';
	import { colorFor } from '$lib/interactive/unemployment';

	let { data } = $props();

	let hovered: Kunta | null = $state(null);

	// A selected municipality, set either by picking a search result or by clicking it on the
	// map. Distinct from `hovered`: it stays blue on the map and keeps backing the panel even
	// while hovering elsewhere, whereas hover only previews.
	let selectedCode: string | null = $state(null);
	let search = $state('');
	let searchOpen = $state(false);

	const selected = $derived(data.kuntas.find((k) => k.code === selectedCode) ?? null);
	const displayed = $derived(hovered ?? selected);
	const sortedKuntas = $derived([...data.kuntas].sort((a, b) => a.name.localeCompare(b.name)));

	// Personal-interest slice (unemployed jobseekers + open vacancies for software/app
	// development occupations), kept separate from the choropleth's register figures — it
	// only ever backs the panel, the same as `displayed` falls back to the whole country.
	const softwareStats = $derived(
		displayed ? (data.softwareJobs.stats.get(displayed.code) ?? null) : data.softwareJobs.national
	);

	// The panel shows the same shape of data whether a municipality is hovered/selected or
	// not — only the name, and where the numbers come from, differ.
	const panelName = $derived(displayed?.name ?? 'Finland');
	const panelRate = $derived(displayed?.rate ?? data.national.rate);
	const panelUnemployed = $derived(displayed?.unemployed ?? data.national.unemployed);

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
		<div class="min-h-0 flex-1">
			<svg
				viewBox={data.viewBox}
				class="h-full max-h-[70vh] w-full lg:max-h-none"
				role="img"
				aria-label="Unemployment by municipality in Finland"
			>
				{#each data.kuntas as kunta (kunta.code)}
					<path
						d={kunta.d}
						class="kunta"
						class:hovered={hovered?.code === kunta.code}
						class:selected={selected?.code === kunta.code}
						fill={selected?.code === kunta.code ? SELECTED_FILL : colorFor(kunta.rate)}
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

		<div class="flex items-center justify-end gap-3 text-xs text-gray-500">
			<!-- Kept out of the panel so the period stays visible while hovering a municipality. -->
			<span class="text-sm font-medium text-gray-600">
				Data from {formatPeriod(data.period)}
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
						<p class="mt-1 text-gray-500">{data.source} · {formatPeriod(data.period)}</p>
					</section>

					<section class="mt-3 border-t border-gray-200 pt-3">
						<div class="mb-1 flex flex-wrap items-center gap-2">
							<h3 class="text-sm font-semibold">Työttömyysaste</h3>
							<span class="badge badge-sm badge-neutral">Survey</span>
							<span class="badge badge-outline badge-sm">Headline rate</span>
						</div>
						<p>
							Tilastokeskus's headline rate, from a monthly sample survey on the ILO definition.
						</p>
						<p class="mt-1 text-gray-500">
							Tilastokeskus, työvoimatutkimus · {formatPeriod(data.survey.period)}
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
								data.softwareJobs.period
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
					class="input-bordered input join-item w-full"
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
						class="btn join-item btn-ghost"
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

		<!--
			Personal-interest slice, not part of the register/survey pair above: unemployed
			jobseekers and open vacancies for the three software/app development occupation
			groups (12ti). Shared between the hovered/selected and national branches below via
			`softwareStats`, which already picks the right source for either case.
		-->
		{#snippet softwareJobsBlock()}
			<div class="mt-4 border-t border-gray-300 pt-3">
				<div class="mb-1 flex items-center gap-1.5 text-sm text-gray-500">
					<span aria-hidden="true">💻</span>
					<span>Software &amp; app development</span>
				</div>
				<dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
					<dt class="text-gray-500">Unemployed</dt>
					<dd class="text-right font-semibold">{count(softwareStats?.unemployed ?? null)}</dd>

					<dt class="text-gray-500">Vacancies</dt>
					<dd class="text-right font-semibold">{count(softwareStats?.vacancies ?? null)}</dd>
				</dl>
			</div>
		{/snippet}

		<div class="card bg-base-200 shadow-lg">
			<div class="card-body min-h-60">
				<h2 class="card-title">{panelName}</h2>

				<p class="mt-3 text-4xl font-bold">{percent(panelRate)}</p>
				<p class="text-xs text-gray-500">Unemployment rate</p>

				<div class="mt-4 flex items-baseline justify-between border-t border-gray-300 pt-3">
					<span class="text-sm text-gray-500">Unemployed</span>
					<span class="text-lg font-semibold">{count(panelUnemployed)}</span>
				</div>

				{@render softwareJobsBlock()}

				{#if !displayed && data.survey.rate !== null}
					<!--
						The headline figure most people know, national-only. Shown next to the
						register rate on purpose: seeing 10,5 % and 12,8 % labelled side by side is
						what stops the map's higher numbers reading as an error.
					-->
					<div class="mt-4 border-t border-gray-300 pt-3">
						<div class="flex items-baseline justify-between gap-2">
							<span class="text-sm text-gray-500">Työttömyysaste</span>
							<span class="text-lg font-semibold">{percent(data.survey.rate)}</span>
						</div>
						<p class="text-xs text-gray-500">Tilastokeskus's headline rate. Survey-based.</p>
					</div>
				{/if}
			</div>
		</div>
	</aside>
</main>

<style>
	.kunta {
		stroke: var(--color-secondary);
		stroke-width: 0.5;
		cursor: pointer;
	}

	.kunta.hovered {
		stroke-width: 2;
	}

	.kunta.selected {
		stroke: var(--color-primary);
		stroke-width: 2;
	}

	.kunta:focus {
		outline: none;
	}
</style>
