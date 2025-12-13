import type { Node, Map, TileType } from '$lib/pathfinding/map';

/** Info stored per node during Dijkstra */
interface NodeInfo {
	node: Node;
	distance: number;
	visited: boolean;
	prev: Node | null;
}

export interface DijkstraResult {
	path: Node[];
	visitedCount: number;
	pathLength: number;
	pathCost: number;
}

export async function dijkstraAnimated(
	map: Map,
	delay: number = 50,
	updateUI?: () => void
): Promise<DijkstraResult> {
	const rows = map.rows;
	const cols = map.cols;
	const nodes = map.getNodes();
	const startNode = map.startNode;
	const endNode = map.endNode;

	const nodeInfos = initializeNodeInfos(nodes, rows, cols);
	nodeInfos[startNode.coord.row][startNode.coord.col].distance = 0;

	let visitedCount = 0;
	const queue: NodeInfo[] = [nodeInfos[startNode.coord.row][startNode.coord.col]];

	while (queue.length > 0) {
		queue.sort((a, b) => a.distance - b.distance);
		const current = queue.shift()!;
		if (current.visited) continue;
		current.visited = true;
		visitedCount++;

		if (current.node.type !== 'START' && current.node.type !== 'END') {
			current.node.type = 'DIJKSTRA_VISITED';
		}

		if (updateUI) updateUI();
		await new Promise((r) => setTimeout(r, delay));

		if (current.node.type === 'END') break;

		for (const neighbor of current.node.neighbors) {
			const neighborInfo = nodeInfos[neighbor.coord.row][neighbor.coord.col];
			if (neighborInfo.visited) continue;

			const alt = current.distance + 1;
			if (alt < neighborInfo.distance) {
				neighborInfo.distance = alt;
				neighborInfo.prev = current.node;
				queue.push(neighborInfo);
			}
		}
	}

	// Reconstruct path
	const path = reconstructPath(nodeInfos, startNode, endNode);
	markPath(path);

	const pathLength = path.length;
	const pathCost = pathLength > 0 ? pathLength - 1 : 0;

	return {
		path,
		visitedCount,
		pathLength,
		pathCost
	};
}

/**
 * Dijkstra algorithm working directly with Map.
 * Marks visited nodes with 'DIJKSTRA_VISITED' and final path with 'PATH'.
 */
export function dijkstra(map: Map): DijkstraResult {
	const rows = map.rows;
	const cols = map.cols;
	const nodes = map.getNodes();
	const startNode = map.startNode;
	const endNode = map.endNode;

	if (!startNode || !endNode) {
		console.warn('START or END node is missing');
		return { path: [], visitedCount: 0, pathLength: 0, pathCost: 0 };
	}

	const nodeInfos = initializeNodeInfos(nodes, rows, cols);
	nodeInfos[startNode.coord.row][startNode.coord.col].distance = 0;

	let visitedCount = 0;

	const queue: NodeInfo[] = [nodeInfos[startNode.coord.row][startNode.coord.col]];

	while (queue.length > 0) {
		queue.sort((a, b) => a.distance - b.distance);
		const current = queue.shift()!;
		const { row, col } = current.node.coord;

		if (current.visited) continue;
		current.visited = true;
		visitedCount++;

		// Only mark visited nodes that are not START or END
		if (current.node.type !== 'START' && current.node.type !== 'END') {
			current.node.type = 'DIJKSTRA_VISITED' as TileType;
		}

		if (current.node.type === 'END') break;

		for (const neighbor of current.node.neighbors) {
			const neighborInfo = nodeInfos[neighbor.coord.row][neighbor.coord.col];
			if (neighborInfo.visited) continue;

			const altDistance = current.distance + 1;
			if (altDistance < neighborInfo.distance) {
				neighborInfo.distance = altDistance;
				neighborInfo.prev = current.node;
				queue.push(neighborInfo);
			}
		}
	}

	// Reconstruct path
	const path = reconstructPath(nodeInfos, startNode, endNode);

	// Mark final path nodes
	markPath(path);

	const pathLength = path.length;
	const pathCost = path.length > 0 ? path.length - 1 : 0;

	return {
		path,
		visitedCount,
		pathLength,
		pathCost
	};
}

function initializeNodeInfos(nodes: Node[][], rows: number, cols: number): NodeInfo[][] {
	return Array.from({ length: rows }, (_, r) =>
		Array.from({ length: cols }, (_, c) => ({
			node: nodes[r][c],
			distance: Infinity,
			visited: false,
			prev: null
		}))
	);
}

function reconstructPath(nodeInfos: NodeInfo[][], startNode: Node, endNode: Node): Node[] {
	const path: Node[] = [];
	let curr: Node | null = endNode;

	while (curr) {
		path.unshift(curr);
		curr = nodeInfos[curr.coord.row][curr.coord.col].prev;
	}

	if (path.length === 0 || path[0].type !== 'START') {
		console.warn('No valid path found');
		return [];
	}

	return path;
}

function markPath(path: Node[]) {
	for (const n of path) {
		if (n.type !== 'START' && n.type !== 'END') {
			n.type = 'PATH';
		}
	}
}
