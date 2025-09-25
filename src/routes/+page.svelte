<script lang="ts">
	const maps = [
		{
			src: '/nl12_light.jpg',
			title: 'Netherlands elevation',
			type: 'Topographic map',
			year: '2024',
			alt: 'Netherlands height map. Created by Oskar Westmeijer with QGIS.'
		},
		{
			src: '/de_forrest7_light.jpg',
			title: 'Germany forest coverage',
			type: 'Thematic map',
			year: '2024',
			alt: 'Germany forest coverage map. Created by Oskar Westmeijer with QGIS.'
		},
		{
			src: '/nl_forest4_light.jpg',
			title: 'Netherlands forest coverage',
			type: 'Thematic map',
			year: '2024',
			alt: 'Netherlands forest coverage map. Created by Oskar Westmeijer with QGIS.'
		},
		{
			src: '/nl_west_friesland3_light.jpg',
			title: 'West Friesland, Netherlands',
			type: 'Thematic map',
			year: '2024',
			alt: 'Map of West Friesland in the Netherlands. Created by Oskar Westmeijer with QGIS.'
		}
	];
</script>

<main class="mt-10 mb-10 flex justify-center px-4">
	<div class="grid w-full max-w-6xl grid-cols-1 gap-6 sm:grid-cols-2">
		{#each maps as map}
			<a
				href="#"
				class="group overflow-hidden rounded-xl shadow-lg transition-transform duration-300 hover:scale-105"
			>
				<img src={map.src} alt={map.alt} class="h-120 w-full object-cover" />
				<div class="mt-2 mb-2 text-center">
					<p class="font-semibold">
						{map.title}
					</p>
					<p class="text-xs text-gray-500">{map.type}, {map.year}</p>
				</div>
			</a>
		{/each}
	</div>
</main>

<style>
	main {
		min-height: 100vh;
	}

	.h-120 {
		height: 30rem; /* Slightly taller tiles, adjust as needed */
	}
</style>
