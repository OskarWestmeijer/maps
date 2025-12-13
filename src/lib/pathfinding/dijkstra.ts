import type { TileType, Tile, Board } from '$lib/pathfinding/board';

export type Coord = { row: number; col: number };

/**
 * Dijkstra algorithm working directly with Board.
 * Marks the path by setting Tile.type = 'PATH' on the Board.
 */
export function dijkstraBoard(b: Board): Tile[] {
    console.log("Running dijkstra")
	const tiles = b.getTiles();
	const rows = tiles.length;
	const cols = tiles[0].length;

	let start: Tile = b.start
	let end: Tile = b.end;

	if (!start || !end) {
		console.log('START or END missing.');
		return [];
	}

	// Node info for Dijkstra
	const nodes: {
		tile: Tile;
		distance: number;
		visited: boolean;
		prev: Tile | null;
	}[][] = Array.from({ length: rows }, (_, r) =>
		Array.from({ length: cols }, (_, c) => ({
			tile: tiles[r][c],
			distance: Infinity,
			visited: false,
			prev: null
		}))
	);

	nodes[start.row][start.col].distance = 0;

	// Simple priority queue
	const queue = [nodes[start.row][start.col]];

	const directions = [
		{ row: -1, col: 0 },
		{ row: 1, col: 0 },
		{ row: 0, col: -1 },
		{ row: 0, col: 1 }
	];

	while (queue.length > 0) {
		queue.sort((a, b) => a.distance - b.distance);
		const current = queue.shift()!;
		const { row, col } = current.tile;

		if (current.visited) continue;
		current.visited = true;

		if (current.tile.type === 'END') break;

		for (const dir of directions) {
			const nr = row + dir.row;
			const nc = col + dir.col;
			if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;

			const neighborNode = nodes[nr][nc];
			if (neighborNode.tile.type === 'BLOCK') continue;

			const alt = current.distance + 1;
			if (alt < neighborNode.distance) {
				neighborNode.distance = alt;
				neighborNode.prev = current.tile;
				if (!neighborNode.visited) queue.push(neighborNode);
			}
		}
	}

	// Reconstruct path
	const path: Tile[] = [];
	let curr: Tile | null = end;

	while (curr) {
		path.unshift(curr);
		curr = nodes[curr.row][curr.col].prev;
	}

	// Check path validity
	if (path.length === 0 || path[0].type !== 'START') {
		console.log('No path found from START to END.');
		return [];
	}

	// Mark path on board (excluding START and END)
	for (const t of path) {
		if (t.type !== 'START' && t.type !== 'END') {
			t.type = 'PATH';
		}
	}

	return path;
}
