<script lang="ts">
	// Both icons are always in the DOM; which one shows is decided purely by CSS keyed off
	// `html[data-theme]` (see the style block below). That's deliberate: the actual theme is set by
	// the blocking script in app.html *before* this component hydrates, so driving the icon
	// off Svelte state instead would mean guessing wrong on first render for any visitor
	// whose stored/system preference is dark, then flipping right after hydration.
	function toggle() {
		const html = document.documentElement;
		const next =
			html.getAttribute('data-theme') === 'customtheme-dark' ? 'customtheme' : 'customtheme-dark';

		html.setAttribute('data-theme', next);
		try {
			localStorage.setItem('maps-theme', next);
		} catch {
			// Private browsing etc. — theme still applies for this page load, just doesn't persist.
		}
	}
</script>

<button
	type="button"
	class="btn btn-square rounded-lg border-white/15 bg-white/10 text-white hover:bg-white/20"
	aria-label="Toggle dark mode"
	onclick={toggle}
>
	<svg class="icon-sun size-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
		<path
			d="M10 3a1 1 0 011 1v1a1 1 0 11-2 0V4a1 1 0 011-1zm0 12a4 4 0 100-8 4 4 0 000 8zm7-5a1 1 0 110 2h-1a1 1 0 110-2h1zM4 10a1 1 0 01-1 1H2a1 1 0 110-2h1a1 1 0 011 1zm11.657-5.657a1 1 0 010 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM6.464 13.536a1 1 0 010 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zm9.193 1.414a1 1 0 01-1.414 0l-.707-.707a1 1 0 111.414-1.414l.707.707a1 1 0 010 1.414zM5.757 6.464a1 1 0 01-1.414 0l-.707-.707a1 1 0 011.414-1.414l.707.707a1 1 0 010 1.414zM10 17a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1z"
		/>
	</svg>
	<svg class="icon-moon size-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
		<path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
	</svg>
</button>

<style>
	/* One theme's icon is shown, the other collapsed — reactive purely to the data-theme
	   attribute the blocking script sets before this component ever hydrates, so there's no
	   render depending on client-only state to get wrong on the first frame. */
	:global(html:not([data-theme='customtheme-dark'])) .icon-moon {
		display: none;
	}

	:global(html[data-theme='customtheme-dark']) .icon-sun {
		display: none;
	}
</style>
