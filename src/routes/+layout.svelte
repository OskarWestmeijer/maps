<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.ico';
	import ThemeToggle from '$lib/ThemeToggle.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="icon" href="/favicon.ico" type="image/x-icon" />
</svelte:head>

<!-- Flex column wrapper -->
<div class="flex min-h-screen flex-col bg-base-100">
	<!-- Navbar -->
	<div class="navbar bg-secondary text-white shadow-sm">
		<div class="navbar-start">
			<div class="mobile-hide">
				<a
					href="https://maps.oskar-westmeijer.com"
					class="display-wide btn rounded-lg btn-ghost text-lg font-bold text-white hover:bg-white/10"
					>&#129517; Maps</a
				>
			</div>
		</div>
		<div class="navbar-center">
			<a href="/" class="btn btn-ghost font-medium text-white hover:bg-white/10">🗺️ Gallery</a>
			<a href="/about" class="btn btn-ghost font-medium text-white hover:bg-white/10">💡 About</a>
		</div>
		<div class="navbar-end gap-2">
			<ThemeToggle />
			<div class="mobile-hide">
				<a
					href="https://github.com/OskarWestmeijer/maps"
					aria-label="Oskar Westmeijer Github maps repository"
				>
					<button class="btn rounded-lg border-white/15 bg-white/10 text-white hover:bg-white/20">
						<img alt="Github logo" class="size-6 invert" src="/github.svg" />
					</button>
				</a>
			</div>
		</div>
	</div>

	<!-- Main grows to push footer down -->
	<main class="flex-grow">
		{@render children?.()}
	</main>

	<!-- Footer -->
	<footer class="footer footer-center py-6">
		<a href="https://oskar-westmeijer.com" class="text-base">
			Created by Oskar Westmeijer 🐨 2026
		</a>
	</footer>
</div>
