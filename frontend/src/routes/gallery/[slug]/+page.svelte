<script lang="ts">
	export let data;
	const map = data.map;
</script>

<main class="mx-auto mt-10 flex max-w-4xl flex-col gap-6 px-4">
	<a href="/" class="flex items-center gap-1 text-sm text-gray-500 hover:underline">
		<span>←</span>
		<span>Back to Gallery</span>
	</a>

	<div class="flex items-start justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold">{map.title}</h1>
			{#if map.type || map.year}
				<p class="text-xs text-gray-500">{map.type}{map.type && map.year ? ', ' : ''}{map.year}</p>
			{/if}
		</div>
		{#if map.hdLink}
			<a
				href={map.hdLink}
				target="_blank"
				rel="noopener noreferrer"
				class="btn mt-1 btn-sm btn-secondary"
			>
				Map in HD
			</a>
		{/if}
	</div>

	<div class="flex flex-col gap-4 text-gray-700">
		{#if map.description}
			{#each map.description as paragraph}
				<p>{paragraph}</p>
			{/each}
		{/if}

		{#if map.steps?.length}
			<ul class="list-disc pl-4">
				{#each map.steps as step}
					<li>{step}</li>
				{/each}
			</ul>
		{/if}

		{#if map.additional}
			{#each map.additional as paragraph}
				<p>{paragraph}</p>
			{/each}
		{/if}
	</div>

	<div class="mt-6 mb-6">
		<img
			src={map.src}
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
