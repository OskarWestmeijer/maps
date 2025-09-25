<script lang="ts">
	// Optional: you can add props or load data dynamically in the future
	const map = {
		title: 'Netherlands elevation',
		image: '/nl12_light.jpg',
		hdLink: 'https://github.com/OskarWestmeijer/maps/blob/main/static/nl12_light.jpg',
		type: 'Thematic map',
		year: '2024',
		alt: 'Netherlands height map. Created by Oskar Westmeijer with QGIS.',
		description: [
			"Large parts of the Netherlands are below sea level. For centuries, the Dutch have been reclaiming land from the water. Areas reclaimed from the sea are called 'polders'. The technique to dry the land is relatively simple:"
		],
		steps: [
			'The area is cut off from the sea by building a dike around it.',
			'The water is then pumped out.'
		],
		additional: [
			'The island of Flevoland, created in the 1950s and 1960s, was reclaimed from a body of water known as the IJsselmeer. It is the largest artificial island in the world.'
		]
	};
</script>

<main class="mx-auto mt-10 flex max-w-4xl flex-col gap-6 px-4">
	<!-- Back Arrow -->
	<a href="/" class="flex items-center gap-1 text-sm text-gray-500 hover:underline">
		<span>←</span>
		<span>Back to Gallery</span>
	</a>

	<!-- Title + HD Button -->
	<div class="flex items-start justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold">{map.title}</h1>
			<p class="text-xs text-gray-500">{map.type}, {map.year}</p>
		</div>
		<a
			href={map.hdLink}
			target="_blank"
			rel="noopener noreferrer"
			class="btn mt-1 btn-sm btn-secondary"
		>
			Map in HD
		</a>
	</div>

	<!-- Description -->
	<div class="mt-4 flex flex-col gap-4 text-gray-700">
		{#each map.description as paragraph}
			<p>{paragraph}</p>
		{/each}

		<ol class="list-inside list-decimal">
			{#each map.steps as step}
				<li>{step}</li>
			{/each}
		</ol>

		{#each map.additional as paragraph}
			<p>{paragraph}</p>
		{/each}
	</div>

	<!-- Map Image -->
	<div class="mt-4">
		<img
			src={map.image}
			alt={map.alt}
			class="w-full rounded-lg border border-base-300 object-cover shadow-lg"
		/>
	</div>
</main>

<style>
	main {
		min-height: 100vh;
	}
</style>
