<script lang="ts">
	import type { Node } from '$lib/pathfinding/map';
	import type { DijkstraResult } from '$lib/pathfinding/dijkstra';
	import { Map } from '$lib/pathfinding/map';
	import { dijkstra } from '$lib/pathfinding/dijkstra';
	import './Pathfinding.css';

	const rows = 50;
	const cols = 50;
	const block_percentage = 15;

	let map: Map;
	let nodes: Node[][] = [];
	let hovered: Node | null = null;
	let stats: DijkstraResult | null = null;

	function initMap() {
		map = new Map(rows, cols, block_percentage);
		nodes = map.getNodes().map((row) => [...row]); // shallow copy for Svelte reactivity
		hovered = null;
		stats = null;
	}

	function runDijkstra() {
		stats = dijkstra(map); // marks PATH nodes on the Map
		nodes = map.getNodes().map((row) => [...row]); // trigger reactivity
	}

	initMap();
</script>

<main>
	<div class="content">
		{#if map}
			<div class="info">
				<div>START: ({map.startNode.coord.row}, {map.startNode.coord.col})</div>
				<div>END: ({map.endNode.coord.row}, {map.endNode.coord.col})</div>
			</div>
		{/if}

		<div class="controls">
			<button class="reg-button" on:click={initMap}>Regenerate Map</button>
			<button class="dijkstra-button" on:click={runDijkstra}>Run Dijkstra</button>
			<span class="hover-info">
				Hovered: {hovered ? `(${hovered.coord.row}, ${hovered.coord.col}) - ${hovered.type}` : '-'}
			</span>
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
