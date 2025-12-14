export interface Graph {
	nodes: Node[];
	start: Node;
}

export interface Node {
	id: string;
	neighbors: Neighbor[];
	visited: boolean;
	distance: number;
}

export interface Neighbor {
	node: Node;
	edgeWeight: number;
}

/**
 * Generates a random graph with the given number of nodes.
 * The first created node is the start node.
 * Each node has between 1–maxNeighbors random neighbors with random edge weights (1–maxEdgeWeight).
 *
 * @param nodeCount - Number of nodes to generate
 * @param maxNeighbors - Maximum number of neighbors per node (default: 3)
 * @param maxEdgeWeight - Maximum edge weight (default: 10)
 */
export function generateGraph(
	nodeCount: number,
	maxNeighbors: number = 3,
	maxEdgeWeight: number = 10
): Graph {
	console.log(
		`Generating graph: ${nodeCount} nodes, up to ${maxNeighbors} neighbors, max weight ${maxEdgeWeight}`
	);

	if (nodeCount < 1) {
		throw new Error('Graph must contain at least one node.');
	}

	// Step 1: Create all nodes with letter IDs (A, B, C, ...)
	const nodes: Node[] = Array.from({ length: nodeCount }, (_, i) => ({
		id: String.fromCharCode(65 + i), // 'A', 'B', 'C', ...
		neighbors: [],
		visited: false,
		distance: Infinity
	}));

	// Step 2: Randomly assign neighbors
	for (const node of nodes) {
		const neighborCount = Math.floor(Math.random() * maxNeighbors) + 1; // 1–maxNeighbors

		// Choose random unique neighbors different from the node itself
		const possibleNeighbors = nodes.filter((n) => n.id !== node.id);
		const chosenNeighbors = shuffleArray(possibleNeighbors).slice(0, neighborCount);

		for (const neighbor of chosenNeighbors) {
			const edgeWeight = Math.floor(Math.random() * maxEdgeWeight) + 1; // 1–maxEdgeWeight

			// Add neighbor if not already present
			if (!node.neighbors.some((n) => n.node.id === neighbor.id)) {
				node.neighbors.push({ node: neighbor, edgeWeight });
			}

			// Ensure bidirectional edges (undirected graph)
			if (!neighbor.neighbors.some((n) => n.node.id === node.id)) {
				neighbor.neighbors.push({ node, edgeWeight });
			}
		}
	}

	// Step 3: Return graph
	return {
		nodes,
		start: nodes[0]
	};
}

/**
 * Helper: returns a shuffled copy of an array
 */
function shuffleArray<T>(array: T[]): T[] {
	return array
		.map((item) => ({ item, sort: Math.random() }))
		.sort((a, b) => a.sort - b.sort)
		.map(({ item }) => item);
}
