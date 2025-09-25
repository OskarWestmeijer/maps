<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.ico';

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
					class="btn rounded-lg text-lg font-bold btn-ghost">&#129517; Maps</a
				>
			</div>
		</div>
		<div class="navbar-center">
			<a href="/" class="btn text-lg btn-ghost">🗺️ Gallery</a>
			<a href="/about" class="btn text-lg btn-ghost">💡 About</a>
		</div>
		<div class="navbar-end">
			<div class="mobile-hide">
				<a
					href="https://github.com/OskarWestmeijer/maps"
					aria-label="Oskar Westmeijer Github maps repository"
				>
					<button class="btn rounded-lg">
						<img alt="Github logo" class="size-6" src="/github.svg" />
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
	<footer class="footer-center footer py-6">
		<a href="https://oskar-westmeijer.com" class="text-base">
			Created by Oskar Westmeijer 🐨 2025
		</a>
	</footer>
</div>
