<script lang="ts">
	/**
	 * `/interactive` isn't a page — it's the shelf the interactive maps sit on. This layout
	 * renders the switch between them and nothing else; each map owns its own tabs, panel and
	 * sources below it.
	 *
	 * The switch is deliberately *not* the same control as the maps' own region tabs, which
	 * are underlined text: these are pills, because they change page rather than filter the
	 * one you're on, and two identical-looking tab rows stacked on top of each other would be
	 * ambiguous about which does what.
	 */
	import { page } from '$app/state';

	let { children } = $props();

	const maps = [
		// Named for the measure each one actually maps, not the topic: the unemployment map is
		// the registered *rate*, and the population map is last year's *change*, not a headcount.
		{ href: '/interactive/unemployment', label: 'Unemployment rate', icon: '📉' },
		{ href: '/interactive/population', label: 'Population change', icon: '🏘️' },
		{ href: '/interactive/income', label: 'Median income', icon: '💶' },
		{ href: '/interactive/education', label: 'Higher education', icon: '🎓' },
		{ href: '/interactive/age', label: 'Average age', icon: '🎂' },
		{ href: '/interactive/balance', label: 'Gender balance', icon: '👥' },
		// The composite of the ones above (and of whatever domains follow), so it sits last.
		{ href: '/interactive/compare', label: 'Compare', icon: '⚖️' }
	];

	const current = $derived(page.url.pathname);
</script>

<!--
	`--map-chrome` is what the map below subtracts from the viewport height to pin itself to
	one screen: the navbar and footer (9.5rem, from the root layout) plus this switch row.
	Change the switch's size and this is the number to re-measure — `fits-one-screen.spec.ts`
	is what catches it if you don't.
-->
<div class="interactive-shell">
	<div class="mx-auto flex max-w-6xl justify-center px-4 pt-4 lg:justify-start">
		<nav class="map-switch" aria-label="Interactive maps">
			{#each maps as map (map.href)}
				<a
					href={map.href}
					class="map-switch-item"
					class:is-active={current === map.href}
					aria-current={current === map.href ? 'page' : undefined}
				>
					<span aria-hidden="true">{map.icon}</span>
					{map.label}
				</a>
			{/each}
		</nav>
	</div>

	{@render children?.()}
</div>

<style>
	.interactive-shell {
		--map-chrome: 12.9rem;
	}

	.map-switch {
		display: inline-flex;
		/* Wraps rather than running off the side: seven pills are wider than a phone. Only ever
		   wraps below `lg`, where the page scrolls anyway and `--map-chrome` isn't in play — if
		   a sixth ever makes it wrap at `lg` too, `--map-chrome` owes it another row. */
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.25rem;
		padding: 0.25rem;
		border-radius: 999px;
		background: var(--color-base-200);
	}

	.map-switch-item {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem 0.9rem;
		border-radius: 999px;
		font-stretch: 96%;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--ink-muted);
		transition:
			background 120ms ease,
			color 120ms ease;
	}

	.map-switch-item:hover {
		color: var(--ink);
	}

	.map-switch-item.is-active {
		background: var(--color-base-100);
		color: var(--ink);
		font-weight: 700;
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
	}

	.map-switch-item:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	@media (prefers-reduced-motion: reduce) {
		.map-switch-item {
			transition: none;
		}
	}
</style>
