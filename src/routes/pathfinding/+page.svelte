<script lang="ts">
	import { generateGraph, type Graph, type Node } from '$lib/pathfinding/graph';
	import { runDijkstra } from '$lib/pathfinding/dijkstra';

	let nodeCount = 4;
	let maxNeighbors = 3;
	let maxWeight = 5;
	let graph: Graph = generateGraph(nodeCount, maxNeighbors, maxWeight);
	const width = 800;
	const height = 600;

	function regenerate() {
		graph = generateGraph(nodeCount, maxNeighbors, maxWeight);
	}

	function runAlgorithm() {
		runDijkstra(graph);
		// Trigger Svelte reactivity by reassigning reference
		graph = { ...graph, nodes: [...graph.nodes] };
	}

	// Recompute node positions when graph changes
	$: nodePositions = getNodePositions(graph);

	function getNodePositions(graph: Graph) {
		const positions = new Map<string, { x: number; y: number }>();
		const placed = new Set<string>();
		const centerX = width / 2;
		const centerY = height / 2;
		const scale = 40;

		function placeNode(node: Node, x: number, y: number, angle: number) {
			positions.set(node.id, { x, y });
			placed.add(node.id);

			const neighbors = node.neighbors.filter((n) => !placed.has(n.node.id));
			const angleStep = (Math.PI * 2) / (neighbors.length || 1);

			neighbors.forEach((neighbor, i) => {
				const theta = angle + i * angleStep;
				const distance = neighbor.edgeWeight * scale;

				const nx = x + Math.cos(theta) * distance;
				const ny = y + Math.sin(theta) * distance;

				placeNode(neighbor.node, nx, ny, theta + 0.5);
			});
		}

		placeNode(graph.start, centerX, centerY, 0);
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
				<circle
					cx={nodePositions.get(node.id).x}
					cy={nodePositions.get(node.id).y}
					r="25"
					fill={node.id === graph.start.id ? 'orange' : node.visited ? '#16a34a' : '#3b82f6'}
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
