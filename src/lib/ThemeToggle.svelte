<script lang="ts">
	// DaisyUI's `swap` component (rotate variant), driven by the `data-theme` attribute rather
	// than by a checkbox or by Svelte state.
	//
	// That's the one deviation from DaisyUI's stock example, and it's deliberate: the real theme
	// is chosen by the blocking script in `app.html` *before* this component hydrates, so a
	// checkbox's `checked` — which the prerendered HTML would have to guess — or a `$state` flag
	// initialised on mount would both render the wrong icon on the first frame for anyone whose
	// stored or system preference is dark, then flip once hydration caught up. Keying the swap
	// off the attribute that's already correct at first paint avoids that entirely.
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
	class="btn swap btn-square swap-rotate rounded-lg border-white/15 bg-white/10 text-white hover:bg-white/20"
	aria-label="Toggle dark mode"
	onclick={toggle}
>
	<!--
		DaisyUI's own swap icons, on a 24×24 viewBox. The previous pair were 20×20 Heroicons
		whose sun drew its rays right up to the edge of the box, so they clipped once the swap
		rotated them.
	-->
	<svg
		class="size-5 swap-off fill-current"
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 24 24"
		aria-hidden="true"
	>
		<path
			d="M5.64,17l-.71.71a1,1,0,0,0,0,1.41,1,1,0,0,0,1.41,0l.71-.71A1,1,0,0,0,5.64,17ZM5,12a1,1,0,0,0-1-1H3a1,1,0,0,0,0,2H4A1,1,0,0,0,5,12Zm7-7a1,1,0,0,0,1-1V3a1,1,0,0,0-2,0V4A1,1,0,0,0,12,5ZM5.64,7.05a1,1,0,0,0,.7.29,1,1,0,0,0,.71-.29,1,1,0,0,0,0-1.41l-.71-.71A1,1,0,0,0,4.93,6.34Zm12,.29a1,1,0,0,0,.7-.29l.71-.71a1,1,0,1,0-1.41-1.41L17,5.64a1,1,0,0,0,0,1.41A1,1,0,0,0,17.66,7.34ZM21,11H20a1,1,0,0,0,0,2h1a1,1,0,0,0,0-2Zm-9,8a1,1,0,0,0-1,1v1a1,1,0,0,0,2,0V20A1,1,0,0,0,12,19ZM18.36,17A1,1,0,0,0,17,18.36l.71.71a1,1,0,0,0,1.41,0,1,1,0,0,0,0-1.41ZM12,6.5A5.5,5.5,0,1,0,17.5,12,5.51,5.51,0,0,0,12,6.5Zm0,9A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z"
		/>
	</svg>
	<svg
		class="size-5 swap-on fill-current"
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 24 24"
		aria-hidden="true"
	>
		<path
			d="M21.64,13a1,1,0,0,0-1.05-.14,8.05,8.05,0,0,1-3.37.73A8.15,8.15,0,0,1,9.08,5.49a8.59,8.59,0,0,1,.25-2A1,1,0,0,0,8,2.36,10.14,10.14,0,1,0,22,14.05,1,1,0,0,0,21.64,13Zm-9.5,6.69A8.14,8.14,0,0,1,7.08,5.22v.27A10.15,10.15,0,0,0,17.22,15.63a9.79,9.79,0,0,0,2.1-.22A8.11,8.11,0,0,1,12.14,19.73Z"
		/>
	</svg>
</button>

<style>
	/*
		What `swap-active` would do, keyed off the theme attribute instead of a class this
		component can't set before hydration. Same two properties DaisyUI animates, so the
		rotate transition it defines on `.swap > *` carries the change; the light state needs no
		rule of its own, since that's the component's own default.

		These rules are unlayered while DaisyUI's live in `@layer utilities`, so they win
		regardless of specificity.
	*/
	:global(html[data-theme='customtheme-dark']) .swap .swap-off {
		rotate: -45deg;
		opacity: 0;
	}

	:global(html[data-theme='customtheme-dark']) .swap .swap-on {
		rotate: 0deg;
		opacity: 1;
	}
</style>
