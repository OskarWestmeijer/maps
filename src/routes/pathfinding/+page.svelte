<script lang="ts">
	import type { Node } from '$lib/pathfinding/map';
	import type { DijkstraResult } from '$lib/pathfinding/dijkstra';
	import { Map } from '$lib/pathfinding/map';
	import { dijkstra, dijkstraAnimated } from '$lib/pathfinding/dijkstra';
	import './Pathfinding.css';

	const rows = 50;
	const cols = 50;
	const block_percentage = 15;
	const animation_speed_ms = 1;

	let map: Map;
	let nodes: Node[][] = [];
	let hovered: Node | null = null;
	let stats: DijkstraResult | null = null;
	let isAnimating = false;
	let isLocked = false; // disables run buttons until regeneration

	function initMap() {
		map = new Map(rows, cols, block_percentage);
		nodes = map.getNodes().map((row) => [...row]);
		hovered = null;
		stats = null;
		isAnimating = false;
		isLocked = false; // allow new runs
	}

	function runDijkstra() {
		if (isLocked) return;
		isLocked = true;
		stats = dijkstra(map);
		nodes = map.getNodes().map((row) => [...row]);
	}

	/** Animated Dijkstra visualization */
	async function runDijkstraAnimated() {
		if (!map || isLocked) return;
		isAnimating = true;
		isLocked = true;

		stats = await dijkstraAnimated(map, animation_speed_ms, updateUI);

		// Final update
		nodes = map.getNodes().map((row) => [...row]);
		isAnimating = false;
	}

	/** Update the UI after each node visit */
	function updateUI() {
		nodes = map.getNodes().map((row) => [...row]);
	}

	initMap();
</script>

<main>
	<div class="content">
		{#if map}
			<div class="info">
				<div>START: ({map.startNode.coord.row}, {map.startNode.coord.col})</div>
				<div>END: ({map.endNode.coord.row}, {map.endNode.coord.col})</div>
				<div>
					HOVER: {hovered ? `(${hovered.coord.row}, ${hovered.coord.col}) - ${hovered.type}` : '-'}
				</div>
			</div>
		{/if}

		<div class="controls">
			<button class="reg-button" on:click={initMap} disabled={isAnimating}>Regenerate Map</button>
			<button class="dijkstra-button" on:click={runDijkstra} disabled={isLocked}
				>Run Dijkstra</button
			>
			<button class="dijkstra-button" on:click={runDijkstraAnimated} disabled={isLocked}
				>Run Dijkstra Animated</button
			>
		</div>

		{#if nodes.length > 0}
			<div class="board">
				{#each nodes as row}
					<div class="row">
						{#each row as node}
							<div
								class="tile {node.type.toLowerCase()}"
								role="button"
								tabindex="0"
								on:mouseenter={() => (hovered = node)}
								on:mouseleave={() => (hovered = null)}
							></div>
						{/each}
					</div>
				{/each}
			</div>
		{/if}

		{#if stats}
			<div class="stats">
				<ul>
					<li>Path length: {stats.pathLength}</li>
					<li>Path cost: {stats.pathCost}</li>
					<li>Visited nodes: {stats.visitedCount}</li>
				</ul>
			</div>
		{/if}
	</div>
</main>
