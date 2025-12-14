<script lang="ts">
	import { generateGraph, type Graph } from '$lib/pathfinding/graph';

	let graph: Graph = generateGraph(10);
	let nodeCount = 10; // user-controlled input

	const width = 800;
	const height = 600;

	function regenerate() {
		const count = Math.max(1, Math.min(26, nodeCount)); // enforce A–Z range
		graph = generateGraph(count);
	}

	// Recompute positions when graph changes
	$: nodePositions = getNodePositions(graph);

	function getNodePositions(graph: Graph) {
		const positions = new Map<string, { x: number; y: number }>();
		graph.nodes.forEach((node) => {
			positions.set(node.id, {
				x: Math.random() * (width - 150) + 75,
				y: Math.random() * (height - 150) + 75
			});
		});
		return positions;
	}
</script>

<div class="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
	<!-- Controls -->
	<div class="flex flex-row items-center gap-4">
		<label class="label font-semibold">Node Count:</label>
		<input
			type="number"
			min="1"
			max="26"
			bind:value={nodeCount}
			class="input-bordered input w-24 text-center"
		/>
		<button class="btn btn-primary" on:click={regenerate}> Regenerate Graph </button>
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
							x1={nodePositions.get(node.id).x}
							y1={nodePositions.get(node.id).y}
							x2={nodePositions.get(neighbor.node.id).x}
							y2={nodePositions.get(neighbor.node.id).y}
							stroke="#888"
							stroke-width="2"
						/>
						<text
							x={(nodePositions.get(node.id).x + nodePositions.get(neighbor.node.id).x) / 2}
							y={(nodePositions.get(node.id).y + nodePositions.get(neighbor.node.id).y) / 2}
							fill="#000"
							font-size="12"
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
				<!-- Circle -->
				<circle
					cx={nodePositions.get(node.id).x}
					cy={nodePositions.get(node.id).y}
					r="25"
					fill={node.id === graph.start.id ? 'orange' : '#3b82f6'}
					stroke="#333"
					stroke-width="2"
				/>

				<!-- Distance inside circle -->
				<text
					x={nodePositions.get(node.id).x}
					y={nodePositions.get(node.id).y}
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
					x={nodePositions.get(node.id).x + 30}
					y={nodePositions.get(node.id).y + 5}
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
