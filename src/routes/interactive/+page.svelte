<script lang="ts">
	import type { Kunta } from '$lib/interactive/finland';
	import { colorFor, NO_DATA_COLOR, UNEMPLOYMENT_CLASSES } from '$lib/interactive/unemployment';

	let { data } = $props();

	let hovered: Kunta | null = $state(null);

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
	by the navbar and footer, the SVG box flexes into whatever the legend does not use, and
	the map letterboxes inside it. Below `lg` it stacks and scrolls, as it should on a phone.
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
						fill={colorFor(kunta.rate)}
						vector-effect="non-scaling-stroke"
						role="button"
						tabindex="0"
						aria-label={`${kunta.name}, ${percent(kunta.rate)}`}
						onmouseenter={() => (hovered = kunta)}
						onmouseleave={() => (hovered = null)}
						onfocus={() => (hovered = kunta)}
						onblur={() => (hovered = null)}
					/>
				{/each}
			</svg>
		</div>

		<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
			{#each UNEMPLOYMENT_CLASSES as bucket}
				<span class="flex items-center gap-1.5">
					<span class="swatch" style:background={bucket.color}></span>
					<span>{bucket.label} %</span>
				</span>
			{/each}
			<span class="flex items-center gap-1.5">
				<span class="swatch" style:background={NO_DATA_COLOR}></span>
				<span>no data</span>
			</span>

			<!-- Grouped so the period and the button wrap together rather than splitting lines. -->
			<div class="ml-auto flex items-center gap-3">
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
								Everyone signed on with the employment service as unemployed, as a share of the
								labour force. Published per municipality.
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
	</div>

	<aside class="lg:w-72 lg:shrink-0">
		<div class="card bg-base-200 shadow-lg">
			<div class="card-body min-h-60">
				{#if hovered}
					<h2 class="card-title">{hovered.name}</h2>

					<p class="mt-3 text-4xl font-bold">{percent(hovered.rate)}</p>
					<p class="text-xs text-gray-500">
						of the labour force registered as unemployed jobseekers
					</p>

					<dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
						<dt class="text-gray-500">Labour force</dt>
						<dd class="text-right">{count(hovered.labourForce)}</dd>

						<dt class="text-gray-500">Jobseekers, incl. employed</dt>
						<dd class="text-right">{count(hovered.jobseekers)}</dd>

						<dt class="text-gray-500">Unemployed jobseekers</dt>
						<dd class="text-right">{count(hovered.unemployed)}</dd>
					</dl>
				{:else}
					<h2 class="card-title">Registered unemployment</h2>

					<p class="mt-3 text-4xl font-bold">{percent(data.national.rate)}</p>
					<p class="text-xs text-gray-500">
						of Finland's labour force registered as unemployed jobseekers
					</p>

					<dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
						<dt class="text-gray-500">Labour force</dt>
						<dd class="text-right">{count(data.national.labourForce)}</dd>

						<dt class="text-gray-500">Jobseekers, incl. employed</dt>
						<dd class="text-right">{count(data.national.jobseekers)}</dd>

						<dt class="text-gray-500">Unemployed jobseekers</dt>
						<dd class="text-right">{count(data.national.unemployed)}</dd>
					</dl>

					{#if data.survey.rate !== null}
						<!--
							The headline figure most people know. Shown next to the register rate on
							purpose: seeing 10,5 % and 12,8 % labelled side by side is what stops the
							map's higher numbers reading as an error.
						-->
						<div class="mt-4 border-t border-gray-300 pt-3">
							<div class="flex items-baseline justify-between gap-2">
								<span class="text-sm text-gray-500">Työttömyysaste</span>
								<span class="text-lg font-semibold">{percent(data.survey.rate)}</span>
							</div>
							<p class="text-xs text-gray-500">
								Tilastokeskus's headline rate (trend). Survey-based.
							</p>
						</div>
					{/if}
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

	.kunta:focus {
		outline: none;
	}

	.swatch {
		display: inline-block;
		width: 1.25rem;
		height: 0.75rem;
		border-radius: 2px;
		border: 1px solid rgb(0 0 0 / 0.15);
	}
</style>
