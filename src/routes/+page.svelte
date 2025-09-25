<script lang="ts">
	import { maps } from '$lib/maps';
</script>

<main class="mt-10 mb-10 flex justify-center px-4">
	<div class="grid w-full max-w-6xl grid-cols-1 gap-6 sm:grid-cols-2">
		{#each maps as map}
			<a
				href={`/gallery/${map.slug}`}
				class="group overflow-hidden rounded-xl shadow-lg transition-transform duration-300 hover:scale-105"
			>
				<img src={map.src} alt={map.alt} class="h-120 w-full object-cover" />
				<div class="mt-2 mb-2 text-center">
					<p class="font-semibold">{map.title}</p>
					<p class="text-xs text-gray-500">{map.type}, {map.year}</p>
				</div>
			</a>
		{/each}
	</div>
</main>

<style>
	.h-120 {
		height: 30rem; /* Slightly taller tiles */
	}
	main {
		min-height: 100vh;
	}
</style>
