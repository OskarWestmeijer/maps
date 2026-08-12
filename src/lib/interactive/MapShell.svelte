<script lang="ts" generics="A extends { code: string; name: string; d: string }">
	/**
	 * The chrome both interactive maps share: the region tabs, the SVG itself with its
	 * hover/click/keyboard behaviour, the municipality search box, and the period + Sources
	 * row. What differs between the maps — how an area is coloured, what the panel says, what
	 * the sources are — arrives as props and snippets.
	 *
	 * It owns the interaction state (`hovered`, `selectedCode`, `search`) because that state
	 * is the same on both maps; the *metric* is what changes. `region` is bindable so the page
	 * can pick which payload to read for its panel while the shell drives the tabs.
	 *
	 * Layout note, load-bearing on desktop: on `lg` and up the page is pinned to one viewport
	 * (`100dvh` minus `--map-chrome`, which the `/interactive` layout sets to the height of
	 * everything around the map — navbar, footer, and its own map switch; the fallback is that
	 * sum without the switch),
	 * the tinted sheet is `min-h-0 flex-1` so it fills the map column and stays the same size
	 * in every region (the SVG letterboxes inside it; sizing the sheet per region made the
	 * frame jump width when the tab changed), and the attribution lives in a popover rather
	 * than inline. `playwright/fits-one-screen.spec.ts` guards all of that.
	 */
	import type { Snippet } from 'svelte';
	import { MAP_SURFACE, NO_DATA_COLOR } from './unemployment';
	import { TAMPERE_REGION } from './regions';
	import { formatDate, formatPeriod, sourceLine } from './format';
	import type { RegionId, ShellView } from './views';

	let {
		region = $bindable('finland' as RegionId),
		views,
		/** Names the mapped measure in the SVG's accessible label: "<metric> by municipality in Finland". */
		metric,
		/** The fill for one area — a colour, or `url(#no-data)` for the hatch. */
		fillFor,
		/** The figure read out after the area's name in its accessible label. */
		valueLabel,
		panel,
		sources
	}: {
		region?: RegionId;
		views: Record<RegionId, ShellView<A>>;
		metric: string;
		fillFor: (area: A) => string;
		valueLabel: (area: A) => string;
		panel: Snippet<
			[
				{
					displayed: A | null;
					region: RegionId;
					areaNoun: string;
					regionLabel: string;
					/** Selects an area from inside the panel, exactly as picking a search result
					 *  does — so a panel can offer its own shortcuts into the map (the compare
					 *  map's ranking) without owning the selection state. */
					select: (area: A) => void;
				}
			]
		>;
		sources: Snippet<[{ region: RegionId; areaNoun: string }]>;
	} = $props();

	const view = $derived(views[region]);

	// The panel's default entity name: Region is the whole country too, just shown at coarser
	// granularity, so — like Finland — its no-selection state reads "Finland", not "Region"
	// (that word names the tab/granularity, not an area). Only Tampere Metro is actually a
	// different, smaller area.
	const regionLabel = $derived(region === 'tampere' ? TAMPERE_REGION.label : 'Finland');
	// Vocabulary for the one tab whose shapes aren't municipalities.
	const areaNoun = $derived(region === 'maakunta' ? 'region' : 'municipality');

	let hovered: A | null = $state(null);

	// A selected area, set either by picking a search result or by clicking it on the map.
	// Distinct from `hovered`: it stays blue on the map and keeps backing the panel even while
	// hovering elsewhere, whereas hover only previews.
	let selectedCode: string | null = $state(null);
	let search = $state('');
	let searchOpen = $state(false);

	const selected = $derived(view.areas.find((a) => a.code === selectedCode) ?? null);
	const displayed = $derived(hovered ?? selected);
	const sortedAreas = $derived([...view.areas].sort((a, b) => a.name.localeCompare(b.name)));

	// Switching region doesn't remount the page (it's a `$state` toggle, not navigation), so a
	// selection/search from one region has to be cleared by hand — otherwise it'd persist
	// pointing at an area that doesn't exist in the other view.
	function switchRegion(next: RegionId) {
		region = next;
		hovered = null;
		selectedCode = null;
		search = '';
		searchOpen = false;
	}

	// The viewBox is in metres (EPSG:3067), not pixels, so the no-data hatch has to be sized
	// off it — a fixed 6-unit pattern would be sub-millimetre on a 671 km-wide map. Deriving
	// it from the current viewBox keeps the hatch visually identical across regions.
	const hatch = $derived(Number(view.viewBox.split(' ')[2]) / 160);

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

		const starts = sortedAreas.filter((a) => a.name.toLowerCase().startsWith(q));
		const contains = sortedAreas.filter(
			(a) => !a.name.toLowerCase().startsWith(q) && a.name.toLowerCase().includes(q)
		);

		return [...starts, ...contains].slice(0, 8);
	});

	const SELECTED_FILL = '#2563eb';

	function selectArea(area: A) {
		selectedCode = area.code;
		search = area.name;
		searchOpen = false;
	}

	function clearSearch() {
		search = '';
		selectedCode = null;
	}
</script>

<!--
	On large screens the page is pinned to one viewport: `main` takes the height left over by
	the navbar and footer, the SVG box flexes into whatever the period/sources row does not
	use, and the map letterboxes inside it. Below `lg` it stacks and scrolls, as it should on
	a phone.
-->
<main
	class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-4 lg:h-[calc(100dvh-var(--map-chrome,9.5rem))] lg:flex-row"
>
	<div class="flex min-h-0 flex-1 flex-col gap-3">
		<!--
			Underline tabs rather than a filled pill group: the map below is already a big field
			of colour, and a solid control fighting it for attention was most of what made the
			old header feel busy.
		-->
		<div class="flex items-center gap-6 border-b border-base-300" role="tablist">
			{#each [{ id: 'finland', label: 'Finland' }, { id: 'maakunta', label: 'Region' }, { id: 'tampere', label: TAMPERE_REGION.label }] as const as tab (tab.id)}
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
			The sheet fills the whole map column and stays the same size in every region; the SVG
			letterboxes inside it. Sizing it to each region's own aspect ratio instead would make
			the frame jump width when the tab changed.
		-->
		<div
			class="max-h-[70vh] min-h-0 flex-1 rounded-lg lg:max-h-none"
			style:background={MAP_SURFACE}
		>
			<!--
				svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions
				(the svg itself isn't meant to become a keyboard-operable control — it's a
				mouse-only convenience mirroring "click outside to close", same idea as clicking a
				modal's backdrop. The keyboard-reachable equivalent already exists as the
				"Clear selection" button next to the search box.)
			-->
			<svg
				viewBox={view.viewBox}
				class="h-full w-full"
				role="img"
				aria-label={`${metric} by ${areaNoun} in ${regionLabel}`}
				onclick={(e) => {
					// Area <path> clicks bubble up here too, but by then e.target is the path, not
					// the svg itself — only a click that lands on the empty sheet (sea, gaps at the
					// coastline) should clear the selection.
					if (e.target === e.currentTarget) clearSearch();
				}}
			>
				<defs>
					<!--
						Areas with no published figure are hatched, not given another flat grey: next
						to a scale that already spends greys, another one would read as a data class
						rather than an absence. Hatching for "no data" is the cartographic convention.
					-->
					<pattern id="no-data" width={hatch} height={hatch} patternUnits="userSpaceOnUse">
						<rect width={hatch} height={hatch} fill={NO_DATA_COLOR} />
						<path d={`M0,${hatch} l${hatch},-${hatch}`} stroke="#c9ced6" stroke-width={hatch / 4} />
					</pattern>
				</defs>

				{#each view.areas as area (area.code)}
					<path
						d={area.d}
						class="kunta"
						class:hovered={hovered?.code === area.code}
						class:selected={selected?.code === area.code}
						fill={selected?.code === area.code ? SELECTED_FILL : fillFor(area)}
						vector-effect="non-scaling-stroke"
						role="button"
						tabindex="0"
						aria-label={`${area.name}, ${valueLabel(area)}`}
						onmouseenter={() => (hovered = area)}
						onmouseleave={() => (hovered = null)}
						onfocus={() => (hovered = area)}
						onblur={() => (hovered = null)}
						onclick={() => selectArea(area)}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								selectArea(area);
							}
						}}
					/>
				{/each}
			</svg>
		</div>

		<div class="flex items-center justify-end gap-3 text-xs" style:color="var(--ink-muted)">
			<!--
				Kept out of the panel so the period stays visible while hovering an area. Two
				different dates, and the labels have to keep them apart: the period is what the
				figures describe, "polled" is when the refresh cron last fetched them. Both are
				absent until the live figures land, which blanks the line rather than leaving a
				placeholder behind.
			-->
			<span class="stat-label">
				{sourceLine(
					view.period && `Data from ${view.periodLabel ?? formatPeriod(view.period)}`,
					view.polled && `polled ${formatDate(view.polled)}`
				)}
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
					{@render sources({ region, areaNoun })}
				</div>
			</details>
		</div>
	</div>

	<aside class="flex flex-col gap-3 lg:w-72 lg:shrink-0">
		<div class="relative">
			<div class="join w-full">
				<input
					type="text"
					placeholder={`Search ${areaNoun}…`}
					class="input join-item w-full border-base-300 bg-base-100 input-sm focus:outline-accent"
					bind:value={search}
					oninput={() => {
						selectedCode = null;
						// Picking a result closes the list but keeps focus in the box (the result
						// button's `mousedown` preventDefault is what stops the blur). Without
						// reopening here, typing a second query after picking a first one filters
						// nothing visible until the box is blurred and refocused.
						searchOpen = true;
					}}
					onfocus={() => (searchOpen = true)}
					onblur={() => (searchOpen = false)}
					onkeydown={(e) => {
						if (e.key === 'Enter' && searchMatches.length) selectArea(searchMatches[0]);
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
					{#each searchMatches as area (area.code)}
						<li>
							<button
								type="button"
								onmousedown={(e) => e.preventDefault()}
								onclick={() => selectArea(area)}
							>
								{area.name}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<!--
			From `lg` up the card takes the height the search box leaves and scrolls inside itself.
			Without `min-h-0 flex-1 overflow-y-auto` a panel taller than the column doesn't push the
			page down (the column is a fixed `100dvh` box) — it silently spills over the footer and
			its last rows are cut off, which is what the population panel did at 1280×720. The panel
			grows with every dataset joined onto it, so this has to hold as domains are added.
			Below `lg` the page scrolls as a whole and the card is left to its natural height.
		-->
		<div
			class="rounded-lg border border-base-300 bg-base-100 shadow-sm lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
		>
			<!--
				Slightly tighter padding from `lg` up, where the panel has to share one viewport with
				the map — below that the page scrolls anyway, so it keeps the roomier inset.
			-->
			<div class="min-h-60 p-5 lg:p-4">
				{@render panel({ displayed, region, areaNoun, regionLabel, select: selectArea })}
			</div>
		</div>
	</aside>
</main>

<style>
	/*
		A light hairline, not the old navy one: at 308 municipalities a dark stroke built a
		visible mesh over the whole country and dulled every fill under it. Matching the sheet
		colour instead makes the areas read as tiles laid on it, and lets the scale carry the
		image.
	*/
	.kunta {
		stroke: #f5f7f9;
		stroke-width: 0.75;
		cursor: pointer;
		transition: opacity 120ms ease;
	}

	.kunta.hovered {
		stroke: var(--map-ink);
		stroke-width: 1.75;
	}

	.kunta.selected {
		stroke: var(--map-ink);
		stroke-width: 2;
	}

	.kunta:focus {
		outline: none;
	}

	.kunta:focus-visible {
		stroke: var(--map-ink);
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
