import type { TileType, Node, Map } from '$lib/pathfinding/map';

/** Info stored per node during Dijkstra */
interface NodeInfo {
	node: Node;
	distance: number;
	visited: boolean;
	prev: Node | null;
}

/**
 * Dijkstra algorithm working directly with Map.
 * Marks the path by setting Node.type = 'PATH' on the Map.
 */
export function dijkstra(map: Map): Node[] {
	console.log('Running Dijkstra on Map');

	const rows = map.rows;
	const cols = map.cols;
	const nodes = map.getNodes();
	const startNode = map.startNode;
	const endNode = map.endNode;

	if (!startNode || !endNode) {
		console.warn('START or END node is missing');
		return [];
	}

	// Initialize NodeInfo grid
	const nodeInfos = initializeNodeInfos(nodes, rows, cols);
	nodeInfos[startNode.coord.row][startNode.coord.col].distance = 0;

	// Run Dijkstra
	runDijkstra(nodeInfos, startNode, endNode);

	// Reconstruct path
	const path = reconstructPath(nodeInfos, startNode, endNode);

	// Mark path on the map
	markPath(path);

	return path;
}

/** Initialize NodeInfo grid from Node grid */
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

/** Execute the main Dijkstra loop */
function runDijkstra(nodeInfos: NodeInfo[][], startNode: Node, endNode: Node) {
	const queue: NodeInfo[] = [nodeInfos[startNode.coord.row][startNode.coord.col]];

	while (queue.length > 0) {
		// Node with smallest distance
		queue.sort((a, b) => a.distance - b.distance);
		const current = queue.shift()!;
		const { row, col } = current.node.coord;

		if (current.visited) continue;
		current.visited = true;

		if (current.node.type === 'END') break;

		// Visit neighbors
		for (const neighbor of current.node.neighbors) {
			const neighborInfo = nodeInfos[neighbor.coord.row][neighbor.coord.col];
			if (neighborInfo.visited) continue;

			const altDistance = current.distance + 1; // edge weight
			if (altDistance < neighborInfo.distance) {
				neighborInfo.distance = altDistance;
				neighborInfo.prev = current.node;
				queue.push(neighborInfo);
			}
		}
	}
}

/** Reconstruct the path from END back to START */
function reconstructPath(nodeInfos: NodeInfo[][], startNode: Node, endNode: Node): Node[] {
	const path: Node[] = [];
	let curr: Node | null = endNode;

	while (curr) {
		path.unshift(curr);
		curr = nodeInfos[curr.coord.row][curr.coord.col].prev;
	}

	// Validate path
	if (path.length === 0 || path[0].type !== 'START') {
		console.warn('No valid path found');
		return [];
	}

	return path;
}

/** Mark the path nodes on the map */
function markPath(path: Node[]) {
	for (const n of path) {
		if (n.type !== 'START' && n.type !== 'END') {
			n.type = 'PATH';
		}
	}
}
