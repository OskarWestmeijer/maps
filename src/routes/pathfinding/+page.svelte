<script lang="ts">
	import { buildGraph, type Graph, type Node } from '$lib/pathfinding/graph';
	import { runDijkstra } from '$lib/pathfinding/dijkstra';

	const width = 800;
	const height = 600;
	let graph: Graph = buildGraph(height, width);

	function regenerate() {
		graph = buildGraph(height, width);
	}

	function runAlgorithm() {
		runDijkstra(graph);
		// Trigger Svelte reactivity by reassigning reference
		graph = { ...graph, nodes: [...graph.nodes] };
	}
</script>

<div class="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
	<!-- Controls -->
	<div class="flex flex-row items-center gap-4">
		<button class="btn btn-primary" on:click={regenerate}>Regenerate Graph</button>
		<button class="btn btn-accent" on:click={runAlgorithm}>Run Dijkstra</button>
	</div>

	<!-- Graph Visualization -->
	<div class="overflow-auto rounded-2xl bg-base-200 p-4 shadow-lg">
		<svg
			{width}
			{height}
			viewBox={`0 0 ${width} ${height}`}
			class="mx-auto block rounded-lg bg-base-100"
		>
			<!-- Edges -->
			{#each graph.nodes as node}
				{#each node.neighbors as neighbor}
					{#if node.id < neighbor.node.id}
						<line
							x1={node.position.x}
							y1={node.position.y}
							x2={neighbor.node.position.x}
							y2={neighbor.node.position.y}
							stroke="#888"
							stroke-width="2"
						/>
						<text
							x={(node.position.x + neighbor.node.position.x) / 2 + 10}
							y={(node.position.y + neighbor.node.position.y) / 2 - 10}
							fill="#000"
							font-size="14"
							text-anchor="middle"
							alignment-baseline="middle"
						>
							{neighbor.edgeWeight}
						</text>
					{/if}
				{/each}
			{/each}

			<!-- Nodes -->
			{#each graph.nodes as node}
				<circle
					cx={node.position.x}
					cy={node.position.y}
					r="25"
					fill={node.id === graph.start.id ? 'orange' : node.visited ? '#16a34a' : '#3b82f6'}
					stroke="#333"
					stroke-width="2"
				/>

				<!-- Distance inside circle -->
				<text
					x={node.position.x}
					y={node.position.y}
					fill="#fff"
					font-size="14"
					text-anchor="middle"
					alignment-baseline="middle"
					font-weight="bold"
				>
					{node.distance === Infinity ? '∞' : node.distance}
				</text>

				<!-- Node ID next to circle -->
				<text
					x={node.position.x + 30}
					y={node.position.y + 5}
					fill="#000"
					font-size="14"
					font-weight="bold"
					text-anchor="start"
					alignment-baseline="middle"
				>
					{node.id}
				</text>
			{/each}
		</svg>
	</div>
</div>

<style>
	svg {
		background-color: #f9f9f9;
	}
</style>
