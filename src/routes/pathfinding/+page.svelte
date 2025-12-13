<script lang="ts">
	import type { TileType, Tile } from '$lib/pathfinding/board';
	import { Board } from '$lib/pathfinding/board';
	import { dijkstraBoard } from '$lib/pathfinding/dijkstra';
	import './Pathfinding.css';

	const rows = 50;
	const cols = 50;
	const block_percentage = 15;

	let b: Board;
	let board: Tile[][] = [];
	let hovered: Tile | null = null;

	function initBoard() {
		b = new Board(rows, cols, block_percentage);
		board = b.getTiles().map((row) => [...row]); // trigger reactivity
		hovered = null;
	}

	function runDijkstra() {
		dijkstraBoard(b); // marks PATH tiles
		board = b.getTiles().map((row) => [...row]); // shallow copy to trigger UI update
	}

	initBoard();
</script>

<main>
	<div class="content">
		{#if b}
			<div class="info">
				<div>START: ({b.start.row}, {b.start.col})</div>
				<div>END: ({b.end.row}, {b.end.col})</div>
			</div>
		{/if}

		<div class="controls">
			<button class="reg-button" on:click={initBoard}>Regenerate Board</button>
			<button class="dijkstra-button" on:click={runDijkstra}>Run Dijkstra</button>
			<span class="hover-info">
				Hovered: {hovered ? `(${hovered.row}, ${hovered.col}) - ${hovered.type}` : '-'}
			</span>
		</div>

		{#if board.length > 0}
			<div class="board">
				{#each board as row}
					<div class="row">
						{#each row as tile}
							<div
								class="tile {tile.type.toLowerCase()}"
								on:mouseenter={() => (hovered = tile)}
								on:mouseleave={() => (hovered = null)}
							></div>
						{/each}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</main>
