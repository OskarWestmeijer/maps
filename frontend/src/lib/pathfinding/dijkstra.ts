import type { Graph, Node } from './graph';

/**
 * Runs Dijkstra's algorithm on the given graph starting from graph.start.
 * Mutates the graph's nodes (updates distance and visited fields).
 * Returns a map of shortest distances and the previous-node path tree.
 */
export function runDijkstra(graph: Graph) {
	const start = graph.start;
	start.distance = 0;

	// Previous node map for path reconstruction
	const previous = new Map<string, Node | null>();
	graph.nodes.forEach((n) => previous.set(n.id, null));

	const unvisited = new Set<Node>(graph.nodes);

	while (unvisited.size > 0) {
		// Pick the unvisited node with the smallest distance
		let current: Node | undefined = undefined;
		for (const node of unvisited) {
			if (!current || node.distance < current.distance) {
				current = node;
			}
		}

		if (!current) break;
		if (current.distance === Infinity) break; // Remaining nodes unreachable

		// Visit this node
		unvisited.delete(current);
		current.visited = true;

		// Update neighbor distances
		for (const neighbor of current.neighbors) {
			if (neighbor.node.visited) continue;

			const newDist = current.distance + neighbor.edgeWeight;
			if (newDist < neighbor.node.distance) {
				neighbor.node.distance = newDist;
				previous.set(neighbor.node.id, current);
			}
		}
	}

	// Build result maps
	const distances = new Map<string, number>();
	graph.nodes.forEach((n) => distances.set(n.id, n.distance));

	return { distances, previous };
}

/**
 * Reconstructs the shortest path from start to a target node.
 * Returns an array of node IDs representing the path in order.
 */
export function reconstructPath(targetId: string, previous: Map<string, Node | null>): string[] {
	const path: string[] = [];
	let currentId: string | null = targetId;

	while (currentId) {
		path.unshift(currentId);
		const prevNode = previous.get(currentId);
		currentId = prevNode ? prevNode.id : null;
	}

	return path;
}
